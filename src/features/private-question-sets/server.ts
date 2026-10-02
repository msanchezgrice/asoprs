import "server-only";

import type {
  CardResult,
  PrivateQuestion,
  QuestionProgress,
  QuizResult,
} from "@/features/private-question-sets/question-set";

export interface PrivateQuestionRow {
  id: string;
  position: number;
  section: string;
  question: string;
  options: string[] | null;
  correct_index: number | null;
  answer: string;
  explanation: string | null;
  pearl: string | null;
}

export interface PrivateQuestionProgressRow {
  question_id: string;
  card_result: CardResult | null;
  quiz_result: QuizResult | null;
  quiz_attempts: number | null;
  quiz_correct: number | null;
}

export function mapQuestionRow(row: PrivateQuestionRow): PrivateQuestion {
  const options = Array.isArray(row.options) ? row.options : [];
  const correctIndex =
    options.length > 0 &&
    Number.isInteger(row.correct_index) &&
    (row.correct_index as number) >= 0 &&
    (row.correct_index as number) < options.length
      ? (row.correct_index as number)
      : null;

  return {
    id: row.id,
    position: row.position,
    section: row.section,
    question: row.question,
    options: correctIndex === null ? [] : options,
    correctIndex,
    answer: row.answer,
    explanation: row.explanation,
    pearl: row.pearl,
  };
}

export function mapProgressRows(
  rows: PrivateQuestionProgressRow[],
): Record<string, QuestionProgress> {
  const progress: Record<string, QuestionProgress> = {};
  for (const row of rows) {
    progress[row.question_id] = {
      cardResult: row.card_result ?? null,
      quizResult: row.quiz_result ?? null,
      quizAttempts: row.quiz_attempts ?? 0,
      quizCorrect: row.quiz_correct ?? 0,
    };
  }
  return progress;
}

export function readMemorizeFirst(extras: unknown): string[] {
  if (!extras || typeof extras !== "object") return [];
  const value = (extras as { memorize_first?: unknown }).memorize_first;
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" } as const;
