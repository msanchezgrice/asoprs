import type { Category, Document } from "@/data/sample-documents";

export type StudyPackContentMode = "mcq" | "flashcards" | "both";
export type StudyPackOutputFormat = "docx" | "pdf" | "in-app";

export interface StudyPackRequest {
  selectedDocumentIds: string[];
  contentMode: StudyPackContentMode;
  outputFormat: StudyPackOutputFormat;
  instructions: string;
}

export interface StudyPackMcq {
  question: string;
  options: [string, string, string];
  correctIndex: number;
  explanation?: string;
}

export interface StudyPackFlashcard {
  front: string;
  back: string;
}

export interface StudyPackSection {
  documentId?: string;
  title: string;
  category?: Category;
  mcqs: StudyPackMcq[];
  flashcards: StudyPackFlashcard[];
}

export interface StudyPack {
  title: string;
  contentMode: StudyPackContentMode;
  sections: StudyPackSection[];
}

export interface SavedStudyPackSummary {
  id: string;
  title: string;
  contentMode: StudyPackContentMode;
  sectionTitles: string[];
  createdAt: string;
  outputFormat: StudyPackOutputFormat;
}

export const DEFAULT_STUDY_PACK_INSTRUCTIONS =
  "Create high-yield ASOPRS board-review content. MCQs should use exactly 3 answer choices and include an answer key. Flashcards should emphasize high-yield diagnosis, management, and surgical pearls.";

export function groupDocumentsByCategory(documents: Document[]) {
  return documents.reduce<Record<Category, Document[]>>((acc, doc) => {
    if (!acc[doc.category]) {
      acc[doc.category] = [];
    }
    acc[doc.category].push(doc);
    acc[doc.category].sort((a, b) => a.title.localeCompare(b.title));
    return acc;
  }, {} as Record<Category, Document[]>);
}

function buildMcqSection(section: StudyPackSection): string {
  const lines: string[] = [section.title, "", "MCQS", ""];

  section.mcqs.forEach((mcq, index) => {
    lines.push(`${index + 1}. ${mcq.question}`);
    lines.push(`A. ${mcq.options[0]}`);
    lines.push(`B. ${mcq.options[1]}`);
    lines.push(`C. ${mcq.options[2]}`);
    lines.push("");
  });

  lines.push("ANSWER KEY", "");
  lines.push(
    section.mcqs
      .map((mcq, index) => `${index + 1}-${["A", "B", "C"][mcq.correctIndex] ?? "A"}`)
      .join(", ")
  );

  const explanations = section.mcqs
    .map((mcq, index) =>
      mcq.explanation?.trim()
        ? `${index + 1}. ${mcq.explanation.trim()}`
        : null
    )
    .filter(Boolean) as string[];

  if (explanations.length > 0) {
    lines.push("", "EXPLANATIONS", "", ...explanations);
  }

  return lines.join("\n");
}

function buildFlashcardSection(section: StudyPackSection): string {
  const lines: string[] = [section.title, "", "FLASHCARDS", ""];

  section.flashcards.forEach((card, index) => {
    lines.push(`Q${index + 1}. ${card.front}`);
    lines.push(`A${index + 1}. ${card.back}`);
    lines.push("");
  });

  return lines.join("\n");
}

export function buildStudyPackText(pack: StudyPack): string {
  const chunks: string[] = [pack.title];

  pack.sections.forEach((section) => {
    chunks.push("");
    if (pack.contentMode === "mcq") {
      chunks.push(buildMcqSection(section));
      return;
    }

    if (pack.contentMode === "flashcards") {
      chunks.push(buildFlashcardSection(section));
      return;
    }

    chunks.push(buildMcqSection(section));
    chunks.push("");
    chunks.push(buildFlashcardSection(section));
  });

  return chunks.join("\n").trim();
}

export function buildStudyPackTitle(sectionTitles: string[]) {
  if (sectionTitles.length === 0) {
    return "ASOPRS Study Pack";
  }

  if (sectionTitles.length === 1) {
    return `ASOPRS Study Pack - ${sectionTitles[0]}`;
  }

  if (sectionTitles.length === 2) {
    return `ASOPRS Study Pack - ${sectionTitles[0]} + ${sectionTitles[1]}`;
  }

  return `ASOPRS Study Pack - ${sectionTitles.length} Sections`;
}

export function buildStudyPackFilename(pack: StudyPack, format: StudyPackOutputFormat) {
  const slug = pack.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const extension =
    format === "in-app" ? "txt" : format === "docx" ? "docx" : "pdf";
  return `${slug || "asoprs-study-pack"}.${extension}`;
}
