import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import sourceCards from "../src/data/image-flashcards.generated.json";
import {
  ACQUIRED_LAXITY_IMAGES,
  ACQUIRED_LAXITY_RESOURCES,
  FIRST_SECTION_TITLE,
} from "../src/features/image-library/image-library";

const require = createRequire(import.meta.url);
const sharp = require("sharp") as typeof import("sharp");

const projectRoot = process.cwd();
const pdfRoot = path.resolve(projectRoot, "..", "ASOPRS_All_PDFs");
const outputRoot = path.join(
  projectRoot,
  "public",
  "image-library",
  "acquired-laxity",
);
const deckPath = path.join(
  projectRoot,
  "public",
  "image-library",
  "asoprs-image-library-acquired-laxity.pptx",
);
const manifestPath = path.join(
  projectRoot,
  "public",
  "image-library",
  "acquired-laxity.json",
);
const pdftoppm = process.env.PDFTOPPM_BIN ?? "pdftoppm";
const pythonBin = process.env.IMAGE_LIBRARY_PYTHON_BIN ?? "python3";

type SourceCard = (typeof sourceCards)[number];

const RENDER_OVERRIDES: Record<
  string,
  {
    pageNumber: number;
    crop: { left: number; top: number; right: number; bottom: number };
  }
> = {
  "eyelid-eyebrow-floppy-eyelid-syndrome-figure-2": {
    pageNumber: 5,
    crop: { left: 0.075, top: 0.645, right: 0.635, bottom: 0.93 },
  },
  "eyelid-eyebrow-horizontal-eyelid-tightening-figure-4": {
    pageNumber: 4,
    crop: { left: 0.075, top: 0.58, right: 0.635, bottom: 0.905 },
  },
  "eyelid-eyebrow-periorbital-hollows-figure-6": {
    pageNumber: 7,
    crop: { left: 0.075, top: 0.295, right: 0.455, bottom: 0.91 },
  },
  "eyelid-eyebrow-upper-eyelid-blepharoplasty-cosmetic-and-functional-surgery-figure-1": {
    pageNumber: 9,
    crop: { left: 0.075, top: 0.06, right: 0.82, bottom: 0.255 },
  },
  "eyelid-eyebrow-upper-eyelid-blepharoplasty-cosmetic-and-functional-surgery-figure-2": {
    pageNumber: 9,
    crop: { left: 0.075, top: 0.32, right: 0.82, bottom: 0.525 },
  },
};

async function renderFigure(card: SourceCard, imagePath: string, tempRoot: string) {
  const renderOverride = RENDER_OVERRIDES[card.id];
  const pageNumber = renderOverride?.pageNumber ?? card.pageNumber;
  const crop = renderOverride?.crop ?? card.crop;
  const pagePrefix = path.join(tempRoot, card.id);
  execFileSync(pdftoppm, [
    "-f",
    String(pageNumber),
    "-l",
    String(pageNumber),
    "-singlefile",
    "-r",
    "216",
    "-png",
    path.join(pdfRoot, card.storagePath),
    pagePrefix,
  ]);

  const pagePath = `${pagePrefix}.png`;
  const page = sharp(pagePath);
  const metadata = await page.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`Could not read rendered page dimensions for ${card.id}`);
  }

  const left = Math.max(0, Math.floor(metadata.width * crop.left));
  const top = Math.max(0, Math.floor(metadata.height * crop.top));
  const right = Math.min(metadata.width, Math.ceil(metadata.width * crop.right));
  const bottom = Math.min(
    metadata.height,
    Math.ceil(metadata.height * crop.bottom),
  );

  await page
    .extract({ left, top, width: right - left, height: bottom - top })
    .jpeg({
      quality: 90,
      chromaSubsampling: "4:4:4",
      mozjpeg: false,
      progressive: false,
    })
    .toFile(imagePath);
}

async function main() {
  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.mkdirSync(path.dirname(deckPath), { recursive: true });
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "asoprs-image-library-"));

  try {
    for (const entry of ACQUIRED_LAXITY_IMAGES) {
      const card = sourceCards.find((candidate) => candidate.id === entry.id);
      if (!card) throw new Error(`Missing source metadata for ${entry.id}`);
      const imagePath = path.join(projectRoot, "public", entry.imagePath);
      await renderFigure(card, imagePath, tempRoot);
      console.log(`Rendered ${entry.id}`);
    }
    fs.writeFileSync(
      manifestPath,
      `${JSON.stringify(
        {
          sectionTitle: FIRST_SECTION_TITLE,
          resources: ACQUIRED_LAXITY_RESOURCES,
          entries: ACQUIRED_LAXITY_IMAGES,
        },
        null,
        2,
      )}\n`,
    );
    execFileSync(
      pythonBin,
      [
        path.join(projectRoot, "scripts", "build-first-image-library-pptx.py"),
        manifestPath,
        deckPath,
      ],
      { stdio: "inherit" },
    );
    console.log(`Wrote ${ACQUIRED_LAXITY_IMAGES.length} images to ${outputRoot}`);
    console.log(`Wrote PowerPoint to ${deckPath}`);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
