import { config } from "dotenv";
import * as path from "path";
import { fileURLToPath } from "node:url";
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(scriptDirectory, "../.env.local") });

import * as fs from "fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const PDF_ROOT = process.env.ASOPRS_PDF_ROOT
  ? path.resolve(process.env.ASOPRS_PDF_ROOT)
  : path.resolve(scriptDirectory, "../../ASOPRS_All_PDFs");
const OUTPUT_PATH = path.resolve(
  scriptDirectory,
  "../src/data/image-flashcards.generated.json"
);

const CATEGORIES = [
  "Orbit",
  "Eyelid-Eyebrow",
  "Skin Conditions",
  "Face",
  "Lacrimal",
  "Other",
];

type Line = {
  text: string;
  y: number;
  x: number;
};

type PageText = {
  width: number;
  height: number;
  lines: Line[];
};

type Crop = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type Card = {
  id: string;
  documentTitle: string;
  documentSlug: string;
  category: string;
  storagePath: string;
  figureLabel: string;
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  crop: Crop;
  caption: string;
  references: string[];
};

const EXCLUDED_REFERENCE_ONLY_CARD_IDS = new Set([
  "eyelid-eyebrow-eyelid-retraction-figure-1",
  "lacrimal-dacryocystocele-amniotocele-figure-1",
  "lacrimal-diagnostic-techniques-to-evaluate-obstructive-or-reflexive-epiphora-figure-5",
  "orbit-orbital-floor-fractures-figure-3",
  "orbit-adult-orbital-xanthogranulomatous-disease-figure-5",
  "orbit-adult-orbital-xanthogranulomatous-disease-figure-6",
  "orbit-adult-orbital-xanthogranulomatous-disease-figure-7",
  "orbit-adult-orbital-xanthogranulomatous-disease-figure-8",
  "orbit-adult-orbital-xanthogranulomatous-disease-figure-9",
  "orbit-adult-orbital-xanthogranulomatous-disease-figure-10",
  "orbit-adult-orbital-xanthogranulomatous-disease-figure-11",
  "orbit-schwannoma-neurilemoma-figure-2",
  "orbit-mandible-fractures-figure-1",
  "orbit-mandible-fractures-figure-4",
  "orbit-mandible-fractures-figure-15",
]);

const MANUALLY_REVIEWED_CARDS: Card[] = [
  {
    id: "face-anatomy-of-the-external-ear-figures-1-and-2",
    documentTitle: "Anatomy of the External Ear",
    documentSlug: "anatomy-of-the-external-ear",
    category: "Face",
    storagePath: "Face/Anatomy of the External Ear.pdf",
    figureLabel: "Figures 1 and 2",
    pageNumber: 1,
    pageWidth: 612,
    pageHeight: 792,
    crop: { left: 0.08, top: 0.23, right: 0.62, bottom: 0.66 },
    caption:
      "Figures 1 and 2. Anatomy of the external ear. External ear superficial landmarks, medially and laterally.",
    references: [],
  },
  {
    id: "skin-conditions-eyelid-edema-figure-1",
    documentTitle: "Eyelid edema",
    documentSlug: "eyelid-edema",
    category: "Skin Conditions",
    storagePath: "Skin Conditions/Eyelid edema.pdf",
    figureLabel: "Figure 1",
    pageNumber: 3,
    pageWidth: 612,
    pageHeight: 792,
    crop: { left: 0.06, top: 0.58, right: 0.84, bottom: 0.91 },
    caption: "Figure 1. Yellowish discoloration of the skin in orbital xanthogranuloma.",
    references: [],
  },
  {
    id: "skin-conditions-eyelid-edema-figure-2",
    documentTitle: "Eyelid edema",
    documentSlug: "eyelid-edema",
    category: "Skin Conditions",
    storagePath: "Skin Conditions/Eyelid edema.pdf",
    figureLabel: "Figure 2",
    pageNumber: 4,
    pageWidth: 612,
    pageHeight: 792,
    crop: { left: 0.06, top: 0.04, right: 0.84, bottom: 0.3 },
    caption: "Figure 2. Cigarette paper-like skin in blepharochalasis.",
    references: [],
  },
  {
    id: "skin-conditions-eyelid-edema-figure-3",
    documentTitle: "Eyelid edema",
    documentSlug: "eyelid-edema",
    category: "Skin Conditions",
    storagePath: "Skin Conditions/Eyelid edema.pdf",
    figureLabel: "Figure 3",
    pageNumber: 4,
    pageWidth: 612,
    pageHeight: 792,
    crop: { left: 0.06, top: 0.3, right: 0.84, bottom: 0.57 },
    caption: "Figure 3. Eczema and lichenification in atopic dermatitis.",
    references: [],
  },
  {
    id: "skin-conditions-eyelid-edema-figure-4",
    documentTitle: "Eyelid edema",
    documentSlug: "eyelid-edema",
    category: "Skin Conditions",
    storagePath: "Skin Conditions/Eyelid edema.pdf",
    figureLabel: "Figure 4",
    pageNumber: 5,
    pageWidth: 612,
    pageHeight: 792,
    crop: { left: 0.06, top: 0.26, right: 0.38, bottom: 0.54 },
    caption: "Figure 4. Melkersson-Rosenthal syndrome.",
    references: [],
  },
];

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cleanLine(text: string) {
  return text.replace(/\s+/g, " ").replace(/\u0000/g, "").trim();
}

