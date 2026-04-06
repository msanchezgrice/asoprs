import {
  Document as DocxDocument,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getGemini } from "@/lib/gemini";
import {
  buildStudyPackText,
  buildStudyPackTitle,
  type StudyPack,
  type StudyPackContentMode,
  type StudyPackFlashcard,
  type StudyPackMcq,
  type StudyPackSection,
} from "@/lib/study-pack";

const MCQ_COUNT = 50;
const FLASHCARD_COUNT = 30;
const MAX_SOURCE_CHARS = 18000;

interface SourceDocument {
  id: string;
  title: string;
  category?: StudyPackSection["category"];
  content: string;
}

function cleanModelJson(raw: string) {
  const fenced = raw.replace(/```json|```/gi, "").trim();
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("Model response did not contain JSON.");
  }
  return fenced.slice(start, end + 1);
}

function parseGeneratedStudyPack(raw: string) {
  const parsed = JSON.parse(cleanModelJson(raw)) as {
    mcqs?: Array<{
      question?: string;
      options?: string[];
      correctIndex?: number;
      explanation?: string;
    }>;
    flashcards?: Array<{
      front?: string;
      back?: string;
    }>;
  };

  return {
    mcqs: (parsed.mcqs || [])
      .filter(
        (item): item is {
          question: string;
          options: string[];
          correctIndex: number;
          explanation?: string;
        } =>
          Boolean(item?.question) &&
          Array.isArray(item?.options) &&
          item.options.length === 3 &&
          typeof item.correctIndex === "number"
      )
      .map<StudyPackMcq>((item) => ({
        question: item.question.trim(),
        options: [
          String(item.options[0] || "").trim(),
          String(item.options[1] || "").trim(),
          String(item.options[2] || "").trim(),
        ],
        correctIndex:
          item.correctIndex >= 0 && item.correctIndex <= 2 ? item.correctIndex : 0,
        explanation: item.explanation?.trim() || "",
      })),
    flashcards: (parsed.flashcards || [])
      .filter(
        (item): item is { front: string; back: string } =>
          Boolean(item?.front) && Boolean(item?.back)
      )
      .map<StudyPackFlashcard>((item) => ({
        front: item.front.trim(),
        back: item.back.trim(),
      })),
  };
}

