import { describe, expect, test } from "vitest";
import {
  buildStudyPackInstructions,
  buildStudyPackText,
  distributeStudyPackCorrectAnswers,
} from "./study-pack";

describe("buildStudyPackText", () => {
  test("renders board-style MCQ output with answer keys by section", () => {
    const text = buildStudyPackText({
      title: "ASOPRS Study Pack",
      contentMode: "mcq",
      sections: [
        {
          title: "17 Cicatricial Entropion",
          mcqs: [
            {
              question: "The key abnormality in cicatricial entropion is:",
              options: [
                "Posterior lamellar scarring",
                "Levator dehiscence",
                "Isolated canthal laxity",
              ],
              correctIndex: 0,
              explanation: "Posterior lamellar shortening rotates the margin inward.",
            },
          ],
          flashcards: [],
        },
      ],
    });

    expect(text).toContain("ASOPRS Study Pack");
    expect(text).toContain("17 Cicatricial Entropion");
    expect(text).toContain("1. The key abnormality in cicatricial entropion is:");
    expect(text).toContain("A. Posterior lamellar scarring");
    expect(text).toContain("B. Levator dehiscence");
    expect(text).toContain("C. Isolated canthal laxity");
    expect(text).toContain("ANSWER KEY");
    expect(text).toContain("1-A");
  });

  test("renders combined mcq and flashcard output in one export", () => {
    const text = buildStudyPackText({
      title: "Combined Set",
      contentMode: "both",
      sections: [
        {
          title: "19 Epiblepharon",
          mcqs: [
            {
              question: "Epiblepharon is most common in:",
              options: ["Adults", "Asian children", "Only neonates"],
              correctIndex: 1,
              explanation: "It is classically seen in Asian children.",
            },
          ],
          flashcards: [
            {
              front: "What distinguishes epiblepharon from entropion?",
              back: "The lid margin is not truly inverted in epiblepharon.",
            },
          ],
        },
      ],
    });

    expect(text).toContain("MCQS");
    expect(text).toContain("FLASHCARDS");
    expect(text).toContain("Q1. What distinguishes epiblepharon from entropion?");
    expect(text).toContain(
      "A1. The lid margin is not truly inverted in epiblepharon."
    );
  });

  test("builds dynamic instructions from requested counts and mode", () => {
    const instructions = buildStudyPackInstructions({
      contentMode: "both",
      mcqCount: 40,
      flashcardCount: 22,
    });

    expect(instructions).toContain(
      "exactly 40 board-style multiple-choice questions"
    );
    expect(instructions).toContain("exactly 22 high-yield flashcards");
    expect(instructions).toContain("exactly 3 answer choices");
    expect(instructions).toContain(
      "Distribute correct answers as evenly as possible across A, B, and C"
    );
  });
});

describe("distributeStudyPackCorrectAnswers", () => {
  test("evenly varies answer positions while preserving the correct answer text", () => {
    const mcqs = Array.from({ length: 25 }, (_, index) => ({
      question: `Question ${index + 1}`,
      options: [
        `Correct ${index + 1}`,
        `Distractor one ${index + 1}`,
        `Distractor two ${index + 1}`,
      ] as [string, string, string],
      correctIndex: 0,
      explanation: `Explanation ${index + 1}`,
    }));

    const distributed = distributeStudyPackCorrectAnswers(mcqs);
    const answerCounts = [0, 0, 0];

    distributed.forEach((mcq, index) => {
      answerCounts[mcq.correctIndex] += 1;
      expect(mcq.options[mcq.correctIndex]).toBe(`Correct ${index + 1}`);
      expect(mcq.question).toBe(`Question ${index + 1}`);
      expect(mcq.explanation).toBe(`Explanation ${index + 1}`);
      if (index > 0) {
        expect(mcq.correctIndex).not.toBe(distributed[index - 1].correctIndex);
      }
    });

    expect(Math.max(...answerCounts) - Math.min(...answerCounts)).toBeLessThanOrEqual(1);
  });
});
