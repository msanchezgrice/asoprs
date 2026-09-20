// @vitest-environment node

import fs from "node:fs/promises";
import path from "node:path";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  buildSelectedImageLibraryPdf,
  selectedImageLibraryFilename,
} from "./build-selected-image-library-pdf";
import { IMAGE_LIBRARY_DOWNLOAD_SECTIONS } from "./image-library";

describe("selected image library PDF", () => {
  it("copies only the selected section pages with their embedded images", async () => {
    const sourceBytes = await fs.readFile(
      path.join(
        process.cwd(),
        "public/image-library/asoprs-image-library-complete.pdf",
      ),
    );
    const outputBytes = await buildSelectedImageLibraryPdf(sourceBytes, [
      "eyelid-eyebrow-acquired-laxity",
    ]);
    const outputPdf = await PDFDocument.load(outputBytes);

    expect(outputPdf.getPageCount()).toBe(9);
    for (const page of outputPdf.getPages()) {
      const xObjects = page.node
        .Resources()
        ?.lookupMaybe(PDFName.of("XObject"), PDFDict);
      expect(xObjects?.keys().length).toBeGreaterThan(0);
    }
  });

  it("fails closed when no valid subsection is selected", async () => {
    await expect(
      buildSelectedImageLibraryPdf(new Uint8Array(), ["unknown"]),
    ).rejects.toThrow(/select at least one/i);
  });

  it("uses stable filenames for full and partial exports", () => {
    const allIds = IMAGE_LIBRARY_DOWNLOAD_SECTIONS.map(
      (section) => section.id,
    );
    expect(selectedImageLibraryFilename(allIds)).toBe(
      "asoprs-image-library-complete.pdf",
    );
    expect(selectedImageLibraryFilename(allIds.slice(0, 1))).toBe(
      "asoprs-image-library-selected-sections.pdf",
    );
  });
});