async function generateSectionContent(
  doc: SourceDocument,
  contentMode: StudyPackContentMode,
  instructions: string
) {
  const model = getGemini();
  const modeInstructions =
    contentMode === "mcq"
      ? `Write exactly ${MCQ_COUNT} board-style MCQs. Every question must have exactly 3 answer choices in an "options" array and a single numeric "correctIndex" from 0 to 2. Include a short explanation.`
      : contentMode === "flashcards"
        ? `Write exactly ${FLASHCARD_COUNT} high-yield flashcards with concise but information-dense answers.`
        : `Write exactly ${MCQ_COUNT} board-style MCQs and exactly ${FLASHCARD_COUNT} high-yield flashcards.`;

  const prompt = `
Create ASOPRS board-review study material for the section "${doc.title}".

User instructions:
${instructions}

Output requirements:
- Return ONLY valid JSON.
- Use this JSON object schema:
{
  "mcqs": [
    {
      "question": "string",
      "options": ["choice A", "choice B", "choice C"],
      "correctIndex": 0,
      "explanation": "string"
    }
  ],
  "flashcards": [
    {
      "front": "string",
      "back": "string"
    }
  ]
}
- Omit arrays that are not requested.
- Focus only on high-yield concepts.
- Avoid filler, repetition, and low-value trivia.
- ${modeInstructions}

Source text:
${doc.content.slice(0, MAX_SOURCE_CHARS)}
`.trim();

  let lastError: unknown = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await model.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          temperature: 0.2,
          systemInstruction:
            "You are an expert ASOPRS board-prep writer. Return strict JSON only.",
        },
      });

      const parsed = parseGeneratedStudyPack(response.text ?? "");
      const mcqs =
        contentMode === "flashcards" ? [] : parsed.mcqs.slice(0, MCQ_COUNT);
      const flashcards =
        contentMode === "mcq" ? [] : parsed.flashcards.slice(0, FLASHCARD_COUNT);

      if (
        (contentMode === "mcq" && mcqs.length === 0) ||
        (contentMode === "flashcards" && flashcards.length === 0) ||
        (contentMode === "both" && mcqs.length === 0 && flashcards.length === 0)
      ) {
        throw new Error(`Empty generator response for ${doc.title}.`);
      }

      return {
        documentId: doc.id,
        title: doc.title,
        category: doc.category,
        mcqs,
        flashcards,
      } satisfies StudyPackSection;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Failed to generate study pack for ${doc.title}.`);
}

export async function generateStudyPack(params: {
  documents: SourceDocument[];
  contentMode: StudyPackContentMode;
  instructions: string;
}) {
  const sections: StudyPackSection[] = [];

  for (const doc of params.documents) {
    sections.push(
      await generateSectionContent(doc, params.contentMode, params.instructions)
    );
  }

  return {
    title: buildStudyPackTitle(params.documents.map((doc) => doc.title)),
    contentMode: params.contentMode,
    sections,
  } satisfies StudyPack;
}

function headingParagraph(
  text: string,
  level: (typeof HeadingLevel)[keyof typeof HeadingLevel]
) {
  return new Paragraph({
    heading: level,
    children: [new TextRun({ text })],
    spacing: { after: 180 },
  });
}

export async function buildStudyPackDocx(pack: StudyPack) {
  const text = buildStudyPackText(pack);
  const sectionTitles = new Set(pack.sections.map((section) => section.title));
  const specialHeadings = new Set(["MCQS", "FLASHCARDS", "ANSWER KEY", "EXPLANATIONS"]);

  const children = text.split("\n").map((line, index) => {
    if (!line.trim()) {
      return new Paragraph({ spacing: { after: 120 } });
    }

    if (index === 0) {
      return headingParagraph(line, HeadingLevel.TITLE);
    }

    if (sectionTitles.has(line)) {
      return headingParagraph(line, HeadingLevel.HEADING_1);
    }

    if (specialHeadings.has(line)) {
      return headingParagraph(line, HeadingLevel.HEADING_2);
    }

    return new Paragraph({
      spacing: { after: 100 },
      children: [new TextRun({ text: line })],
    });
  });

  const document = new DocxDocument({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  return Packer.toBuffer(document);
}

function wrapText(
  text: string,
  maxWidth: number,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  fontSize: number
) {
  if (!text) {
    return [""];
  }

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(candidate, fontSize);

    if (width <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
      current = word;
    } else {
      lines.push(candidate);
      current = "";
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

export async function buildStudyPackPdf(pack: StudyPack) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const boldFont = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const text = buildStudyPackText(pack);

  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 54;
  const lineHeight = 15;
  const maxWidth = pageWidth - margin * 2;

  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const drawLine = (line: string, bold = false, fontSize = 11) => {
    if (y < margin) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }

    page.drawText(line, {
      x: margin,
      y,
      size: fontSize,
      font: bold ? boldFont : font,
      color: rgb(0.07, 0.13, 0.24),
      maxWidth,
    });

    y -= lineHeight + (fontSize > 11 ? 3 : 0);
  };

  const sectionTitles = new Set(pack.sections.map((section) => section.title));
  const specialHeadings = new Set(["MCQS", "FLASHCARDS", "ANSWER KEY", "EXPLANATIONS"]);

  text.split("\n").forEach((rawLine, index) => {
    const line = rawLine.trimEnd();

    if (!line.trim()) {
      y -= 8;
      return;
    }

    const isTitle = index === 0;
    const isSection = sectionTitles.has(line);
    const isHeading = specialHeadings.has(line);
    const fontSize = isTitle ? 18 : isSection ? 15 : isHeading ? 13 : 11;
    const bold = isTitle || isSection || isHeading;

    for (const wrappedLine of wrapText(line, maxWidth, bold ? boldFont : font, fontSize)) {
      drawLine(wrappedLine, bold, fontSize);
    }
  });

  return pdf.save();
}
