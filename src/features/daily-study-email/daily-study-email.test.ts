import { describe, expect, test } from "vitest";
import {
  buildDailyStudyEmail,
  pickDailyIndexes,
  type DailyFact,
  type DailyQuestion,
} from "./daily-study-email";

const facts: DailyFact[] = [
  {
    id: "fact-1",
    prompt: "What structure elevates the upper lid?",
    fact: "The levator palpebrae superioris is the primary upper-lid elevator.",
    sourceTitle: "Eyelid Anatomy & Physiology",
  },
];

const questions: DailyQuestion[] = [
  {
    id: "question-1",
    stem: "Which finding most strongly suggests an orbital compartment syndrome?",
    options: ["Chemosis alone", "Reduced vision with a tense orbit", "Mild ecchymosis"],
    correctIndex: 1,
    explanation: "Vision loss with a tense orbit signals optic nerve or retinal ischemia and needs urgent decompression.",
    sourceTitle: "Orbital Trauma <Review>",
  },
];

describe("pickDailyIndexes", () => {
  test("returns a stable, unique sample for a given day and content type", () => {
    const first = pickDailyIndexes(25, 6, "2026-08-13:questions");
    const retry = pickDailyIndexes(25, 6, "2026-08-13:questions");

    expect(retry).toEqual(first);
    expect(first).toHaveLength(6);
    expect(new Set(first).size).toBe(6);
    expect(first.every((index) => index >= 0 && index < 25)).toBe(true);
  });

  test("does not request more records than exist", () => {
    expect(pickDailyIndexes(2, 5, "small-bank")).toHaveLength(2);
    expect(pickDailyIndexes(0, 5, "empty-bank")).toEqual([]);
  });
});

describe("buildDailyStudyEmail", () => {
  test("renders a mobile-first five-minute drill with answers after the questions", () => {
    const email = buildDailyStudyEmail({
      date: "2026-08-13",
      facts,
      questions,
      appUrl: "https://asoprs.app",
    });

    expect(email.subject).toBe("Irena’s 5-minute ASOPRS drill — Aug 13");
    expect(email.html).toContain('name="viewport"');
    expect(email.html).toContain("width:100%");
    expect(email.html).toContain("5-minute drill");
    expect(email.html).toContain("Rapid recall");
    expect(email.html).toContain("Board-style questions");
    expect(email.html.indexOf("Which finding most strongly")).toBeLessThan(
      email.html.indexOf("Answer key")
    );
    expect(email.html).toContain("B. Reduced vision with a tense orbit");
    expect(email.html).toContain("Orbital Trauma &lt;Review&gt;");
    expect(email.html).not.toContain("Orbital Trauma <Review>");
    expect(email.text).toContain("ANSWERS");
    expect(email.text).toContain("1. B — Reduced vision with a tense orbit");
  });

  test("keeps an empty bank useful instead of producing broken markup", () => {
    const email = buildDailyStudyEmail({
      date: "2026-08-13",
      facts: [],
      questions: [],
      appUrl: "https://asoprs.app",
    });

    expect(email.html).toContain("No study items were available today");
    expect(email.text).toContain("No study items were available today");
  });
});
