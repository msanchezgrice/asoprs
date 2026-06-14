import cards from "@/data/image-flashcards.generated.json";
import {
  buildOpeningExaminerMessage,
  getCaseById,
  type OralExamCase,
  type OralExamState,
} from "./oral-exam";

type ImageFlashcard = (typeof cards)[number];

export type PreparedOralExamCase = {
  caseId: string;
  sourceUse: {
    primaryMaterial: "ASOPRS";
    supplementalKnowledge: string[];
    sourceDisclosure: string;
  };
  visibleImageFindings: Array<{
    label: string;
    pageNumber: number;
    caption: string;
    references: string[];
  }>;
  examinerScripts: {
    opening: string;
    visualFollowUp: string;
    historyReveal: string;
    workupReveal: string;
    managementPrompt: string;
    finalDebrief: string;
  };
  acceptableAnswers: {
    leadingDiagnoses: string[];
    differential: string[];
    imageObservations: string[];
    workup: string[];
    management: string[];
    counseling: string[];
    surveillance: string[];
  };
  stageGates: Record<
    "visual" | "history" | "workup" | "management",
    {
      required: string[];
      examinerMove: string;
    }
  >;
  responseActions: Array<{
    candidatePattern: string;
    mappedAction: string;
    examinerBehavior: string;
  }>;
  iterativePath: Array<{
    stage: string;
    learnerTask: string;
    examinerAction: string;
  }>;
};