function shouldSkipLine(text: string) {
  if (!text) return true;
  if (/^ASOPRS Education Center$/i.test(text)) return true;
  if (/^Page \d+ of \d+$/i.test(text)) return true;
  return false;
}

type TextContentLike = {
  items: unknown[];
};

type TextItemLike = {
  str: string;
  transform: number[];
};

function isTextItemLike(value: unknown): value is TextItemLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "str" in value &&
    typeof value.str === "string" &&
    "transform" in value &&
    Array.isArray(value.transform)
  );
}

async function extractLinesFromPage(page: {
  getTextContent: () => Promise<TextContentLike>;
}): Promise<Line[]> {
  const text = await page.getTextContent();

  const positioned = text.items
    .map((item) => {
      if (!isTextItemLike(item)) return null;
      const line = cleanLine(item.str);
      if (!line) return null;
      return {
        text: line,
        y: Math.round(item.transform[5]),
        x: Math.round(item.transform[4]),
      };
    })
    .filter((item): item is { text: string; y: number; x: number } => item !== null)
    .sort((a, b) => {
      if (b.y !== a.y) return b.y - a.y;
      return a.x - b.x;
    });

  const lines: Line[] = [];
  for (const item of positioned) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - item.y) <= 3) {
      last.text = cleanLine(`${last.text} ${item.text}`);
      last.x = Math.min(last.x, item.x);
      continue;
    }
    lines.push({ ...item });
  }

  return lines.filter((line) => !shouldSkipLine(line.text));
}

