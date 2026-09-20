import { describe, expect, it } from "vitest";
import {
  ACQUIRED_LAXITY_IMAGES,
  ACQUIRED_LAXITY_RESOURCES,
  ALL_IMAGE_LIBRARY_IMAGES,
  IMAGE_LIBRARY_DOWNLOAD_SECTIONS,
  IMAGE_LIBRARY_SECTIONS,
  buildImageAssetPath,
  normalizeSectionSelection,
  selectedImagePageIndexes,
  sortImageLibraryEntries,
  type ImageLibraryEntry,
} from "./image-library";

describe("image library", () => {
  it("uses the source breadcrumbs for the real first curricular section", () => {
    expect(ACQUIRED_LAXITY_RESOURCES).toEqual([
      "Blepharochalasis Syndrome",
      "Floppy Eyelid Syndrome",
      "Horizontal Eyelid Tightening",
    ]);
    expect(ACQUIRED_LAXITY_IMAGES).toHaveLength(9);
  });

  it("orders every figure by canonical resource order, source page, and label", () => {
    const entries = [entry(10, 1, "Figure 1"), entry(2, 6, "Figure 3"), entry(2, 3, "Figure 1")];
    expect(sortImageLibraryEntries(entries).map((item) => item.figureLabel)).toEqual([
      "Figure 1", "Figure 3", "Figure 1",
    ]);
  });

  it("builds a stable public path for every extracted image file", () => {
    expect(buildImageAssetPath("eyelid-eyebrow-floppy-eyelid-syndrome-figure-1")).toBe(
      "/image-library/figures/eyelid-eyebrow-floppy-eyelid-syndrome-figure-1.jpg",
    );
  });

  it("describes all authoritative sections and standalone-resource groups", () => {
    expect(IMAGE_LIBRARY_SECTIONS).toHaveLength(30);
    expect(IMAGE_LIBRARY_DOWNLOAD_SECTIONS).toHaveLength(29);
    expect(ALL_IMAGE_LIBRARY_IMAGES).toHaveLength(428);
    expect(IMAGE_LIBRARY_SECTIONS[0]).toEqual(expect.objectContaining({
      id: "eyelid-eyebrow-acquired-laxity",
      title: "Acquired Laxity",
      figureCount: 9,
      pdfPath: "/image-library/asoprs-image-library-complete.pdf",
    }));
  });

  it("normalizes selected sections and keeps their pages in resource order", () => {
    expect(normalizeSectionSelection([
      "unknown",
      "eyelid-eyebrow-blepharoplasty",
      "eyelid-eyebrow-acquired-laxity",
      "eyelid-eyebrow-blepharoplasty",
    ])).toEqual([
      "eyelid-eyebrow-acquired-laxity",
      "eyelid-eyebrow-blepharoplasty",
    ]);
    expect(selectedImagePageIndexes(["eyelid-eyebrow-acquired-laxity"])).toHaveLength(9);
  });

  it("uses the page containing the image when a caption wraps to the next page", () => {
    expect(ALL_IMAGE_LIBRARY_IMAGES.find((entry) =>
      entry.id === "eyelid-eyebrow-floppy-eyelid-syndrome-figure-2")?.pageNumber).toBe(5);
    expect(ALL_IMAGE_LIBRARY_IMAGES.find((entry) =>
      entry.id === "eyelid-eyebrow-horizontal-eyelid-tightening-figure-4")?.pageNumber).toBe(4);
  });
});

function entry(resourceOrder: number, pageNumber: number, figureLabel: string): ImageLibraryEntry {
  return {
    id: `${resourceOrder}-${figureLabel}`,
    sectionId: "eyelid-eyebrow-acquired-laxity",
    sectionTitle: "Acquired Laxity",
    domainTitle: "Eyelid/Eyebrow",
    documentTitle: "Example",
    category: "Eyelid-Eyebrow",
    resourceOrder,
    figureLabel,
    pageNumber,
    imagePath: "/placeholder.png",
    caption: "Description",
    sourcePdfPath: "Eyelid-Eyebrow/example.pdf",
  };
}
