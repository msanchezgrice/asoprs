import type { Category } from "@/data/sample-documents";

export type OralCaseSourceKind =
  | "real_source"
  | "source_image_simulated_case";

export type OralExamStage =
  | "visual"
  | "history"
  | "workup"
  | "management"
  | "complete";

export interface OralExamCase {
  id: string;
  title: string;
  category: Category;
  difficulty: "core" | "advanced";
  sourceKind: OralCaseSourceKind;
  sourceDisclosure: string;
  sourceTopic: string;
  startingFigureId: string;
  supportingFigureIds: string[];
  diagnosis: string;
  acceptableDiagnoses: string[];
  differential: string[];
  history: string;
  exam: string;
  workup: string;
  management: string;
  counseling: string;
  surveillance: string;
  teachingPoints: string[];
}

export interface OralExamState {
  oralCaseId: string;
  stage: OralExamStage;
  revealedFigureIds: string[];
  turnCount: number;
}

export interface OralExamScore {
  diagnosis: number;
  differential: number;
  workup: number;
  management: number;
  total: number;
}

export type OralExamCandidateIntent =
  | "answer_attempt"
  | "ask_history"
  | "ask_workup"
  | "ask_management"
  | "clarify_image"
  | "request_answer"
  | "off_track";

export type OralExamNextAction =
  | "prompt_for_answer"
  | "prompt_for_next_step"
  | "reveal_history"
  | "reveal_workup"
  | "prompt_management"
  | "complete_case"
  | "clarify_image"
  | "coach_without_disclosing";

export type OralExamRequestedReveal =
  | "none"
  | "history"
  | "workup"
  | "management"
  | "answer";

export type OralExamAnswerValidity =
  | "valid"
  | "partial"
  | "invalid"
  | "surrender";

export interface OralExamAnswerEvaluation {
  candidateIntent: OralExamCandidateIntent;
  nextAction: OralExamNextAction;
  requestedReveal: OralExamRequestedReveal;
  validity: OralExamAnswerValidity;
  accepted: {
    diagnosis: string[];
    differential: string[];
    imageObservations: string[];
    workup: string[];
    management: string[];
    counseling: string[];
    surveillance: string[];
  };
  missing: string[];
  rationale: string;
}

export interface OralExamTurnResult {
  state: OralExamState;
  examinerMessage: string;
  revealedFigureIds: string[];
  score: OralExamScore;
  answerEvaluation: OralExamAnswerEvaluation;
}

