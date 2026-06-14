import {
  buildOralExamAnswerEvaluation,
  getCaseById,
  getRevealedFigureIdsForStage,
  type OralExamAnswerEvaluation,
  type OralExamScore,
  type OralExamStage,
  type OralExamState,
  type OralExamTurnResult,
} from "./oral-exam";
import { buildPreparedOralExamCase } from "./prepared-case";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_ORAL_EXAM_EVALUATOR_MODEL = "gpt-4o-mini";

type FetchLike = typeof fetch;

type TranscriptMessage = {
  role: "examiner" | "candidate";
  text: string;
};

type OpenAIOralExamTurnInput = {
  oralCaseId: string;
  state: OralExamState;
  userText: string;
  transcript: TranscriptMessage[];
  model?: string;
};

type OpenAIOralExamTurnOptions = OpenAIOralExamTurnInput & {
  apiKey: string;
  fetchImpl?: FetchLike;
};

type ModelTurnDecision = {
  stage: OralExamStage;
  examinerMessage: string;
  score: OralExamScore;
  sourceDisclosureAllowed: boolean;
  answerEvaluation: OralExamAnswerEvaluation;
  feedback: string;
};

const ANSWER_EVALUATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "candidateIntent",
    "nextAction",
    "requestedReveal",
    "validity",
    "accepted",
    "missing",
    "rationale",
  ],
  properties: {
    candidateIntent: {
      type: "string",
      enum: [
        "answer_attempt",
        "ask_history",
        "ask_workup",
        "ask_management",
        "clarify_image",
        "request_answer",
        "off_track",
      ],
    },
    nextAction: {
      type: "string",
      enum: [
        "prompt_for_answer",
        "prompt_for_next_step",
        "reveal_history",
        "reveal_workup",
        "prompt_management",
        "complete_case",
        "clarify_image",
        "coach_without_disclosing",
      ],
    },
    requestedReveal: {
      type: "string",
      enum: ["none", "history", "workup", "management", "answer"],
    },
    validity: {
      type: "string",
      enum: ["valid", "partial", "invalid", "surrender"],
    },
    accepted: {
      type: "object",
      additionalProperties: false,
      required: [
        "diagnosis",
        "differential",
        "imageObservations",
        "workup",
        "management",
        "counseling",
        "surveillance",
      ],
      properties: {
        diagnosis: { type: "array", items: { type: "string" } },
        differential: { type: "array", items: { type: "string" } },
        imageObservations: { type: "array", items: { type: "string" } },
        workup: { type: "array", items: { type: "string" } },
        management: { type: "array", items: { type: "string" } },
        counseling: { type: "array", items: { type: "string" } },
        surveillance: { type: "array", items: { type: "string" } },
      },
    },
    missing: { type: "array", items: { type: "string" } },
    rationale: { type: "string" },
  },
} as const;

const TURN_DECISION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "stage",
    "examinerMessage",
    "score",
    "sourceDisclosureAllowed",
    "answerEvaluation",
    "feedback",
  ],
  properties: {
    stage: {
      type: "string",
      enum: ["visual", "history", "workup", "management", "complete"],
    },
    examinerMessage: {
      type: "string",
      description:
        "The next examiner response shown to the candidate. It may ask a follow-up, reveal requested case data, or complete the case.",
    },
    score: {
      type: "object",
      additionalProperties: false,
      required: ["diagnosis", "differential", "workup", "management", "total"],
      properties: {
        diagnosis: { type: "integer", minimum: 0, maximum: 3 },
        differential: { type: "integer", minimum: 0, maximum: 4 },
        workup: { type: "integer", minimum: 0, maximum: 4 },
        management: { type: "integer", minimum: 0, maximum: 4 },
        total: { type: "integer", minimum: 0, maximum: 15 },
      },
    },
    sourceDisclosureAllowed: {
      type: "boolean",
      description: "Must be true only when stage is complete.",
    },
    answerEvaluation: ANSWER_EVALUATION_SCHEMA,
    feedback: {
      type: "string",
      description:
        "Internal one-sentence reason for the stage decision. This is not shown to the candidate.",
    },
  },
} as const;