function findFigure(figureId: string) {
  return (cards as ImageFlashcard[]).find((card) => card.id === figureId);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redactSpoilers(value: string, oralCase: OralExamCase, allowSpoilers: boolean) {
  if (allowSpoilers) return value;

  const spoilerTerms = [
    oralCase.diagnosis,
    oralCase.sourceTopic,
    oralCase.sourceKind,
    ...oralCase.acceptableDiagnoses,
  ]
    .map((term) => term.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  return spoilerTerms.reduce(
    (current, term) =>
      current.replace(new RegExp(escapeRegExp(term), "gi"), "[redacted]"),
    value
  );
}

function visibleFindingsForState(oralCase: OralExamCase, state: OralExamState) {
  const allowSpoilers = state.stage === "complete";

  return state.revealedFigureIds
    .map(findFigure)
    .filter((figure): figure is ImageFlashcard => Boolean(figure))
    .map((figure, index) => ({
      label:
        index === 0
          ? `${figure.figureLabel} / starting image`
          : `${figure.figureLabel} / revealed image ${String(index).padStart(2, "0")}`,
      pageNumber: figure.pageNumber,
      caption: redactSpoilers(figure.caption ?? "", oralCase, allowSpoilers),
      references: (figure.references ?? [])
        .slice(0, 4)
        .map((reference) => redactSpoilers(reference, oralCase, allowSpoilers)),
    }));
}

function keywords(values: string[]) {
  return Array.from(
    new Set(
      values
        .flatMap((value) =>
          value
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .filter((part) => part.length > 4)
        )
        .slice(0, 24)
    )
  );
}

export function buildPreparedOralExamCase(
  oralCaseId: string,
  state: OralExamState
): PreparedOralExamCase {
  const oralCase = getCaseById(oralCaseId);
  const visibleImageFindings = visibleFindingsForState(oralCase, state);

  return {
    caseId: oralCase.id,
    sourceUse: {
      primaryMaterial: "ASOPRS",
      supplementalKnowledge: [
        "oculoplastics oral-board reasoning",
        "standard ophthalmic workup, counseling, and surveillance principles",
      ],
      sourceDisclosure: oralCase.sourceDisclosure,
    },
    visibleImageFindings,
    examinerScripts: {
      opening: buildOpeningExaminerMessage(),
      visualFollowUp:
        "Stay with the photograph. Describe the visible abnormalities, give your leading diagnosis, and give a prioritized differential before asking for more data.",
      historyReveal: [
        `History: ${oralCase.history}`,
        `Examination: ${oralCase.exam}`,
        "Now refine your leading diagnosis and differential, then tell me what workup you want.",
      ].join("\n\n"),
      workupReveal: [
        `Workup: ${oralCase.workup}`,
        "You now have the key diagnostic data. Give your final diagnosis and management plan.",
      ].join("\n\n"),
      managementPrompt: [
        `Management: ${oralCase.management}`,
        "Finish with patient counseling and surveillance.",
      ].join("\n\n"),
      finalDebrief: [
        `Final diagnosis: ${oralCase.diagnosis}`,
        `Management: ${oralCase.management}`,
        `Counseling: ${oralCase.counseling}`,
        `Surveillance: ${oralCase.surveillance}`,
        `Case source: ${oralCase.sourceDisclosure}`,
      ].join("\n\n"),
    },
    acceptableAnswers: {
      leadingDiagnoses: oralCase.acceptableDiagnoses,
      differential: oralCase.differential,
      imageObservations: keywords(
        visibleImageFindings.flatMap((finding) => [
          finding.caption,
          ...finding.references,
        ])
      ),
      workup: keywords([oralCase.workup, "imaging biopsy pathology staging"]),
      management: keywords([oralCase.management]),
      counseling: keywords([oralCase.counseling]),
      surveillance: keywords([oralCase.surveillance]),
    },
    stageGates: {
      visual: {
        required: [
          "describes visible abnormality",
          "commits to leading diagnosis or diagnostic category",
          "gives a reasonable differential",
        ],
        examinerMove:
          "If incomplete, ask a targeted visual-analysis follow-up instead of revealing history.",
      },
      history: {
        required: [
          "asks for onset and symptoms",
          "asks for relevant examination findings",
          "updates differential",
        ],
        examinerMove:
          "Reveal history and exam only when the candidate requests clinical context or has framed the visual problem.",
      },
      workup: {
        required: [
          "requests appropriate imaging or diagnostic testing",
          "identifies need for tissue diagnosis when appropriate",
        ],
        examinerMove:
          "Reveal workup when the requested next step fits the case; otherwise ask what test would separate the differential.",
      },
      management: {
        required: [
          "states final diagnosis",
          "gives treatment plan",
          "addresses counseling and surveillance",
        ],
        examinerMove:
          "Complete the case only after diagnosis, treatment, counseling, and surveillance are addressed.",
      },
    },
    responseActions: [
      {
        candidatePattern:
          "The candidate says they do not know, asks for the answer, or asks you to reveal the diagnosis.",
        mappedAction: "coach_without_disclosing",
        examinerBehavior:
          "Do not disclose the diagnosis or source. Ask for one visible finding, a leading diagnosis or category, and a differential.",
      },
      {
        candidatePattern:
          "The candidate asks what photograph or image is shown.",
        mappedAction: "clarify_image",
        examinerBehavior:
          "Point them back to the displayed image and ask them to describe visible abnormalities before naming a diagnosis.",
      },
      {
        candidatePattern:
          "The candidate describes visual findings and gives a diagnostic framework, then asks for history or examination.",
        mappedAction: "reveal_history",
        examinerBehavior:
          "Read the history and examination script without revealing final diagnosis or source.",
      },
      {
        candidatePattern:
          "The candidate asks for appropriate imaging, biopsy, pathology, labs, or staging after clinical context.",
        mappedAction: "reveal_workup",
        examinerBehavior:
          "Read the workup script and ask for diagnosis plus management.",
      },
      {
        candidatePattern:
          "The candidate gives final diagnosis, management, counseling, and surveillance.",
        mappedAction: "complete_case",
        examinerBehavior:
          "Give the final debrief and disclose whether the case was real or simulated.",
      },
    ],
    iterativePath: [
      {
        stage: "visual",
        learnerTask: "Describe the image, leading diagnosis, and differential.",
        examinerAction: "Probe missing visual observations or differential.",
      },
      {
        stage: "history",
        learnerTask: "Ask for history and examination findings.",
        examinerAction: "Reveal scripted history and exam.",
      },
      {
        stage: "workup",
        learnerTask: "Request appropriate workup and interpret results.",
        examinerAction: "Reveal scripted workup.",
      },
      {
        stage: "management",
        learnerTask: "Give diagnosis, management, counseling, and surveillance.",
        examinerAction: "Debrief and disclose source when complete.",
      },
    ],
  };
}
