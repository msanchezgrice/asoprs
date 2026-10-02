// Shared types and pure helpers for private (per-user) question sets.
// Question content lives in Supabase behind RLS — never in this repository.

export type CardResult = "got_it" | "missed";
export type QuizResult = "correct" | "incorrect";

export interface PrivateQuestion {
  id: string;
  position: number;
  section: string;
  question: string;
  options: string[];
  correctIndex: number | null;
  answer: string;
  explanation: string | null;
  pearl: string | null;
}

export interface QuestionProgress {
  cardResult: CardResult | null;
  quizResult: QuizResult | null;
  quizAttempts: number;
  quizCorrect: number;
}

export interface PrivateQuestionSetDetail {
  slug: string;
  title: string;
  description: string | null;
  memorizeFirst: string[];
  questions: PrivateQuestion[];
  progress: Record<string, QuestionProgress>;
}

export interface PrivateQuestionSetSummary {
  slug: string;
  title: string;
  description: string | null;
  questionCount: number;
  multipleChoiceCount: number;
  recallCount: number;
  reviewedCount: number;
  missedCount: number;
}

export type QuestionKind = "all" | "mcq" | "recall";

export interface QuestionFilter {
  section: string | "all";
  kind: QuestionKind;
  onlyMissed: boolean;
}

export const EMPTY_PROGRESS: QuestionProgress = {
  cardResult: null,
  quizResult: null,
  quizAttempts: 0,
  quizCorrect: 0,
};

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isMultipleChoice(question: PrivateQuestion): boolean {
  return question.options.length > 0 && question.correctIndex !== null;
}

export function optionLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

/** Missed = the most recent attempt in either mode was wrong. */
export function isMissed(progress: QuestionProgress | undefined): boolean {
  if (!progress) return false;
  return progress.cardResult === "missed" || progress.quizResult === "incorrect";
}

export function isReviewed(progress: QuestionProgress | undefined): boolean {
  if (!progress) return false;
  return progress.cardResult !== null || progress.quizResult !== null;
}

export function listSections(questions: PrivateQuestion[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const question of questions) {
    counts.set(question.section, (counts.get(question.section) ?? 0) + 1);
  }
  return [...counts.entries()].map(([name, count]) => ({ name, count }));
}

export function filterQuestions(
  questions: PrivateQuestion[],
  filter: QuestionFilter,
  progress: Record<string, QuestionProgress>,
): PrivateQuestion[] {
  return questions.filter((question) => {
    if (filter.section !== "all" && question.section !== filter.section) return false;
    if (filter.kind === "mcq" && !isMultipleChoice(question)) return false;
    if (filter.kind === "recall" && isMultipleChoice(question)) return false;
    if (filter.onlyMissed && !isMissed(progress[question.id])) return false;
    return true;
  });
}

/** Deterministic PRNG so a session's shuffles are stable across re-renders. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const result = [...items];
  const random = mulberry32(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export interface PresentedQuestion {
  options: string[];
  correctIndex: number | null;
}

/**
 * Returns the options in display order. When shuffling, the order is derived
 * from the session seed plus the question id, so it stays fixed for the session
 * and the answer letter on the back of a card matches the front.
 */
export function presentQuestion(
  question: PrivateQuestion,
  options: { shuffle: boolean; seed: number },
): PresentedQuestion {
  if (!isMultipleChoice(question) || !options.shuffle) {
    return { options: question.options, correctIndex: question.correctIndex };
  }

  const order = seededShuffle(
    question.options.map((_, index) => index),
    options.seed ^ hashString(question.id),
  );

  return {
    options: order.map((index) => question.options[index]),
    correctIndex: order.indexOf(question.correctIndex as number),
  };
}

export function summarizeProgress(
  questions: PrivateQuestion[],
  progress: Record<string, QuestionProgress>,
): { reviewed: number; missed: number } {
  let reviewed = 0;
  let missed = 0;
  for (const question of questions) {
    const entry = progress[question.id];
    if (isReviewed(entry)) reviewed++;
    if (isMissed(entry)) missed++;
  }
  return { reviewed, missed };
}

export function applyProgressUpdate(
  current: QuestionProgress | undefined,
  update: { cardResult?: CardResult; quizResult?: QuizResult },
): QuestionProgress {
  const base = current ?? EMPTY_PROGRESS;
  const next: QuestionProgress = { ...base };
  if (update.cardResult) next.cardResult = update.cardResult;
  if (update.quizResult) {
    next.quizResult = update.quizResult;
    next.quizAttempts = base.quizAttempts + 1;
    next.quizCorrect = base.quizCorrect + (update.quizResult === "correct" ? 1 : 0);
  }
  return next;
}
