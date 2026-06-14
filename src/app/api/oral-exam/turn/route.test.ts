import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { getInitialOralExamState } from "@/features/oral-exam/oral-exam";

const ORIGINAL_OPENAI_KEY = process.env.OPENAI_API_KEY;

describe("/api/oral-exam/turn", () => {
  afterEach(() => {
    process.env.OPENAI_API_KEY = ORIGINAL_OPENAI_KEY;
    vi.unstubAllGlobals();
  });

  it("uses OpenAI to evaluate the user's answer when configured", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          output_text: JSON.stringify({
            stage: "visual",
            examinerMessage:
              "Before I reveal more, give me a leading diagnosis and three differentials.",
            score: {
              diagnosis: 0,
              differential: 1,
              workup: 0,
              management: 0,
              total: 1,
            },
            sourceDisclosureAllowed: false,
            answerEvaluation: {
              candidateIntent: "answer_attempt",
              nextAction: "prompt_for_answer",
              requestedReveal: "none",
              validity: "partial",
              accepted: {
                diagnosis: [],
                differential: [],
                imageObservations: ["proptosis"],
                workup: [],
                management: [],
                counseling: [],
                surveillance: [],
              },
              missing: ["leading diagnosis", "differential"],
              rationale: "The candidate has not committed to a diagnosis.",
            },
            feedback: "The candidate has not committed to a diagnosis.",
          }),
        }),
      })
    );

    const response = await POST(
      new Request("http://localhost/api/oral-exam/turn", {
        method: "POST",
        body: JSON.stringify({
          oralCaseId: "orbital-rhabdomyosarcoma",
          state: getInitialOralExamState("orbital-rhabdomyosarcoma"),
          userText: "I see proptosis.",
          transcript: [],
        }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.state.stage).toBe("visual");
    expect(payload.examinerMessage).toContain("leading diagnosis");
  });

  it("falls back to the deterministic engine with answer-aware gating", async () => {
    delete process.env.OPENAI_API_KEY;

    const response = await POST(
      new Request("http://localhost/api/oral-exam/turn", {
        method: "POST",
        body: JSON.stringify({
          oralCaseId: "orbital-rhabdomyosarcoma",
          state: getInitialOralExamState("orbital-rhabdomyosarcoma"),
          userText: "What is the history and examination?",
          transcript: [],
        }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.state.stage).toBe("visual");
    expect(payload.answerEvaluation.nextAction).toBe("prompt_for_answer");
    expect(payload.examinerMessage).toContain("Before I reveal more");
  });
});
