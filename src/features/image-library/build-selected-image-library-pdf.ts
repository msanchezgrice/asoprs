import { PDFDocument } from "pdf-lib";
import {
  ACQUIRED_LAXITY_DOWNLOAD_RESOURCES,
  selectedImagePageIndexes,
} from "./image-library";

export async function buildSelectedImageLibraryPdf(
  sourcePdfBytes: ArrayBuffer | Uint8Array,
  resourceIds: string[],
) {
  const pageIndexes = selectedImagePageIndexes(resourceIds);
  if (pageIndexes.length === 0) {
    throw new Error("Select at least one image-library subsection.");
  }

  const sourcePdf = await PDFDocument.load(sourcePdfBytes);
  const outputPdf = await PDFDocument.create();
  const pages = await outputPdf.copyPages(sourcePdf, pageIndexes);
  for (const page of pages) outputPdf.addPage(page);

  outputPdf.setTitle("ASOPRS Image Library - Selected Subsections");
  outputPdf.setAuthor("ASOPRS Study Portal");
  outputPdf.setSubject("Selected images from Acquired Laxity");
  return outputPdf.save();
}

export function selectedImageLibraryFilename(resourceIds: string[]) {
  const allIds = ACQUIRED_LAXITY_DOWNLOAD_RESOURCES.map(
    (resource) => resource.id,
  );
  const isFullSection =
    resourceIds.length === allIds.length &&
    allIds.every((resourceId) => resourceIds.includes(resourceId));
  return isFullSection
    ? "asoprs-image-library-acquired-laxity.pdf"
    : "asoprs-image-library-acquired-laxity-selection.pdf";
}
