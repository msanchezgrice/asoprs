import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import sourceCards from "../src/data/image-flashcards.generated.json";
import {
  ALL_IMAGE_LIBRARY_IMAGES,
  IMAGE_LIBRARY_SECTIONS,
} from "../src/features/image-library/image-library";

const require = createRequire(import.meta.url);
const sharp = require("sharp") as typeof import("sharp");
const projectRoot = process.cwd();
const pdfRoot = process.env.ASOPRS_PDF_ROOT
  ? path.resolve(process.env.ASOPRS_PDF_ROOT)
  : path.resolve(projectRoot, "..", "ASOPRS_All_PDFs");
const outputRoot = path.join(projectRoot, "public", "image-library", "figures");
const manifestPath = path.join(projectRoot, "public", "image-library", "complete.json");
const pdfPath = path.join(projectRoot, "public", "image-library", "asoprs-image-library-complete.pdf");
const pdftoppm = process.env.PDFTOPPM_BIN ?? "pdftoppm";
const pythonBin = process.env.IMAGE_LIBRARY_PYTHON_BIN ?? "python3";

type SourceCard = (typeof sourceCards)[number];

const RENDER_OVERRIDES: Record<string, { pageNumber: number; crop: { left: number; top: number; right: number; bottom: number } }> = {
  "eyelid-eyebrow-floppy-eyelid-syndrome-figure-2": { pageNumber: 5, crop: { left: 0.075, top: 0.645, right: 0.635, bottom: 0.93 } },
  "eyelid-eyebrow-horizontal-eyelid-tightening-figure-4": { pageNumber: 4, crop: { left: 0.075, top: 0.58, right: 0.635, bottom: 0.905 } },
  "eyelid-eyebrow-periorbital-hollows-figure-6": { pageNumber: 7, crop: { left: 0.075, top: 0.295, right: 0.455, bottom: 0.91 } },
  "eyelid-eyebrow-upper-eyelid-blepharoplasty-cosmetic-and-functional-surgery-figure-1": { pageNumber: 9, crop: { left: 0.075, top: 0.06, right: 0.82, bottom: 0.255 } },
  "eyelid-eyebrow-upper-eyelid-blepharoplasty-cosmetic-and-functional-surgery-figure-2": { pageNumber: 9, crop: { left: 0.075, top: 0.32, right: 0.82, bottom: 0.525 } },
  "eyelid-eyebrow-marcus-gunn-jaw-winking-syndrome-figure-2": { pageNumber: 4, crop: { left: 0.06, top: 0.41, right: 0.64, bottom: 0.66 } },
};

async function renderFigure(card: SourceCard, imagePath: string, tempRoot: string, pageCache: Map<string, string>) {
  const renderOverride = RENDER_OVERRIDES[card.id];
  const pageNumber = renderOverride?.pageNumber ?? card.pageNumber;
  const crop = renderOverride?.crop ?? card.crop;
  const cacheKey = `${card.storagePath}#${pageNumber}`;
  let pagePath = pageCache.get(cacheKey);

  if (!pagePath) {
    const pagePrefix = path.join(tempRoot, `page-${pageCache.size}`);
    execFileSync(pdftoppm, ["-f", String(pageNumber), "-l", String(pageNumber), "-singlefile", "-r", "180", "-png", path.join(pdfRoot, card.storagePath), pagePrefix]);
    pagePath = `${pagePrefix}.png`;
    pageCache.set(cacheKey, pagePath);
  }

  const page = sharp(pagePath);
  const metadata = await page.metadata();
  if (!metadata.width || !metadata.height) throw new Error(`Could not read page dimensions for ${card.id}`);
  const left = Math.max(0, Math.floor(metadata.width * crop.left));
  const top = Math.max(0, Math.floor(metadata.height * crop.top));
  const right = Math.min(metadata.width, Math.ceil(metadata.width * crop.right));
  const bottom = Math.min(metadata.height, Math.ceil(metadata.height * crop.bottom));
  if (right <= left || bottom <= top) throw new Error(`Invalid crop for ${card.id}`);

  await page
    .extract({ left, top, width: right - left, height: bottom - top })
    .resize({ width: 1600, height: 1200, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 84, chromaSubsampling: "4:2:0", progressive: true })
    .toFile(imagePath);
}

async function main() {
  if (!fs.existsSync(pdfRoot)) throw new Error(`ASOPRS PDF root not found: ${pdfRoot}`);
  const reuseImageAssets = process.env.REUSE_IMAGE_ASSETS === "1";
  if (!reuseImageAssets) fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(outputRoot, { recursive: true });
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "asoprs-complete-library-"));
  const pageCache = new Map<string, string>();

  try {
    for (const [index, entry] of ALL_IMAGE_LIBRARY_IMAGES.entries()) {
      const card = sourceCards.find((candidate) => candidate.id === entry.id);
      if (!card) throw new Error(`Missing source metadata for ${entry.id}`);
      const imagePath = path.join(projectRoot, "public", entry.imagePath);
      if (!reuseImageAssets || !fs.existsSync(imagePath)) {
        await renderFigure(card, imagePath, tempRoot, pageCache);
      }
      if ((index + 1) % 25 === 0 || index + 1 === ALL_IMAGE_LIBRARY_IMAGES.length) {
        console.log(`Rendered ${index + 1}/${ALL_IMAGE_LIBRARY_IMAGES.length}`);
      }
    }

    fs.writeFileSync(manifestPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), sections: IMAGE_LIBRARY_SECTIONS, entries: ALL_IMAGE_LIBRARY_IMAGES }, null, 2)}\n`);
    execFileSync(pythonBin, [path.join(projectRoot, "scripts", "build-complete-image-library-pdf.py"), manifestPath, pdfPath], { stdio: "inherit" });
    console.log(`Wrote ${ALL_IMAGE_LIBRARY_IMAGES.length} images to ${outputRoot}`);
    console.log(`Wrote complete PDF to ${pdfPath}`);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
