import { describe, expect, test } from "vitest";
import { getPageCategory, getFeedbackType } from "./page-categories";

describe("getPageCategory", () => {
  test("returns correct category for each known path", () => {
    expect(getPageCategory("/admin")).toBe("admin");
    expect(getPageCategory("/admin/settings")).toBe("admin");
    expect(getPageCategory("/flashcards")).toBe("study-flashcards");
    expect(getPageCategory("/flashcards/123")).toBe("study-flashcards");
    expect(getPageCategory("/quiz")).toBe("study-quiz");
    expect(getPageCategory("/quiz/start")).toBe("study-quiz");
    expect(getPageCategory("/read")).toBe("study-reader");
    expect(getPageCategory("/read/some-pdf")).toBe("study-reader");
    expect(getPageCategory("/chat")).toBe("study-chat");
    expect(getPageCategory("/chat/session")).toBe("study-chat");
    expect(getPageCategory("/mindmap")).toBe("study-mindmap");
    expect(getPageCategory("/mindmap/topic")).toBe("study-mindmap");
    expect(getPageCategory("/study-resources")).toBe("study-resources");
    expect(getPageCategory("/study-resources/upload")).toBe("study-resources");
    expect(getPageCategory("/progress")).toBe("study-progress");
    expect(getPageCategory("/progress/weekly")).toBe("study-progress");
  });

  test("returns 'general' for unknown paths", () => {
    expect(getPageCategory("/")).toBe("general");
    expect(getPageCategory("/settings")).toBe("general");
    expect(getPageCategory("/unknown-page")).toBe("general");
    expect(getPageCategory("/login")).toBe("general");
  });
});

describe("getFeedbackType", () => {
  test("returns 'builder' for admin on admin pages", () => {
    expect(getFeedbackType("admin", "admin")).toBe("builder");
  });

  test("returns 'builder' for admin on any page", () => {
    expect(getFeedbackType("admin", "study-flashcards")).toBe("builder");
    expect(getFeedbackType("admin", "general")).toBe("builder");
    expect(getFeedbackType("admin", "study-quiz")).toBe("builder");
  });

  test("returns 'builder' for builder role on any page", () => {
    expect(getFeedbackType("builder", "admin")).toBe("builder");
    expect(getFeedbackType("builder", "study-flashcards")).toBe("builder");
    expect(getFeedbackType("builder", "general")).toBe("builder");
  });

  test("returns 'user' for regular user on any page", () => {
    expect(getFeedbackType("user", "admin")).toBe("user");
    expect(getFeedbackType("user", "study-flashcards")).toBe("user");
    expect(getFeedbackType("user", "general")).toBe("user");
  });

  test("returns 'user' for tester role on any page", () => {
    expect(getFeedbackType("tester", "admin")).toBe("user");
    expect(getFeedbackType("tester", "study-flashcards")).toBe("user");
  });
});
