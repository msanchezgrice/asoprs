import {
  getCaseById,
  getRevealedFigureIdsForStage,
  type OralExamScore,
  type OralExamStage,
  type OralExamState,
  type OralExamTurnResult,
} from "./oral-exam";

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
  feedback: string;
};

const TURN_DECISION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "stage",
    "examinerMessage",
    "score",
    "sourceDisclosureAllowed",
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
          revealedFigureIds: state.revealedFigureIds,
          candidateAnswer: userText,
          recentTranscript: transcript.slice(-8),
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
  const stage =
    decision.sourceDisclosureAllowed && decision.stage !== "complete"
      ? "complete"
      : decision.stage;
  const revealedFigureIds = getRevealedFigureIdsForStage(
    oralCase,
    stage,
    state.revealedFigureIds
  );

  let examinerMessage = decision.examinerMessage.trim();
  if (stage !== "complete") {
    examinerMessage = examinerMessage
      .replaceAll(oralCase.sourceDisclosure, "")
      .replace(/Case source:[\s\S]*$/i, "")
      .trim();
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