export const ORAL_EXAM_CASES: OralExamCase[] = [
  {
    id: "orbital-rhabdomyosarcoma",
    title: "Pediatric Rapid Proptosis",
    category: "Orbit",
    difficulty: "advanced",
    sourceKind: "real_source",
    sourceDisclosure:
      "real_source: the starting image and serial findings are based on the ASOPRS Orbital Rhabdomyosarcoma material.",
    sourceTopic: "Orbital Rhabdomyosarcoma",
    startingFigureId: "orbit-orbital-rhabdomyosarcoma-figure-1",
    supportingFigureIds: [
      "orbit-orbital-rhabdomyosarcoma-figure-3",
      "orbit-orbital-rhabdomyosarcoma-figure-4",
      "orbit-orbital-rhabdomyosarcoma-figure-5",
    ],
    diagnosis: "orbital rhabdomyosarcoma",
    acceptableDiagnoses: [
      "orbital rhabdomyosarcoma",
      "rhabdomyosarcoma",
      "embryonal rhabdomyosarcoma",
    ],
    differential: [
      "orbital cellulitis",
      "idiopathic orbital inflammation",
      "neuroblastoma",
      "leukemia",
      "lymphoma",
      "ewing sarcoma",
    ],
    history:
      "A young child has several months of painless unilateral proptosis and globe displacement without fever or systemic infectious symptoms.",
    exam:
      "There is marked proptosis with inferior globe displacement, eyelid edema, conjunctival congestion, and reduced motility.",
    workup:
      "Orbital imaging shows a superior orbital mass. Biopsy shows a small round blue cell tumor with myogenic markers, including myogenin and desmin positivity.",
    management:
      "Urgent orbital imaging, tissue diagnosis, and early pediatric oncology/radiation oncology involvement. Treatment is multimodal, classically chemotherapy with local control by radiation or surgery when appropriate.",
    counseling:
      "Counsel that this is a malignant pediatric orbital tumor requiring coordinated oncology care, prompt treatment, and family-centered discussion of prognosis and treatment morbidity.",
    surveillance:
      "Follow closely with oncology and ophthalmology for treatment response, recurrence, ocular motility, vision, amblyopia risk, and late radiation or chemotherapy effects.",
    teachingPoints: [
      "Rapid painless proptosis in a child is malignant until proven otherwise.",
      "Do not treat presumed cellulitis indefinitely without imaging and biopsy when the story is atypical.",
      "Early multidisciplinary care is the key management move.",
    ],
  },
  {
    id: "igg4-related-disease",
    title: "Lacrimal Gland Swelling With Systemic Clues",
    category: "Orbit",
    difficulty: "advanced",
    sourceKind: "real_source",
    sourceDisclosure:
      "real_source: the starting image and clinical setup are based on the ASOPRS IgG4-Related Disease material.",
    sourceTopic: "IgG4-Related Disease",
    startingFigureId: "orbit-igg4-related-disease-figure-1",
    supportingFigureIds: [
      "orbit-igg4-related-disease-figure-2",
      "orbit-igg4-related-disease-figure-3",
      "orbit-igg4-related-disease-figure-7",
    ],
    diagnosis: "IgG4-related ophthalmic disease",
    acceptableDiagnoses: [
      "igg4-related ophthalmic disease",
      "igg4-related disease",
      "igg4 rod",
      "igg4",
    ],
    differential: [
      "idiopathic orbital inflammation",
      "sarcoidosis",
      "sjogren syndrome",
      "lymphoma",
      "granulomatosis with polyangiitis",
    ],
    history:
      "The patient has subacute lacrimal gland or upper lid swelling, often with salivary gland, sinus, lymph node, or other systemic inflammatory clues.",
    exam:
      "The exam may show lacrimal gland enlargement, eyelid swelling, proptosis, motility limitation, or infraorbital nerve involvement.",
    workup:
      "Workup includes orbital imaging, systemic review, serum IgG4 as supportive data, and biopsy showing lymphoplasmacytic inflammation with increased IgG4-positive plasma cells.",
    management:
      "Coordinate systemic evaluation. Corticosteroids are common initial therapy, with steroid-sparing immunomodulatory treatment or rituximab considered for recurrent or systemic disease.",
    counseling:
      "Counsel that this is usually chronic and systemic, may relapse, and needs long-term coordination with rheumatology or other systemic specialists.",
    surveillance:
      "Monitor vision, motility, optic nerve compression, recurrence, systemic organ involvement, and possible lymphoproliferative disease.",
    teachingPoints: [
      "Serum IgG4 can support but does not establish the diagnosis alone.",
      "Biopsy and systemic context matter.",
      "Longitudinal surveillance is part of the answer.",
    ],
  },
  {
    id: "adult-orbital-xanthogranulomatous-disease",
    title: "Bilateral Orbital Masses And Yellow Plaques",
    category: "Orbit",
    difficulty: "advanced",
    sourceKind: "real_source",
    sourceDisclosure:
      "real_source: the starting image and serial findings are based on ASOPRS Adult Orbital Xanthogranulomatous Disease material.",
    sourceTopic: "Adult Orbital Xanthogranulomatous Disease",
    startingFigureId:
      "orbit-adult-orbital-xanthogranulomatous-disease-figure-1",
    supportingFigureIds: [
      "orbit-adult-orbital-xanthogranulomatous-disease-figure-2",
      "orbit-adult-orbital-xanthogranulomatous-disease-figure-4",
      "orbit-adult-orbital-xanthogranulomatous-disease-figure-11",
    ],
    diagnosis: "adult orbital xanthogranulomatous disease",
    acceptableDiagnoses: [
      "adult orbital xanthogranulomatous disease",
      "xanthogranulomatous disease",
      "adult onset xanthogranuloma",
      "erdheim chester",
    ],
    differential: [
      "thyroid eye disease",
      "lymphoma",
      "sarcoidosis",
      "idiopathic orbital inflammation",
      "igg4-related disease",
    ],
    history:
      "An adult presents with progressive orbital symptoms, yellow periorbital plaques, proptosis, or visual symptoms. Systemic clues can include asthma, paraproteinemia, lymphadenopathy, or other immune dysfunction.",
    exam:
      "Findings can include bilateral periorbital plaques, proptosis, motility limitation, optic neuropathy signs, or ocular surface exposure.",
    workup:
      "Workup includes orbital imaging, systemic evaluation, hematologic testing for paraproteinemia or lymphoproliferative disease, and biopsy showing xanthogranulomatous inflammation with foamy histiocytes.",
    management:
      "Management depends on subtype and systemic involvement. Treat vision-threatening disease, coordinate systemic workup, and consider immunosuppression, radiation, or targeted systemic therapy as appropriate.",
    counseling:
      "Counsel that this is a rare chronic orbital/systemic disease spectrum and that recurrence or systemic associations affect management.",
    surveillance:
      "Monitor optic nerve function, motility, lesion progression, systemic disease, and hematologic associations over time.",
    teachingPoints: [
      "Yellow plaques plus orbital disease should trigger this disease spectrum.",
      "The diagnosis is clinicopathologic.",
      "Systemic associations are not an afterthought.",
    ],
  },
  {
    id: "sebaceous-carcinoma",
    title: "Recurrent Unilateral Eyelid Inflammation",
    category: "Skin Conditions",
    difficulty: "core",
    sourceKind: "source_image_simulated_case",
    sourceDisclosure:
      "source_image_simulated_case: the image is from ASOPRS Sebaceous Adenocarcinoma material; the patient stem is simulated from the same topic.",
    sourceTopic: "Sebaceous Adenocarcinoma",
    startingFigureId: "skin-conditions-sebaceous-adenocarcinoma-figure-2",
    supportingFigureIds: [
      "skin-conditions-sebaceous-adenocarcinoma-figure-3",
      "skin-conditions-sebaceous-adenocarcinoma-figure-7",
    ],
    diagnosis: "sebaceous carcinoma",
    acceptableDiagnoses: [
      "sebaceous carcinoma",
      "sebaceous adenocarcinoma",
      "sebaceous cell carcinoma",
    ],
    differential: [
      "chalazion",
      "chronic blepharitis",
      "squamous cell carcinoma",
      "basal cell carcinoma",
      "ocular cicatricial pemphigoid",
    ],
    history:
      "An older adult has recurrent unilateral eyelid inflammation or a presumed chalazion that does not resolve with standard therapy.",
    exam:
      "Look for eyelid thickening, madarosis, tarsal conjunctival changes, pagetoid spread, caruncular involvement, or diffuse unilateral blepharoconjunctivitis.",
    workup:
      "Biopsy suspicious eyelid tissue and consider conjunctival map biopsies when pagetoid spread is suspected. Evaluate regional nodes when disease is advanced.",
    management:
      "Treat with complete excision using margin control, address conjunctival involvement with cryotherapy or other adjuvant treatment when appropriate, and escalate for orbital invasion or nodal disease.",
    counseling:
      "Counsel that this malignancy can masquerade as benign inflammation, can recur, and may spread regionally or systemically.",
    surveillance:
      "Long-term follow-up for local recurrence, conjunctival disease, nodal disease, and systemic metastasis.",
    teachingPoints: [
      "Recurrent unilateral chalazion in an older adult needs biopsy.",
      "Pagetoid spread changes workup and treatment.",
      "Long-term surveillance is required.",
    ],
  },
  {
    id: "malt-lymphoma",
    title: "Salmon Patch Conjunctival Mass",
    category: "Orbit",
    difficulty: "core",
    sourceKind: "source_image_simulated_case",
    sourceDisclosure:
      "source_image_simulated_case: the image is from ASOPRS Ocular Adnexal MALT Lymphoma material; the patient stem is simulated from the same topic.",
    sourceTopic: "Ocular Adnexal MALT Lymphoma",
    startingFigureId: "orbit-ocular-adnexal-malt-lymphoma-figure-1",
    supportingFigureIds: [
      "orbit-ocular-adnexal-malt-lymphoma-figure-5",
      "orbit-ocular-adnexal-malt-lymphoma-figure-7",
    ],
    diagnosis: "ocular adnexal MALT lymphoma",
    acceptableDiagnoses: ["malt lymphoma", "ocular adnexal lymphoma", "lymphoma"],
    differential: [
      "reactive lymphoid hyperplasia",
      "idiopathic orbital inflammation",
      "sarcoidosis",
      "conjunctival melanoma",
      "metastasis",
    ],
    history:
      "An adult notices a painless slowly enlarging conjunctival or orbital mass with possible fullness or pseudoptosis.",
    exam:
      "A salmon-colored conjunctival or fornix lesion, orbital fullness, lacrimal gland mass, or motility changes may be present.",
    workup:
      "Obtain orbital imaging, tissue biopsy with flow cytometry/immunophenotyping, and systemic staging in coordination with oncology.",
    management:
      "Management may include observation in select cases, local radiotherapy, systemic therapy, or targeted treatment depending on staging and oncologic assessment.",
    counseling:
      "Counsel that this is often indolent but requires biopsy confirmation and systemic staging.",
    surveillance:
      "Follow for local recurrence, contralateral or systemic disease, and treatment sequelae.",
    teachingPoints: [
      "A salmon patch lesion is lymphoma until proven otherwise.",
      "Do not skip systemic staging.",
      "Biopsy handling matters because flow cytometry may be needed.",
    ],
  },
  {
    id: "infantile-hemangioma",
    title: "Infant Upper Eyelid Vascular Lesion",
    category: "Orbit",
    difficulty: "core",
    sourceKind: "source_image_simulated_case",
    sourceDisclosure:
      "source_image_simulated_case: the image is from ASOPRS Infantile Hemangioma material; the patient stem is simulated from the same topic.",
    sourceTopic: "Infantile Hemangioma",
    startingFigureId: "orbit-infantile-hemangioma-figure-1",
    supportingFigureIds: [
      "orbit-infantile-hemangioma-figure-2",
      "orbit-infantile-hemangioma-figure-4",
    ],
    diagnosis: "infantile hemangioma",
    acceptableDiagnoses: ["infantile hemangioma", "capillary hemangioma"],
    differential: [
      "venous lymphatic malformation",
      "rhabdomyosarcoma",
      "dermoid cyst",
      "dacryocystocele",
      "orbital cellulitis",
    ],
    history:
      "An infant has a vascular-appearing eyelid lesion that enlarges during early infancy and may obstruct the visual axis.",
    exam:
      "Assess lesion extent, visual axis obstruction, ptosis, induced astigmatism, proptosis, and amblyopia risk.",
    workup:
      "Clinical diagnosis is common. Imaging is reserved for uncertain diagnosis, deep orbital extension, or atypical features.",
    management:
      "Treat vision-threatening lesions promptly, often with systemic beta-blocker therapy after appropriate screening; coordinate amblyopia management.",
    counseling:
      "Counsel about proliferative and involution phases, treatment goals, beta-blocker risks, and amblyopia prevention.",
    surveillance:
      "Monitor lesion response, visual axis, refraction, amblyopia, systemic medication tolerance, and recurrence after taper.",
    teachingPoints: [
      "The board answer is amblyopia prevention.",
      "Not every lesion needs imaging, but atypical or deep lesions do.",
      "Treatment urgency depends on visual risk.",
    ],
  },
  {
    id: "horner-syndrome",
    title: "Subtle Ptosis And Miosis",
    category: "Face",
    difficulty: "core",
    sourceKind: "real_source",
    sourceDisclosure:
      "real_source: the image is based on ASOPRS Horner Syndrome material showing a patient with right Horner syndrome.",
    sourceTopic: "Horner Syndrome",
    startingFigureId: "face-horner-syndrome-figure-2",
    supportingFigureIds: [
      "face-horner-syndrome-figure-1",
      "face-horner-syndrome-figure-4",
    ],
    diagnosis: "Horner syndrome",
    acceptableDiagnoses: ["horner syndrome", "oculosympathetic palsy", "hs"],
    differential: [
      "physiologic anisocoria",
      "third nerve palsy",
      "traumatic ptosis",
      "pharmacologic miosis",
      "carotid dissection",
    ],
    history:
      "The key history is onset, neck or facial pain, headache, trauma, birth history in children, malignancy risk, and neurologic symptoms.",
    exam:
      "Look for mild ptosis, miosis greater in the dark, dilation lag, possible anhidrosis, and old photographs confirming chronicity.",
    workup:
      "Confirm when needed pharmacologically and image urgently when acute or painful, especially to exclude internal carotid artery dissection or apical/chest lesions.",
    management:
      "Management is directed at the cause. Acute painful Horner syndrome requires urgent vascular evaluation.",
    counseling:
      "Counsel that the eyelid finding may be mild, but the underlying cause can be serious when acute or painful.",
    surveillance:
      "Follow based on etiology, neurologic findings, and imaging results; chronic stable cases need different monitoring than acute cases.",
    teachingPoints: [
      "Painful acute Horner syndrome is carotid dissection until proven otherwise.",
      "The anisocoria is worse in the dark.",
      "Old photos can prevent unnecessary workup in chronic cases.",
    ],
  },
  {
    id: "orbital-cellulitis",
    title: "Painful Eyelid Edema With Proptosis",
    category: "Orbit",
    difficulty: "core",
    sourceKind: "source_image_simulated_case",
    sourceDisclosure:
      "source_image_simulated_case: the image is from ASOPRS Bacterial Orbital Cellulitis material; the patient stem is simulated from the same topic.",
    sourceTopic: "Bacterial Orbital Cellulitis",
    startingFigureId: "orbit-bacterial-orbital-cellulitis-figure-1",
    supportingFigureIds: ["orbit-bacterial-orbital-cellulitis-figure-2"],
    diagnosis: "bacterial orbital cellulitis",
    acceptableDiagnoses: ["orbital cellulitis", "bacterial orbital cellulitis"],
    differential: [
      "preseptal cellulitis",
      "idiopathic orbital inflammation",
      "necrotizing fasciitis",
      "cavernous sinus thrombosis",
      "malignancy",
    ],
    history:
      "A patient has acute eyelid edema with pain, fever or sinus symptoms, pain with eye movement, or relevant immune compromise.",
    exam:
      "Assess vision, pupils, color vision, motility, proptosis, chemosis, fever, and optic nerve compromise.",
    workup:
      "Urgent orbital/sinus imaging, labs and cultures when appropriate, and ENT/ophthalmology involvement for abscess or sinus source.",
    management:
      "Start broad-spectrum IV antibiotics, monitor vision closely, and drain abscess or debride necrotic tissue when indicated.",
    counseling:
      "Counsel about potential vision-threatening and life-threatening complications and the need for urgent inpatient treatment when orbital signs are present.",
    surveillance:
      "Reassess vision, pupils, motility, fever, pain, imaging progression, abscess formation, and treatment response.",
    teachingPoints: [
      "Vision and optic nerve checks drive urgency.",
      "Preseptal and orbital cellulitis are not the same case.",
      "Failure to improve should trigger reconsideration of diagnosis or drainage.",
    ],
  },
];

