import { describe, expect, it, vi } from "vitest";
import {
  buildOpenAIOralExamTurnRequest,
  createOpenAIOralExamTurn,
} from "./openai-turn";
import { getInitialOralExamState, type OralExamState } from "./oral-exam";

const PARTIAL_VISUAL_EVALUATION = {
  candidateIntent: "answer_attempt",
  nextAction: "prompt_for_answer",
  requestedReveal: "none",
  validity: "partial",
  accepted: {
    diagnosis: [],
    differential: ["orbital cellulitis"],
    imageObservations: ["proptosis"],
    workup: [],
    management: [],
    counseling: [],
    surveillance: [],
  },
  missing: ["leading diagnosis"],
  rationale: "The candidate noticed proptosis but has not committed.",
};

const SURRENDER_EVALUATION = {
  candidateIntent: "request_answer",
  nextAction: "coach_without_disclosing",
  requestedReveal: "answer",
  validity: "surrender",
  accepted: {
    diagnosis: [],
    differential: [],
    imageObservations: [],
    workup: [],
    management: [],
    counseling: [],
    surveillance: [],
  },
  missing: ["visible observations", "leading diagnosis", "differential"],
  rationale: "The candidate asked to be given the answer.",
};

const COMPLETE_EVALUATION = {
  candidateIntent: "ask_management",
  nextAction: "complete_case",
  requestedReveal: "answer",
  validity: "valid",
  accepted: {
    diagnosis: ["sebaceous carcinoma"],
    differential: [],
    imageObservations: [],
    workup: ["biopsy"],
    management: ["excision"],
    counseling: ["masquerade"],
    surveillance: ["follow-up"],
  },
  missing: [],
  rationale: "The candidate completed diagnosis and management.",
};

