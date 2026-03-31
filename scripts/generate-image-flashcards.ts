import { config } from "dotenv";
import * as path from "path";
config({ path: path.resolve(__dirname, "../.env.local") });

import * as fs from "fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const PDF_ROOT = path.resolve(__dirname, "../../ASOPRS_All_PDFs");
const OUTPUT_PATH = path.resolve(
  __dirname,
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

type Card = {
  id: string;
  documentTitle: string;
  documentSlug: string;
  category: string;
  storagePath: string;
  figureLabel: string;
  pageNumber: number;
  caption: string;
  references: string[];
};

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

async function extractLines(filePath: string, pageNumber: number): Promise<Line[]> {
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await getDocument({ data, disableWorker: true }).promise;
  const page = await doc.getPage(pageNumber);
  const text = await page.getTextContent();

  const positioned = text.items
    .map((item) => {
      if (!("str" in item)) return null;
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
      caption: string;
      references: Set<string>;
    }
  >();

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const lines = await extractLines(input.filePath, pageNumber);

    for (const line of lines) {
      const matches = Array.from(line.text.matchAll(/Figure\s+(\d+[A-Z]?)/gi));
      if (matches.length === 0) continue;

      for (const match of matches) {
        const suffix = match[1].toUpperCase();
        const label = `Figure ${suffix}`;
        const existing = figures.get(label) || {
          pageNumber,
          caption: "",
          references: new Set<string>(),
        };

        const isCaption = new RegExp(`^Figure\\s+${suffix}\\b`, "i").test(line.text);
        if (isCaption && !existing.caption) {
          existing.caption = line.text;
          existing.pageNumber = pageNumber;
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

  cards.sort((a, b) => {
    const categoryCmp = a.category.localeCompare(b.category);
    if (categoryCmp !== 0) return categoryCmp;
    const titleCmp = a.documentTitle.localeCompare(b.documentTitle);
    if (titleCmp !== 0) return titleCmp;
    if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
    return a.figureLabel.localeCompare(b.figureLabel);
  });

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(cards, null, 2)}\n`);
  console.log(`Wrote ${cards.length} image flashcards to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