export function getCaseById(oralCaseId: string) {
  const oralCase = ORAL_EXAM_CASES.find((item) => item.id === oralCaseId);
  if (!oralCase) {
    throw new Error(`Unknown oral exam case: ${oralCaseId}`);
  }
  return oralCase;
}

export function getOralExamCaseLabel(index: number) {
  return `Case ${String(index + 1).padStart(2, "0")}`;
}

export function getOralExamFigureLabel(index: number) {
  if (index === 0) return "Starting image";
  return `Revealed image ${String(index).padStart(2, "0")}`;
}

export function getInitialOralExamState(oralCaseId = ORAL_EXAM_CASES[0].id) {
  const oralCase = getCaseById(oralCaseId);

  return {
    oralCaseId: oralCase.id,
    stage: "visual" as const,
    revealedFigureIds: [oralCase.startingFigureId],
    turnCount: 0,
  };
}

export function buildOpeningExaminerMessage() {
  return [
    "Describe the image out loud as you would in an oral exam.",
    "Give your leading diagnosis and differential diagnosis.",
    "Then ask for any history, examination findings, workup, treatment details, counseling, or surveillance information you need.",
  ].join(" ");
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function getRevealedFigureIdsForStage(
  oralCase: OralExamCase,
  stage: OralExamStage,
  existing: string[]
) {
  const figureIds = new Set(existing);
  figureIds.add(oralCase.startingFigureId);

  if (stage === "workup" || stage === "management" || stage === "complete") {
    oralCase.supportingFigureIds.slice(0, 2).forEach((id) => figureIds.add(id));
  }

  if (stage === "complete") {
    oralCase.supportingFigureIds.forEach((id) => figureIds.add(id));
  }

  return Array.from(figureIds);
}

const VISUAL_OBSERVATION_TERMS = [
  "anisocoria",
  "blepharitis",
  "chemosis",
  "conjunctival",
  "edema",
  "eyelid",
  "globe",
  "inflammation",
  "lacrimal",
  "lesion",
  "mass",
  "miosis",
  "motility",
  "plaque",
  "proptosis",
  "ptosis",
  "salmon",
  "swelling",
  "vascular",
  "yellow",
];

function matchedTerms(userText: string, terms: string[]) {
  const normalized = normalize(userText);
  return Array.from(
    new Set(
      terms.filter((term) => normalized.includes(normalize(term))).filter(Boolean)
    )
  );
}

function keywordCandidates(values: string[]) {
  return Array.from(
    new Set(
      values.flatMap((value) =>
        normalize(value)
          .split(" ")
          .filter((part) => part.length > 4)
      )
    )
  );
}

function scoreTurn(oralCase: OralExamCase, userText: string): OralExamScore {
  const acceptedDiagnoses = matchedTerms(userText, oralCase.acceptableDiagnoses);
  const acceptedDifferential = matchedTerms(userText, oralCase.differential);
  const acceptedWorkup = matchedTerms(userText, [
    "imaging",
    "ct",
    "mri",
    "biopsy",
    "pathology",
    "staging",
    "visual acuity",
    "motility",
    ...keywordCandidates([oralCase.workup]),
  ]);
  const acceptedManagement = matchedTerms(userText, [
    "treat",
    "management",
    "surgery",
    "chemotherapy",
    "chemo",
    "radiation",
    "oncology",
    "counseling",
    "surveillance",
    "follow",
    ...keywordCandidates([oralCase.management]),
  ]);

  return {
    diagnosis: acceptedDiagnoses.length > 0 ? 2 : 0,
    differential: Math.min(4, acceptedDifferential.length),
    workup: Math.min(4, acceptedWorkup.length),
    management: Math.min(4, acceptedManagement.length),
    total:
      (acceptedDiagnoses.length > 0 ? 2 : 0) +
      Math.min(4, acceptedDifferential.length) +
      Math.min(4, acceptedWorkup.length) +
      Math.min(4, acceptedManagement.length),
  };
}

function classifyIntent(userText: string): OralExamCandidateIntent {
  const text = normalize(userText);
  if (
    /\b(i do not know|i dont know|no idea|unsure|give me the answer|tell me the answer|show me the answer|reveal the answer|what is the answer|what is the diagnosis)\b/.test(
      text
    )
  ) {
    return "request_answer";
  }

  if (/\b(what image|what photograph|what photo|what am i looking at|describe the image)\b/.test(text)) {
    return "clarify_image";
  }

  if (/\b(treat|treatment|manage|management|surgery|chemo|radiation|counsel|surveillance|follow)\b/.test(text)) {
    return "ask_management";
  }

  if (/\b(workup|imaging|ct|mri|scan|biopsy|pathology|lab|test|diagnostic|staging)\b/.test(text)) {
    return "ask_workup";
  }

  if (/\b(history|exam|examination|symptom|presentation|motility|vision|onset|pain)\b/.test(text)) {
    return "ask_history";
  }

  if (text.length < 4) return "off_track";
  return "answer_attempt";
}

function hasDiagnosticFramework(evaluation: Pick<OralExamAnswerEvaluation, "accepted">) {
  return (
    evaluation.accepted.diagnosis.length > 0 ||
    evaluation.accepted.differential.length > 0
  );
}

function hasManagementClosure(evaluation: Pick<OralExamAnswerEvaluation, "accepted">) {
  return (
    evaluation.accepted.diagnosis.length > 0 &&
    evaluation.accepted.management.length > 0 &&
    (evaluation.accepted.counseling.length > 0 ||
      evaluation.accepted.surveillance.length > 0)
  );
}

function inferNextAction({
  state,
  intent,
  accepted,
}: {
  state: OralExamState;
  intent: OralExamCandidateIntent;
  accepted: OralExamAnswerEvaluation["accepted"];
}): Pick<OralExamAnswerEvaluation, "nextAction" | "requestedReveal" | "validity" | "missing" | "rationale"> {
  const evidence = { accepted };
  const hasVisualDescription = accepted.imageObservations.length > 0;
  const hasFramework = hasDiagnosticFramework(evidence);

  if (state.stage === "complete") {
    return {
      nextAction: "complete_case",
      requestedReveal: "answer",
      validity: "valid",
      missing: [],
      rationale: "The case is already complete.",
    };
  }

  if (intent === "request_answer") {
    return {
      nextAction: "coach_without_disclosing",
      requestedReveal: "answer",
      validity: "surrender",
      missing: [
        "visible observations",
        "leading diagnosis or category",
        "differential diagnosis",
      ],
      rationale:
        "The candidate requested the answer instead of attempting the oral-board task.",
    };
  }

  if (intent === "clarify_image") {
    return {
      nextAction: "clarify_image",
      requestedReveal: "none",
      validity: "partial",
      missing: ["candidate image description", "diagnostic framework"],
      rationale:
        "The candidate asked for help identifying the displayed photograph.",
    };
  }

  if (state.stage === "visual") {
    if (intent === "ask_history" && (hasVisualDescription || hasFramework)) {
      return {
        nextAction: "reveal_history",
        requestedReveal: "history",
        validity: hasVisualDescription && hasFramework ? "valid" : "partial",
        missing: hasFramework ? [] : ["leading diagnosis or differential"],
        rationale:
          "The candidate gave enough initial visual or diagnostic framing to receive history and examination.",
      };
    }

    if (hasVisualDescription && hasFramework) {
      return {
        nextAction: "prompt_for_next_step",
        requestedReveal: "none",
        validity: "valid",
        missing: ["request for history/examination or next diagnostic step"],
        rationale:
          "The candidate supplied a reasonable image description and diagnostic framework but has not requested the next case data.",
      };
    }

    return {
      nextAction: "prompt_for_answer",
      requestedReveal: "none",
      validity: hasVisualDescription || hasFramework ? "partial" : "invalid",
      missing: [
        ...(hasVisualDescription ? [] : ["visible abnormality description"]),
        ...(hasFramework ? [] : ["leading diagnosis or differential"]),
      ],
      rationale:
        "The candidate has not yet earned serial reveal from the starting photograph.",
    };
  }

  if (state.stage === "history") {
    if (intent === "ask_workup" || accepted.workup.length > 0) {
      return {
        nextAction: "reveal_workup",
        requestedReveal: "workup",
        validity: "valid",
        missing: [],
        rationale:
          "The candidate requested an appropriate diagnostic workup after history and examination.",
      };
    }

    return {
      nextAction: "prompt_for_next_step",
      requestedReveal: "none",
      validity: hasFramework ? "partial" : "invalid",
      missing: ["appropriate workup request"],
      rationale:
        "The candidate needs to state the workup that separates the differential.",
    };
  }

  if (state.stage === "workup") {
    if (hasManagementClosure({ accepted })) {
      return {
        nextAction: "complete_case",
        requestedReveal: "answer",
        validity: "valid",
        missing: [],
        rationale:
          "The candidate gave diagnosis, treatment, and follow-up or counseling after workup.",
      };
    }

    if (intent === "ask_management" || accepted.management.length > 0) {
      return {
        nextAction: "prompt_management",
        requestedReveal: "management",
        validity: accepted.management.length > 0 ? "partial" : "invalid",
        missing: ["final diagnosis", "counseling", "surveillance"],
        rationale:
          "The candidate is entering management but has not completed the board answer.",
      };
    }

    return {
      nextAction: "prompt_for_answer",
      requestedReveal: "none",
      validity: hasFramework ? "partial" : "invalid",
      missing: ["final diagnosis", "management plan"],
      rationale:
        "The candidate needs to interpret the workup and commit to diagnosis and management.",
    };
  }

  if (hasManagementClosure({ accepted })) {
    return {
      nextAction: "complete_case",
      requestedReveal: "answer",
      validity: "valid",
      missing: [],
      rationale:
        "The candidate completed diagnosis, management, counseling or surveillance.",
    };
  }

  return {
    nextAction: "prompt_management",
    requestedReveal: "management",
    validity: accepted.management.length > 0 ? "partial" : "invalid",
    missing: ["diagnosis", "management", "counseling", "surveillance"].filter(
      (item) => {
        if (item === "diagnosis") return accepted.diagnosis.length === 0;
        if (item === "management") return accepted.management.length === 0;
        if (item === "counseling") return accepted.counseling.length === 0;
        return accepted.surveillance.length === 0;
      }
    ),
    rationale:
      "The candidate has not yet completed all final oral-board elements.",
  };
}

export function buildOralExamAnswerEvaluation({
  oralCaseId,
  state,
  userText,
}: {
  oralCaseId: string;
  state: OralExamState;
  userText: string;
}): OralExamAnswerEvaluation {
  const oralCase = getCaseById(oralCaseId);
  const intent = classifyIntent(userText);
  const accepted = {
    diagnosis: matchedTerms(userText, oralCase.acceptableDiagnoses),
    differential: matchedTerms(userText, oralCase.differential),
    imageObservations: matchedTerms(userText, VISUAL_OBSERVATION_TERMS),
    workup: matchedTerms(userText, [
      "imaging",
      "ct",
      "mri",
      "scan",
      "biopsy",
      "pathology",
      "staging",
      "lab",
      "culture",
      "visual acuity",
      "motility",
      ...keywordCandidates([oralCase.workup]),
    ]),
    management: matchedTerms(userText, [
      "treat",
      "treatment",
      "manage",
      "management",
      "surgery",
      "excision",
      "chemotherapy",
      "chemo",
      "radiation",
      "antibiotics",
      "oncology",
      "steroids",
      "beta blocker",
      "propranolol",
      ...keywordCandidates([oralCase.management]),
    ]),
    counseling: matchedTerms(userText, [
      "counsel",
      "counseling",
      "risk",
      "prognosis",
      "recurrence",
      "spread",
      "malignant",
      "systemic",
      ...keywordCandidates([oralCase.counseling]),
    ]),
    surveillance: matchedTerms(userText, [
      "surveillance",
      "follow",
      "follow up",
      "monitor",
      "recurrence",
      "long term",
      ...keywordCandidates([oralCase.surveillance]),
    ]),
  };

  return {
    candidateIntent: intent,
    accepted,
    ...inferNextAction({ state, intent, accepted }),
  };
}

function stageForAction(
  currentStage: OralExamStage,
  action: OralExamNextAction
): OralExamStage {
  if (currentStage === "complete") return "complete";

  if (action === "reveal_history") return "history";
  if (action === "reveal_workup") return "workup";
  if (action === "prompt_management") return "management";
  if (action === "complete_case") return "complete";
  return currentStage;
}

function buildStageMessage(oralCase: OralExamCase, stage: OralExamStage) {
  if (stage === "history") {
    return [
      `History: ${oralCase.history}`,
      `Examination: ${oralCase.exam}`,
      "Now refine your differential and tell me what workup you want next.",
    ].join("\n\n");
  }

  if (stage === "workup") {
    return [
      `Workup: ${oralCase.workup}`,
      "You now have the key diagnostic data. Give your final diagnosis and management plan.",
    ].join("\n\n");
  }

  if (stage === "management") {
    return [
      `Management: ${oralCase.management}`,
      "Finish with patient counseling and surveillance.",
    ].join("\n\n");
  }

  return [
    `Final diagnosis: ${oralCase.diagnosis}`,
    `Management: ${oralCase.management}`,
    `Counseling: ${oralCase.counseling}`,
    `Surveillance: ${oralCase.surveillance}`,
    `Case source: ${oralCase.sourceDisclosure}`,
    `Starting image: ${oralCase.startingFigureId}`,
  ].join("\n\n");
}

function buildActionMessage(
  oralCase: OralExamCase,
  stage: OralExamStage,
  evaluation: OralExamAnswerEvaluation
) {
  if (evaluation.nextAction === "coach_without_disclosing") {
    return [
      "I will not give away the final answer yet.",
      "Make your best oral-exam attempt: describe the visible abnormality, give a leading diagnosis or diagnostic category, and list a prioritized differential.",
    ].join(" ");
  }

  if (evaluation.nextAction === "clarify_image") {
    return [
      "Use the starting photograph displayed on the left.",
      "Describe the abnormal eyelid, orbital, conjunctival, pupillary, or periocular findings you can see, then give a leading diagnosis and differential.",
    ].join(" ");
  }

  if (
    evaluation.nextAction === "prompt_for_answer" ||
    evaluation.nextAction === "prompt_for_next_step"
  ) {
    const missing = evaluation.missing.length
      ? ` Missing elements: ${evaluation.missing.join(", ")}.`
      : "";

    if (stage === "visual") {
      return `Before I reveal more, stay with the photograph. Give your visible findings, leading diagnosis, and differential.${missing}`;
    }

    if (stage === "history") {
      return `You have the history and examination. Tell me the workup that separates your differential.${missing}`;
    }

    return `Interpret the available case data and give your final diagnosis and management plan.${missing}`;
  }

  return buildStageMessage(oralCase, stage);
}

export function handleOralExamTurn({
  oralCaseId,
  state,
  userText,
}: {
  oralCaseId: string;
  state: OralExamState;
  userText: string;
}): OralExamTurnResult {
  const oralCase = getCaseById(oralCaseId);
  const answerEvaluation = buildOralExamAnswerEvaluation({
    oralCaseId,
    state,
    userText,
  });
  const stage = stageForAction(state.stage, answerEvaluation.nextAction);
  const revealedFigureIds = getRevealedFigureIdsForStage(
    oralCase,
    stage,
    state.revealedFigureIds
  );
  const score = scoreTurn(oralCase, userText);

  return {
    state: {
      oralCaseId: oralCase.id,
      stage,
      revealedFigureIds,
      turnCount: state.turnCount + 1,
    },
    examinerMessage: buildActionMessage(oralCase, stage, answerEvaluation),
    revealedFigureIds,
    score,
    answerEvaluation,
  };
}
