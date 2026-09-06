import { beforeEach, describe, expect, test, vi } from "vitest";

const { generateContent } = vi.hoisted(() => ({
  generateContent: vi.fn(),
}));

vi.mock("@/lib/gemini", () => ({
  getGemini: () => ({
    models: { generateContent },
  }),
}));

import { generateStudyPack } from "./study-pack-server";

describe("generateStudyPack", () => {
  beforeEach(() => {
    generateContent.mockReset();
  });

  test("requests and preserves concise memory lines for MCQ answer keys", async () => {
    generateContent.mockResolvedValue({
      text: JSON.stringify({
        mcqs: [
          {
            question: "When do postoperative seromas most often appear?",
            options: ["Within 24 hours", "Days 5-7", "After 6 weeks"],
            correctIndex: 1,
            explanation: "Seromas usually present 5-7 days after surgery.",
          },
        ],
        highYieldPearls: [
          " Seroma = a painless fluid collection, typically on days 5-7. ",
          "",
          "seroma = a painless fluid collection, typically on days 5-7.",
          "Hematoma is the most common early complication and usually appears within 24 hours.",
        ],
      }),
    });

    const pack = await generateStudyPack({
      documents: [
        {
          id: "facelift",
          title: "Facelift Complications",
          content: "Hematomas usually occur early. Seromas present later.",
        },
      ],
      contentMode: "mcq",
      instructions: "",
      mcqCount: 1,
      flashcardCount: 1,
    });

    expect(generateContent).toHaveBeenCalledOnce();
    const request = generateContent.mock.calls[0][0];
    expect(request.contents).toContain('"highYieldPearls"');
    expect(request.contents).toContain(
      "derive each memory line from the correct answers and explanations"
    );
    expect(pack.sections[0].highYieldPearls).toEqual([
      "Seroma = a painless fluid collection, typically on days 5-7.",
      "Hematoma is the most common early complication and usually appears within 24 hours.",
    ]);
  });
});