function buildEvaluatorInstructions() {
  return [
    "You are an ASOPRS oral board examiner running an interactive case.",
    "The app provides a preparedCase packet; use it as your canonical case file.",
    "Use preparedCase.visibleImageFindings as the visible photograph and exam-material context.",
    "Use preparedCase.examinerScripts for scripted reveals, preparedCase.acceptableAnswers as the grading range, and preparedCase.stageGates for advancement decisions.",
    "Before choosing a stage, map candidateAnswer into answerEvaluation: candidate intent, accepted answer evidence, missing elements, requested reveal, validity, and nextAction.",
    "Compare the candidate's answer against preparedCase.acceptableAnswers and the provided localAnswerEvaluation; improve the mapping if the local evidence missed a valid synonym.",
    "Do not treat a generic request for history, workup, or management as a correct answer; it is a requested reveal only when the current stage gates support it.",
    "If the candidate says they do not know or asks you to give/reveal the answer, set answerEvaluation.validity to surrender, requestedReveal to answer, nextAction to coach_without_disclosing, keep the current stage, and do not disclose the diagnosis.",
    "Only set nextAction to complete_case when the candidate has supplied final diagnosis, management, counseling, and surveillance.",
    "Do not say you cannot see the image, cannot access exam materials, or cannot continue without them.",
    "Listen to the candidate's actual answer. Do not just advance because a keyword appears.",
    "Let the candidate work through observation, leading diagnosis, differential, workup, management, counseling, and surveillance.",
    "If the candidate has not committed to a useful diagnostic framework, ask one targeted examiner follow-up and keep the same stage.",
    "Reveal history/exam, workup, and management only when the candidate asks for it or has earned the next step.",
    "Do not reveal the final diagnosis, case source, source kind, or source topic until stage is complete.",
    "If stage is complete, include final diagnosis, management, counseling, surveillance, and case source.",
    "Return JSON matching the schema exactly.",
  ].join(" ");
}

export function buildOpenAIOralExamTurnRequest({
  oralCaseId,
  state,
  userText,
  transcript,
  model = process.env.OPENAI_ORAL_EXAM_MODEL ??
    DEFAULT_ORAL_EXAM_EVALUATOR_MODEL,
}: OpenAIOralExamTurnInput) {
  const oralCase = getCaseById(oralCaseId);
  const preparedCase = buildPreparedOralExamCase(oralCaseId, state);
  const localAnswerEvaluation = buildOralExamAnswerEvaluation({
    oralCaseId,
    state,
    userText,
  });

  return {
    model,
    input: [
      {
        role: "system",
        content: buildEvaluatorInstructions(),
      },
      {
        role: "user",
        content: JSON.stringify({
          currentStage: state.stage,
          turnCount: state.turnCount,
          candidateAnswer: userText,
          recentTranscript: transcript.slice(-8),
          preparedCase,
          localAnswerEvaluation,
          caseData: {
            id: oralCase.id,
            difficulty: oralCase.difficulty,
            category: oralCase.category,
            diagnosis: oralCase.diagnosis,
            acceptableDiagnoses: oralCase.acceptableDiagnoses,
            differential: oralCase.differential,
            history: oralCase.history,
            exam: oralCase.exam,
            workup: oralCase.workup,
            management: oralCase.management,
            counseling: oralCase.counseling,
            surveillance: oralCase.surveillance,
            sourceDisclosure: oralCase.sourceDisclosure,
            teachingPoints: oralCase.teachingPoints,
          },
        }),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "oral_exam_turn",
        strict: true,
        schema: TURN_DECISION_SCHEMA,
      },
    },
    max_output_tokens: 900,
  };
}

