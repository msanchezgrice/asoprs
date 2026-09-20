import { PDFDocument } from "pdf-lib";
import {
  IMAGE_LIBRARY_DOWNLOAD_SECTIONS,
  selectedImagePageIndexes,
} from "./image-library";

export async function buildSelectedImageLibraryPdf(
  sourcePdfBytes: ArrayBuffer | Uint8Array,
  sectionIds: string[],
) {
  const pageIndexes = selectedImagePageIndexes(sectionIds);
  if (pageIndexes.length === 0) {
    throw new Error("Select at least one image-library section.");
  }

  const sourcePdf = await PDFDocument.load(sourcePdfBytes);
  const outputPdf = await PDFDocument.create();
  const pages = await outputPdf.copyPages(sourcePdf, pageIndexes);
  for (const page of pages) outputPdf.addPage(page);

  outputPdf.setTitle("ASOPRS Image Library - Selected Sections");
  outputPdf.setAuthor("ASOPRS Study Portal");
  outputPdf.setSubject("Selected images from the ASOPRS curriculum");
  return outputPdf.save();
}

export function selectedImageLibraryFilename(sectionIds: string[]) {
  const allIds = IMAGE_LIBRARY_DOWNLOAD_SECTIONS.map(
    (section) => section.id,
  );
  const isFullSection =
    sectionIds.length === allIds.length &&
    allIds.every((sectionId) => sectionIds.includes(sectionId));
  return isFullSection
    ? "asoprs-image-library-complete.pdf"
    : "asoprs-image-library-selected-sections.pdf";
}