describe("OpenAI oral exam turn evaluator", () => {
  it("builds a structured request around the user's actual answer", () => {
    const state = getInitialOralExamState("orbital-rhabdomyosarcoma");
    const request = buildOpenAIOralExamTurnRequest({
      oralCaseId: "orbital-rhabdomyosarcoma",
      state,
      userText:
        "I see proptosis in a child. My differential includes cellulitis and malignancy. I want onset and motility.",
      transcript: [
        {
          role: "examiner",
          text: "Describe the image out loud as you would in an oral exam.",
        },
      ],
    });

    const serialized = JSON.stringify(request);

    expect(request.model).toBeTruthy();
    expect(serialized).toContain("My differential includes cellulitis");
    expect(serialized).toContain("currentStage");
    expect(serialized).toContain("oral board examiner");
    expect(serialized).toContain("Return JSON");
    expect(request.text.format.type).toBe("json_schema");
    expect(request.text.format.schema.properties.stage.enum).toEqual([
      "visual",
      "history",
      "workup",
      "management",
      "complete",
    ]);
    expect(serialized).toContain("localAnswerEvaluation");
    expect(serialized).toContain("answerEvaluation");
    expect(serialized).toContain("coach_without_disclosing");
  });

  it("includes non-spoiler visible image and exam material context", () => {
    const request = buildOpenAIOralExamTurnRequest({
      oralCaseId: "orbital-rhabdomyosarcoma",
      state: getInitialOralExamState("orbital-rhabdomyosarcoma"),
      userText: "Can you tell me what image you are showing?",
      transcript: [],
    });

    const serialized = JSON.stringify(request);

    expect(serialized).toContain("visibleImageFindings");
    expect(serialized).toContain("Figure 1");
    expect(serialized).toContain("painless proptosis");
    expect(serialized).toContain("Do not say you cannot see");
  });

  it("passes the prepared oral exam packet to the evaluator", () => {
    const request = buildOpenAIOralExamTurnRequest({
      oralCaseId: "orbital-rhabdomyosarcoma",
      state: getInitialOralExamState("orbital-rhabdomyosarcoma"),
      userText: "I see proptosis and would like to work through the case.",
      transcript: [],
    });

    const serialized = JSON.stringify(request);

    expect(serialized).toContain("preparedCase");
    expect(serialized).toContain("acceptableAnswers");
    expect(serialized).toContain("stageGates");
    expect(serialized).toContain("examinerScripts");
    expect(serialized).toContain("visualFollowUp");
  });

  it("redacts diagnosis-bearing figure context before completion", () => {
    const request = buildOpenAIOralExamTurnRequest({
      oralCaseId: "sebaceous-carcinoma",
      state: getInitialOralExamState("sebaceous-carcinoma"),
      userText: "What does the image show?",
      transcript: [],
    });

    const payload = JSON.parse(request.input[1].content) as {
      preparedCase: {
        visibleImageFindings: Array<{ caption: string; references: string[] }>;
      };
    };
    const materialSection = JSON.stringify(
      payload.preparedCase.visibleImageFindings
    ).toLowerCase();

    expect(materialSection).toContain("[redacted]");
    expect(materialSection).not.toContain("sebaceous");
    expect(materialSection).not.toContain("adenocarcinoma");
  });

  it("uses the model decision to keep the user working through the case", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          stage: "visual",
          examinerMessage:
            "You have described proptosis. Before I give you more data, tell me your leading diagnosis and at least three differentials.",
          score: {
            diagnosis: 0,
            differential: 2,
            workup: 0,
            management: 0,
            total: 2,
          },
          sourceDisclosureAllowed: false,
          answerEvaluation: PARTIAL_VISUAL_EVALUATION,
          feedback:
            "The candidate noticed the visual abnormality but has not committed to a diagnostic framework.",
        }),
      }),
    });

    const result = await createOpenAIOralExamTurn({
      apiKey: "sk-test",
      oralCaseId: "orbital-rhabdomyosarcoma",
      state: getInitialOralExamState("orbital-rhabdomyosarcoma"),
      userText: "There is proptosis.",
      transcript: [],
      fetchImpl,
    });

    expect(result.state.stage).toBe("visual");
    expect(result.examinerMessage).toContain("leading diagnosis");
    expect(result.examinerMessage).not.toContain("Case source");
    expect(result.revealedFigureIds).toEqual([
      "orbit-orbital-rhabdomyosarcoma-figure-1",
    ]);
    expect(result.score.total).toBe(2);
  });

  it("allows source disclosure only after the model completes the case", async () => {
    const state: OralExamState = {
      ...getInitialOralExamState("sebaceous-carcinoma"),
      stage: "management",
      turnCount: 3,
    };
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          stage: "complete",
          examinerMessage:
            "Final diagnosis: sebaceous carcinoma\n\nManagement: biopsy and margin-controlled excision.\n\nCounseling: this can masquerade as inflammation.\n\nSurveillance: long-term follow-up.\n\nCase source: source_image_simulated_case",
          score: {
            diagnosis: 2,
            differential: 2,
            workup: 2,
            management: 3,
            total: 9,
          },
          sourceDisclosureAllowed: true,
          answerEvaluation: COMPLETE_EVALUATION,
          feedback: "The candidate gave final diagnosis and management.",
        }),
      }),
    });

    const result = await createOpenAIOralExamTurn({
      apiKey: "sk-test",
      oralCaseId: "sebaceous-carcinoma",
      state,
      userText:
        "This is sebaceous carcinoma. I would biopsy, excise with margin control, counsel and surveil.",
      transcript: [],
      fetchImpl,
    });

    expect(result.state.stage).toBe("complete");
    expect(result.examinerMessage).toContain("Case source");
    expect(result.revealedFigureIds).toContain(
      "skin-conditions-sebaceous-adenocarcinoma-figure-7"
    );
  });

  it("does not complete or reveal the diagnosis when the user asks for the answer", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          stage: "complete",
          examinerMessage:
            "Final diagnosis: sebaceous carcinoma. Case source: source_image_simulated_case.",
          score: {
            diagnosis: 0,
            differential: 0,
            workup: 0,
            management: 0,
            total: 0,
          },
          sourceDisclosureAllowed: true,
          answerEvaluation: SURRENDER_EVALUATION,
          feedback: "The candidate asked for the answer.",
        }),
      }),
    });

    const result = await createOpenAIOralExamTurn({
      apiKey: "sk-test",
      oralCaseId: "sebaceous-carcinoma",
      state: getInitialOralExamState("sebaceous-carcinoma"),
      userText: "I don't know, just give me the answer.",
      transcript: [],
      fetchImpl,
    });

    expect(result.state.stage).toBe("visual");
    expect(result.answerEvaluation.nextAction).toBe("coach_without_disclosing");
    expect(result.answerEvaluation.validity).toBe("surrender");
    expect(result.examinerMessage.toLowerCase()).not.toContain("sebaceous");
    expect(result.examinerMessage.toLowerCase()).not.toContain("adenocarcinoma");
    expect(result.examinerMessage).not.toContain("Case source");
  });

  it("throws a useful error when OpenAI rejects the evaluator request", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "bad key",
    });

    await expect(
      createOpenAIOralExamTurn({
        apiKey: "sk-test",
        oralCaseId: "orbital-rhabdomyosarcoma",
        state: getInitialOralExamState("orbital-rhabdomyosarcoma"),
        userText: "I see proptosis.",
        transcript: [],
        fetchImpl,
      })
    ).rejects.toThrow("OpenAI oral exam turn request failed: 401 bad key");
  });
});