async function extractPageText(filePath: string, pageNumber: number): Promise<PageText> {
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await getDocument({ data, disableWorker: true }).promise;
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const lines = await extractLinesFromPage(page);

  return {
    width: viewport.width,
    height: viewport.height,
    lines,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toTopRatio(y: number, pageHeight: number) {
  return clamp(1 - y / pageHeight, 0, 1);
}

function buildCrop(input: {
  pageWidth: number;
  pageHeight: number;
  lines: Line[];
  caption: string;
  captionY: number;
}): Crop {
  const nonCaptionLines = input.lines.filter((line) => line.text !== input.caption);
  const aboveLines = nonCaptionLines
    .filter((line) => line.y > input.captionY + 4)
    .sort((a, b) => a.y - b.y);
  const belowLines = nonCaptionLines
    .filter((line) => line.y < input.captionY - 4)
    .sort((a, b) => b.y - a.y);

  const nearestAbove = aboveLines[0];
  const nearestBelow = belowLines[0];
  const gapAbove = nearestAbove ? nearestAbove.y - input.captionY : input.pageHeight * 0.42;
  const topY = nearestAbove
    ? nearestAbove.y - Math.min(14, Math.max(8, gapAbove * 0.12))
    : input.pageHeight - 24;
  const bottomY = nearestBelow
    ? Math.max(
        input.captionY + 8,
        nearestBelow.y + Math.min(18, Math.max(8, (input.captionY - nearestBelow.y) * 0.35))
      )
    : input.captionY + 10;

  let top = toTopRatio(topY, input.pageHeight);
  let bottom = toTopRatio(bottomY, input.pageHeight);

  if (bottom - top < 0.18) {
    const pad = (0.18 - (bottom - top)) / 2;
    top = clamp(top - pad, 0.02, 0.88);
    bottom = clamp(bottom + pad, 0.12, 0.98);
  }

  return {
    left: 0.06,
    top,
    right: 0.94,
    bottom,
  };
}

async function buildCardsForPdf(input: {
  filePath: string;
  category: string;
  title: string;
}): Promise<Card[]> {
  const data = new Uint8Array(fs.readFileSync(input.filePath));
  const doc = await getDocument({ data, disableWorker: true }).promise;
  const figures = new Map<
    string,
    {
      pageNumber: number;
      pageWidth: number;
      pageHeight: number;
      crop: Crop;
      caption: string;
      captionY: number;
      references: Set<string>;
    }
  >();

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const pageText = await extractPageText(input.filePath, pageNumber);
    const { lines, width, height } = pageText;

    for (const line of lines) {
      const matches = Array.from(line.text.matchAll(/Figure\s+(\d+[A-Z]?)/gi));
      if (matches.length === 0) continue;

      for (const match of matches) {
        const suffix = match[1].toUpperCase();
        const label = `Figure ${suffix}`;
        const existing = figures.get(label) || {
          pageNumber,
          pageWidth: width,
          pageHeight: height,
          crop: {
            left: 0.06,
            top: 0.08,
            right: 0.94,
            bottom: 0.72,
          },
          caption: "",
          captionY: 0,
          references: new Set<string>(),
        };

        const isCaption = new RegExp(`^Figure\\s+${suffix}\\b`, "i").test(line.text);
        if (isCaption && !existing.caption) {
          existing.caption = line.text;
          existing.pageNumber = pageNumber;
          existing.pageWidth = width;
          existing.pageHeight = height;
          existing.captionY = line.y;
          existing.crop = buildCrop({
            pageWidth: width,
            pageHeight: height,
            lines,
            caption: line.text,
            captionY: line.y,
          });
        } else if (!isCaption) {
          existing.references.add(line.text);
        }

        figures.set(label, existing);
      }
    }
  }

  return Array.from(figures.entries())
    .map(([figureLabel, figure]) => {
      const references = Array.from(figure.references).filter(
        (reference) => reference !== figure.caption
      );

      return {
        id: `${slugify(input.category)}-${slugify(input.title)}-${slugify(figureLabel)}`,
        documentTitle: input.title,
        documentSlug: slugify(input.title),
        category: input.category,
        storagePath: `${input.category}/${input.title}.pdf`,
        figureLabel,
        pageNumber: figure.pageNumber,
        pageWidth: figure.pageWidth,
        pageHeight: figure.pageHeight,
        crop: figure.crop,
        caption: figure.caption || figureLabel,
        references,
      };
    })
    .sort((a, b) => {
      if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
      return a.figureLabel.localeCompare(b.figureLabel);
    });
}

async function main() {
  const pdfs: { filePath: string; category: string; title: string }[] = [];

  for (const category of CATEGORIES) {
    const dir = path.join(PDF_ROOT, category);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith(".pdf") || file === "500 Internal Server Error.pdf") continue;
      pdfs.push({
        filePath: path.join(dir, file),
        category,
        title: file.replace(/\.pdf$/i, ""),
      });
    }
  }

  const cards: Card[] = [];
  for (const pdf of pdfs) {
    const nextCards = await buildCardsForPdf(pdf);
    cards.push(...nextCards);
    console.log(`${pdf.title}: ${nextCards.length} image flashcards`);
  }

  const filteredCards = cards.filter(
    (card) => !EXCLUDED_REFERENCE_ONLY_CARD_IDS.has(card.id),
  );
  filteredCards.push(...MANUALLY_REVIEWED_CARDS);
  const marcusGunnFigure = filteredCards.find(
    (card) =>
      card.id ===
      "eyelid-eyebrow-marcus-gunn-jaw-winking-syndrome-figure-2",
  );
  if (marcusGunnFigure) {
    marcusGunnFigure.crop = {
      left: 0.06,
      top: 0.41,
      right: 0.64,
      bottom: 0.66,
    };
    marcusGunnFigure.caption =
      "Figure 2. Difference in eyelid height measurement without and with the jaw properly fixated.";
  }

  filteredCards.sort((a, b) => {
    const categoryCmp = a.category.localeCompare(b.category);
    if (categoryCmp !== 0) return categoryCmp;
    const titleCmp = a.documentTitle.localeCompare(b.documentTitle);
    if (titleCmp !== 0) return titleCmp;
    if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
    return a.figureLabel.localeCompare(b.figureLabel);
  });

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(filteredCards, null, 2)}\n`);
  console.log(`Wrote ${filteredCards.length} image flashcards to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
