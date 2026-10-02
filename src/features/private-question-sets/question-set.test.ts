import { describe, expect, it } from "vitest";
import {
  applyProgressUpdate,
  filterQuestions,
  isMissed,
  listSections,
  presentQuestion,
  seededShuffle,
  summarizeProgress,
  type PrivateQuestion,
  type QuestionProgress,
} from "./question-set";

function mcq(id: string, section: string, correctIndex = 1): PrivateQuestion {
  return {
    id,
    position: Number(id.replace(/\D/g, "")) || 1,
    section,
    question: `Question ${id}`,
    options: ["Alpha", "Bravo", "Charlie", "Delta", "Echo"],
    correctIndex,
    answer: ["Alpha", "Bravo", "Charlie", "Delta", "Echo"][correctIndex],
    explanation: null,
    pearl: null,
  };
}

function recall(id: string, section: string): PrivateQuestion {
  return {
    id,
    position: Number(id.replace(/\D/g, "")) || 1,
    section,
    question: `Recall ${id}`,
    options: [],
    correctIndex: null,
    answer: "Answer",
    explanation: null,
    pearl: null,
  };
}

const QUESTIONS = [mcq("q1", "Ptosis"), mcq("q2", "Orbit"), recall("q3", "Ptosis"), recall("q4", "Lacrimal")];

describe("private question set helpers", () => {
  it("lists sections in first-seen order with counts", () => {
    expect(listSections(QUESTIONS)).toEqual([
      { name: "Ptosis", count: 2 },
      { name: "Orbit", count: 1 },
      { name: "Lacrimal", count: 1 },
    ]);
  });

  it("filters by section, kind and missed status", () => {
    const progress: Record<string, QuestionProgress> = {
      q1: { cardResult: "missed", quizResult: null, quizAttempts: 0, quizCorrect: 0 },
      q3: { cardResult: "got_it", quizResult: "incorrect", quizAttempts: 1, quizCorrect: 0 },
      q4: { cardResult: "got_it", quizResult: null, quizAttempts: 0, quizCorrect: 0 },
    };

    expect(filterQuestions(QUESTIONS, { section: "Ptosis", kind: "all", onlyMissed: false }, {}).map((q) => q.id)).toEqual([
      "q1",
      "q3",
    ]);
    expect(filterQuestions(QUESTIONS, { section: "all", kind: "mcq", onlyMissed: false }, {}).map((q) => q.id)).toEqual([
      "q1",
      "q2",
    ]);
    expect(filterQuestions(QUESTIONS, { section: "all", kind: "recall", onlyMissed: false }, {}).map((q) => q.id)).toEqual([
      "q3",
      "q4",
    ]);
    expect(
      filterQuestions(QUESTIONS, { section: "all", kind: "all", onlyMissed: true }, progress).map((q) => q.id),
    ).toEqual(["q1", "q3"]);
  });

  it("shuffles answer choices deterministically while keeping the correct answer", () => {
    const question = mcq("q9", "Orbit", 1);
    const first = presentQuestion(question, { shuffle: true, seed: 42 });
    const second = presentQuestion(question, { shuffle: true, seed: 42 });

    expect(first).toEqual(second);
    expect([...first.options].sort()).toEqual([...question.options].sort());
    expect(first.options[first.correctIndex as number]).toBe("Bravo");
  });

  it("spreads the correct letter across positions when shuffling", () => {
    const positions = new Set<number>();
    for (let i = 0; i < 40; i++) {
      const presented = presentQuestion(mcq(`q${i}`, "Orbit", 1), { shuffle: true, seed: 7 });
      positions.add(presented.correctIndex as number);
    }
    expect(positions.size).toBeGreaterThan(2);
  });

  it("leaves choices alone when shuffling is off or the question is rapid recall", () => {
    const question = mcq("q1", "Orbit", 3);
    expect(presentQuestion(question, { shuffle: false, seed: 1 })).toEqual({
      options: question.options,
      correctIndex: 3,
    });
    expect(presentQuestion(recall("q2", "Orbit"), { shuffle: true, seed: 1 })).toEqual({
      options: [],
      correctIndex: null,
    });
  });

  it("seeded shuffle is a stable permutation", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffled = seededShuffle(items, 99);
    expect(seededShuffle(items, 99)).toEqual(shuffled);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("applies card and quiz updates to progress", () => {
    const afterCard = applyProgressUpdate(undefined, { cardResult: "missed" });
    expect(afterCard).toEqual({ cardResult: "missed", quizResult: null, quizAttempts: 0, quizCorrect: 0 });
    expect(isMissed(afterCard)).toBe(true);

    const afterQuiz = applyProgressUpdate(afterCard, { quizResult: "correct" });
    expect(afterQuiz).toEqual({ cardResult: "missed", quizResult: "correct", quizAttempts: 1, quizCorrect: 1 });

    const afterRecovery = applyProgressUpdate(afterQuiz, { cardResult: "got_it" });
    expect(isMissed(afterRecovery)).toBe(false);
  });

  it("summarizes reviewed and missed counts", () => {
    expect(
      summarizeProgress(QUESTIONS, {
        q1: { cardResult: "got_it", quizResult: null, quizAttempts: 0, quizCorrect: 0 },
        q2: { cardResult: null, quizResult: "incorrect", quizAttempts: 1, quizCorrect: 0 },
      }),
    ).toEqual({ reviewed: 2, missed: 1 });
  });
});
