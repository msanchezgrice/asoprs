import { describe, expect, it } from "vitest";
import {
  ACQUIRED_LAXITY_IMAGES,
  ACQUIRED_LAXITY_DOWNLOAD_RESOURCES,
  ACQUIRED_LAXITY_RESOURCES,
  IMAGE_LIBRARY_SECTIONS,
  buildImageAssetPath,
  normalizeResourceSelection,
  selectedImagePageIndexes,
  sortImageLibraryEntries,
  type ImageLibraryEntry,
} from "./image-library";

describe("image library", () => {
  it("keeps the first curricular section in ASOPRS index order", () => {
    expect(ACQUIRED_LAXITY_RESOURCES).toEqual([
      "Blepharochalasis Syndrome",
      "Floppy Eyelid Syndrome",
      "Horizontal Eyelid Tightening",
      "Lateral and Medial Canthoplasty",
      "Lower Eyelid Blepharoplasty",
      "Periorbital Hollows",
      "Upper Eyelid Blepharoplasty- Cosmetic and Functional Surgery",
    ]);
  });

  it("orders figures by resource, source page, and figure label", () => {
    const entries = [
      entry("Periorbital Hollows", 1, "Figure 1"),
      entry("Floppy Eyelid Syndrome", 6, "Figure 3"),
      entry("Floppy Eyelid Syndrome", 3, "Figure 1"),
    ];

    expect(sortImageLibraryEntries(entries).map((item) => item.figureLabel)).toEqual([
      "Figure 1",
      "Figure 3",
      "Figure 1",
    ]);
  });

  it("builds a stable public path for each extracted image file", () => {
    expect(
      buildImageAssetPath("eyelid-eyebrow-floppy-eyelid-syndrome-figure-1"),
    ).toBe(
      "/image-library/acquired-laxity/eyelid-eyebrow-floppy-eyelid-syndrome-figure-1.jpg",
    );
  });

  it("describes downloadable PDFs in curriculum order", () => {
    expect(IMAGE_LIBRARY_SECTIONS).toEqual([
      expect.objectContaining({
        id: "acquired-laxity",
        title: "Acquired Laxity",
        figureCount: 24,
        pdfPath: "/image-library/asoprs-image-library-acquired-laxity.pdf",
      }),
    ]);
  });

  it("normalizes selected subsections and keeps their pages in curriculum order", () => {
    expect(
      normalizeResourceSelection([
        "unknown",
        "periorbital-hollows",
        "floppy-eyelid-syndrome",
        "periorbital-hollows",
      ]),
    ).toEqual(["floppy-eyelid-syndrome", "periorbital-hollows"]);
    expect(
      selectedImagePageIndexes([
        "periorbital-hollows",
        "floppy-eyelid-syndrome",
      ]),
    ).toEqual([1, 2, 3, 4, 13, 14, 15, 16, 17, 18, 19, 20, 21]);
    expect(ACQUIRED_LAXITY_DOWNLOAD_RESOURCES.map((item) => item.figureCount)).toEqual([
      1, 4, 4, 3, 1, 9, 2,
    ]);
  });

  it("uses the page containing the image when a caption wraps to the next page", () => {
    expect(
      ACQUIRED_LAXITY_IMAGES.find(
        (entry) => entry.id === "eyelid-eyebrow-floppy-eyelid-syndrome-figure-2",
      )?.pageNumber,
    ).toBe(5);
    expect(
      ACQUIRED_LAXITY_IMAGES.find(
        (entry) => entry.id === "eyelid-eyebrow-horizontal-eyelid-tightening-figure-4",
      )?.pageNumber,
    ).toBe(4);
    expect(
      ACQUIRED_LAXITY_IMAGES.find(
        (entry) => entry.id === "eyelid-eyebrow-periorbital-hollows-figure-6",
      )?.pageNumber,
    ).toBe(7);
    expect(
      ACQUIRED_LAXITY_IMAGES.find(
        (entry) =>
          entry.id ===
          "eyelid-eyebrow-upper-eyelid-blepharoplasty-cosmetic-and-functional-surgery-figure-1",
      )?.pageNumber,
    ).toBe(9);
  });
});

function entry(
  documentTitle: string,
  pageNumber: number,
  figureLabel: string,
): ImageLibraryEntry {
  return {
    id: `${documentTitle}-${figureLabel}`,
    sectionTitle: "Acquired Laxity",
    documentTitle,
    category: "Eyelid-Eyebrow",
    figureLabel,
    pageNumber,
    imagePath: "/placeholder.png",
    caption: "Description",
    sourcePdfPath: "Eyelid-Eyebrow/example.pdf",
  };
}