function extractResponseText(payload: unknown) {
  if (
    payload &&
    typeof payload === "object" &&
    "output_text" in payload &&
    typeof payload.output_text === "string"
  ) {
    return payload.output_text;
  }

  if (!payload || typeof payload !== "object" || !("output" in payload)) {
    return "";
  }

  const output = payload.output;
  if (!Array.isArray(output)) return "";

  for (const item of output) {
    if (!item || typeof item !== "object" || !("content" in item)) continue;
    const content = item.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (
        part &&
        typeof part === "object" &&
        "text" in part &&
        typeof part.text === "string"
      ) {
        return part.text;
      }
    }
  }

  return "";
}

function clampScore(score: OralExamScore): OralExamScore {
  const diagnosis = Math.max(0, Math.min(3, Math.round(score.diagnosis)));
  const differential = Math.max(0, Math.min(4, Math.round(score.differential)));
  const workup = Math.max(0, Math.min(4, Math.round(score.workup)));
  const management = Math.max(0, Math.min(4, Math.round(score.management)));

  return {
    diagnosis,
    differential,
    workup,
    management,
    total: diagnosis + differential + workup + management,
  };
}

function stageForModelAction(
  currentStage: OralExamStage,
  decision: ModelTurnDecision
): OralExamStage {
  if (currentStage === "complete") return "complete";

  switch (decision.answerEvaluation.nextAction) {
    case "reveal_history":
      return "history";
    case "reveal_workup":
      return "workup";
    case "prompt_management":
      return "management";
    case "complete_case":
      return decision.answerEvaluation.validity === "valid"
        ? "complete"
        : currentStage;
    case "coach_without_disclosing":
    case "clarify_image":
    case "prompt_for_answer":
    case "prompt_for_next_step":
      return currentStage;
    default:
      return decision.stage;
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redactSpoilers(text: string, oralCase: ReturnType<typeof getCaseById>) {
  const spoilerTerms = [
    oralCase.sourceDisclosure,
    oralCase.sourceKind,
    oralCase.sourceTopic,
    oralCase.diagnosis,
    ...oralCase.acceptableDiagnoses,
  ]
    .map((term) => term.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  return spoilerTerms.reduce(
    (current, term) =>
      current.replace(new RegExp(escapeRegExp(term), "gi"), "[withheld]"),
    text
  );
}

function applyDecision({
  oralCaseId,
  state,
  decision,
}: {
  oralCaseId: string;
  state: OralExamState;
  decision: ModelTurnDecision;
}): OralExamTurnResult {
  const oralCase = getCaseById(oralCaseId);
  const stage = stageForModelAction(state.stage, decision);
  const revealedFigureIds = getRevealedFigureIdsForStage(
    oralCase,
    stage,
    state.revealedFigureIds
  );

  let examinerMessage = decision.examinerMessage.trim();
  if (stage !== "complete") {
    examinerMessage = redactSpoilers(
      examinerMessage.replace(/Case source:[\s\S]*$/i, ""),
      oralCase
    ).trim();
  }

  return {
    state: {
      oralCaseId: oralCase.id,
      stage,
      revealedFigureIds,
      turnCount: state.turnCount + 1,
    },
    examinerMessage,
    revealedFigureIds,
    score: clampScore(decision.score),
    answerEvaluation: decision.answerEvaluation,
  };
}

export async function createOpenAIOralExamTurn({
  apiKey,
  fetchImpl = fetch,
  ...input
}: OpenAIOralExamTurnOptions): Promise<OralExamTurnResult> {
  const response = await fetchImpl(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildOpenAIOralExamTurnRequest(input)),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `OpenAI oral exam turn request failed: ${response.status}${
        detail ? ` ${detail}` : ""
      }`
    );
  }

  const text = extractResponseText(await response.json());
  if (!text) {
    throw new Error("OpenAI oral exam turn response did not include JSON.");
  }

  return applyDecision({
    oralCaseId: input.oralCaseId,
    state: input.state,
    decision: JSON.parse(text) as ModelTurnDecision,
  });
}
