import type { getServiceClient } from "@/lib/supabase";
import { pickDailyIndexes, type DailyFact, type DailyQuestion } from "./daily-study-email";

export interface FlashcardRecord {
  id: string;
  document_id: string;
  front: string;
  back: string;
}

export interface QuestionRecord {
  id: string;
  document_id: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  correct_index: number;
  explanation: string | null;
}

export interface DailyStudyRepository {
  countFacts(): Promise<number>;
  countQuestions(): Promise<number>;
  getFactAt(index: number): Promise<FlashcardRecord | null>;
  getQuestionAt(index: number): Promise<QuestionRecord | null>;
  getDocumentTitles(ids: string[]): Promise<Record<string, string>>;
}

export interface DailyStudyContent {
  facts: DailyFact[];
  questions: DailyQuestion[];
}

function clampCorrectIndex(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(2, Math.max(0, Math.floor(value)));
}

export async function loadDailyStudyContent(
  repository: DailyStudyRepository,
  date: string
): Promise<DailyStudyContent> {
  const [factCount, questionCount] = await Promise.all([
    repository.countFacts(),
    repository.countQuestions(),
  ]);
  const factIndexes = pickDailyIndexes(factCount, 3, `${date}:facts`);
  const questionIndexes = pickDailyIndexes(questionCount, 3, `${date}:questions`);
  const [factRecords, questionRecords] = await Promise.all([
    Promise.all(factIndexes.map((index) => repository.getFactAt(index))),
    Promise.all(questionIndexes.map((index) => repository.getQuestionAt(index))),
  ]);
  const availableFacts = factRecords.filter((record): record is FlashcardRecord => Boolean(record));
  const availableQuestions = questionRecords.filter(
    (record): record is QuestionRecord => Boolean(record)
  );
  const documentIds = Array.from(
    new Set([
      ...availableFacts.map((record) => record.document_id),
      ...availableQuestions.map((record) => record.document_id),
    ])
  );
  const documentTitles = await repository.getDocumentTitles(documentIds);

  return {
    facts: availableFacts.map((record) => ({
      id: record.id,
      prompt: record.front,
      fact: record.back,
      sourceTitle: documentTitles[record.document_id] || "ASOPRS study library",
    })),
    questions: availableQuestions.map((record) => ({
      id: record.id,
      stem: record.question,
      options: [record.option_a, record.option_b, record.option_c],
      correctIndex: clampCorrectIndex(record.correct_index),
      explanation: record.explanation || "Review this topic in the source material.",
      sourceTitle: documentTitles[record.document_id] || "ASOPRS study library",
    })),
  };
}

type SupabaseClient = ReturnType<typeof getServiceClient>;

export function createSupabaseDailyStudyRepository(
  client: SupabaseClient
): DailyStudyRepository {
  return {
    async countFacts() {
      const { count, error } = await client
        .from("flashcards")
        .select("id", { count: "exact", head: true });
      if (error) throw new Error(`Unable to count flashcards: ${error.message}`);
      return count || 0;
    },
    async countQuestions() {
      const { count, error } = await client
        .from("mcq_questions")
        .select("id", { count: "exact", head: true });
      if (error) throw new Error(`Unable to count questions: ${error.message}`);
      return count || 0;
    },
    async getFactAt(index) {
      const { data, error } = await client
        .from("flashcards")
        .select("id, document_id, front, back")
        .order("id", { ascending: true })
        .range(index, index);
      if (error) throw new Error(`Unable to load flashcard: ${error.message}`);
      return (data?.[0] as FlashcardRecord | undefined) || null;
    },
    async getQuestionAt(index) {
      const { data, error } = await client
        .from("mcq_questions")
        .select(
          "id, document_id, question, option_a, option_b, option_c, correct_index, explanation"
        )
        .order("id", { ascending: true })
        .range(index, index);
      if (error) throw new Error(`Unable to load question: ${error.message}`);
      return (data?.[0] as QuestionRecord | undefined) || null;
    },
    async getDocumentTitles(ids) {
      if (ids.length === 0) return {};
      const { data, error } = await client
        .from("documents")
        .select("id, title")
        .in("id", ids);
      if (error) throw new Error(`Unable to load document titles: ${error.message}`);
      return Object.fromEntries(
        (data || []).map((document) => [document.id as string, document.title as string])
      );
    },
  };
}
