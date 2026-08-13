import { describe, expect, test } from "vitest";
import {
  loadDailyStudyContent,
  type DailyStudyRepository,
  type FlashcardRecord,
  type QuestionRecord,
} from "./load-daily-study-content";

function makeRepository() {
  const facts: FlashcardRecord[] = Array.from({ length: 8 }, (_, index) => ({
    id: `fact-${index}`,
    document_id: `doc-${index % 2}`,
    front: `Recall prompt ${index}`,
    back: `Board pearl ${index}`,
  }));
  const questions: QuestionRecord[] = Array.from({ length: 9 }, (_, index) => ({
    id: `question-${index}`,
    document_id: `doc-${index % 2}`,
    question: `Question ${index}`,
    option_a: `A${index}`,
    option_b: `B${index}`,
    option_c: `C${index}`,
    correct_index: index % 3,
    explanation: `Explanation ${index}`,
  }));
  const factIndexes: number[] = [];
  const questionIndexes: number[] = [];

  const repository: DailyStudyRepository = {
    countFacts: async () => facts.length,
    countQuestions: async () => questions.length,
    getFactAt: async (index) => {
      factIndexes.push(index);
      return facts[index] ?? null;
    },
    getQuestionAt: async (index) => {
      questionIndexes.push(index);
      return questions[index] ?? null;
    },
    getDocumentTitles: async (ids) =>
      Object.fromEntries(ids.map((id) => [id, id === "doc-0" ? "Orbit" : "Lacrimal"])),
  };

  return { repository, factIndexes, questionIndexes };
}

describe("loadDailyStudyContent", () => {
  test("loads a stable three-and-three packet without duplicate offsets", async () => {
    const first = makeRepository();
    const retry = makeRepository();

    const firstPacket = await loadDailyStudyContent(first.repository, "2026-08-13");
    const retryPacket = await loadDailyStudyContent(retry.repository, "2026-08-13");

    expect(firstPacket).toEqual(retryPacket);
    expect(firstPacket.facts).toHaveLength(3);
    expect(firstPacket.questions).toHaveLength(3);
    expect(new Set(first.factIndexes).size).toBe(3);
    expect(new Set(first.questionIndexes).size).toBe(3);
    expect(firstPacket.facts[0]).toMatchObject({ sourceTitle: expect.any(String) });
    expect(firstPacket.questions[0].options).toHaveLength(3);
  });

  test("clamps malformed answer indexes before rendering", async () => {
    const { repository } = makeRepository();
    repository.countQuestions = async () => 1;
    repository.getQuestionAt = async () => ({
      id: "bad-answer",
      document_id: "doc-0",
      question: "Question",
      option_a: "A",
      option_b: "B",
      option_c: "C",
      correct_index: 99,
      explanation: "Explanation",
    });

    const packet = await loadDailyStudyContent(repository, "2026-08-13");

    expect(packet.questions[0].correctIndex).toBe(2);
  });
});
