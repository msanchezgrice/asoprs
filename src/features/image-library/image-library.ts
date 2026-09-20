import cards from "@/data/image-flashcards.generated.json";

export const FIRST_SECTION_TITLE = "Acquired Laxity";

export const ACQUIRED_LAXITY_RESOURCES = [
  "Blepharochalasis Syndrome",
  "Floppy Eyelid Syndrome",
  "Horizontal Eyelid Tightening",
  "Lateral and Medial Canthoplasty",
  "Lower Eyelid Blepharoplasty",
  "Periorbital Hollows",
  "Upper Eyelid Blepharoplasty- Cosmetic and Functional Surgery",
] as const;

export type ImageLibraryEntry = {
  id: string;
  sectionTitle: string;
  documentTitle: string;
  category: string;
  figureLabel: string;
  pageNumber: number;
  imagePath: string;
  caption: string;
  sourcePdfPath: string;
};

const CAPTION_OVERRIDES: Record<string, string> = {
  "eyelid-eyebrow-horizontal-eyelid-tightening-figure-4":
    "Figure 4. En bloc elevation of lateral canthus via subperiosteal dissection and placement of permanent suture through the canthal body.",
  "eyelid-eyebrow-lateral-and-medial-canthoplasty-figure-3":
    "Figure 3. Kuhnt-Szymanowski procedure. From Callahan A. Reconstructive Surgery of the Eyelids and Ocular Adnexa, 1966.",
  "eyelid-eyebrow-lower-eyelid-blepharoplasty-figure-1":
    "Figure 1. Positive, neutral, and negative vectors. A vertical line is drawn from the center of the pupil to the infraorbital rim. Patients with a positive vector have anterior projection of the rim, whereas those with a negative vector have anterior projection of the globe compared with the rim.",
  "eyelid-eyebrow-periorbital-hollows-figure-1":
    "Figure 1. Aging changes are characterized by deflation, with loss of volume along the superior and inferior orbital rim.",
  "eyelid-eyebrow-periorbital-hollows-figure-2":
    "Figure 2. This patient has some fullness of the inferior orbital fat and might be improved with fat removal, but a more natural and effective rejuvenation recognizes and treats the periorbital hollows. Blue: orbital rim hollow. Purple: zygomatic hollow. Green: septal confluence hollow.",
  "eyelid-eyebrow-periorbital-hollows-figure-3":
    "Figure 3. Volume loss occurs in areas of deep ligamentous attachments from bone to skin, particularly the orbital rim ligament (blue) and zygomatic ligament (purple).",
  "eyelid-eyebrow-periorbital-hollows-figure-4":
    "Figure 4. The malar triangle is a potential space that can fill with boggy edema, bound by the orbital rim ligament (blue) and the zygomatic ligament (purple).",
  "eyelid-eyebrow-periorbital-hollows-figure-5":
    "Figure 5. Filling the superior orbital hollow. A 39-year-old woman with a hollow superior orbital rim, before and after 1 mL Restylane filling.",
  "eyelid-eyebrow-periorbital-hollows-figure-6":
    "Figure 6. The lateral ‘Charlie Brown’ hollow forms between the lateral orbital fat pad and adjacent malar fat. Upper: debulking the puffy lateral fat pad with blepharoplasty improves the contour, here combined with midface lift. Lower: another option is conservative, feathered filling of the hollow.",
  "eyelid-eyebrow-periorbital-hollows-figure-7":
    "Figure 7. Patient before and after filling the periorbital hollows, with 1 mL Restylane split between the sides. Blue: orbital rim hollow. Purple: zygomatic hollow.",
  "eyelid-eyebrow-upper-eyelid-blepharoplasty-cosmetic-and-functional-surgery-figure-1":
    "Figure 1. Before and after upper trapezoidal blepharoplasty to create a double eyelid in an East Asian patient. Courtesy Robert Fante, MD.",
  "eyelid-eyebrow-upper-eyelid-blepharoplasty-cosmetic-and-functional-surgery-figure-2":
    "Figure 2. Before and after upper blepharoplasty in a Caucasian patient using lid-crease fixation. Courtesy Robert Fante, MD.",
};

const IMAGE_PAGE_OVERRIDES: Record<string, number> = {
  "eyelid-eyebrow-floppy-eyelid-syndrome-figure-2": 5,
  "eyelid-eyebrow-horizontal-eyelid-tightening-figure-4": 4,
  "eyelid-eyebrow-periorbital-hollows-figure-6": 7,
  "eyelid-eyebrow-upper-eyelid-blepharoplasty-cosmetic-and-functional-surgery-figure-1": 9,
};

export function buildImageAssetPath(id: string) {
  return `/image-library/acquired-laxity/${id}.jpg`;
}

function resourceOrder(documentTitle: string) {
  const index = ACQUIRED_LAXITY_RESOURCES.indexOf(
    documentTitle as (typeof ACQUIRED_LAXITY_RESOURCES)[number],
  );
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function figureNumber(label: string) {
  return Number.parseInt(label.match(/\d+/)?.[0] ?? "0", 10);
}

export function sortImageLibraryEntries<T extends ImageLibraryEntry>(entries: T[]) {
  return [...entries].sort((a, b) => {
    const resourceDifference =
      resourceOrder(a.documentTitle) - resourceOrder(b.documentTitle);
    if (resourceDifference !== 0) return resourceDifference;
    if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
    return figureNumber(a.figureLabel) - figureNumber(b.figureLabel);
  });
}

export const ACQUIRED_LAXITY_IMAGES = sortImageLibraryEntries(
  cards
    .filter((card) =>
      ACQUIRED_LAXITY_RESOURCES.includes(
        card.documentTitle as (typeof ACQUIRED_LAXITY_RESOURCES)[number],
      ),
    )
    .map((card) => ({
      id: card.id,
      sectionTitle: FIRST_SECTION_TITLE,
      documentTitle: card.documentTitle,
      category: card.category,
      figureLabel: card.figureLabel,
      pageNumber: IMAGE_PAGE_OVERRIDES[card.id] ?? card.pageNumber,
      imagePath: buildImageAssetPath(card.id),
      caption: CAPTION_OVERRIDES[card.id] ?? card.caption,
      sourcePdfPath: card.storagePath,
    })),
);

export type ImageLibrarySection = {
  id: string;
  title: string;
  resourceCount: number;
  figureCount: number;
  pdfPath: string;
};

export type ImageLibraryResource = {
  id: string;
  title: string;
  figureCount: number;
};

export const IMAGE_LIBRARY_SECTIONS: ImageLibrarySection[] = [
  {
    id: "acquired-laxity",
    title: FIRST_SECTION_TITLE,
    resourceCount: ACQUIRED_LAXITY_RESOURCES.length,
    figureCount: ACQUIRED_LAXITY_IMAGES.length,
    pdfPath: "/image-library/asoprs-image-library-acquired-laxity.pdf",
  },
];

function resourceId(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const ACQUIRED_LAXITY_DOWNLOAD_RESOURCES: ImageLibraryResource[] =
  ACQUIRED_LAXITY_RESOURCES.map((title) => ({
    id: resourceId(title),
    title,
    figureCount: ACQUIRED_LAXITY_IMAGES.filter(
      (entry) => entry.documentTitle === title,
    ).length,
  }));

export function normalizeResourceSelection(resourceIds: string[]) {
  const requestedIds = new Set(resourceIds);
  return ACQUIRED_LAXITY_DOWNLOAD_RESOURCES.filter((resource) =>
    requestedIds.has(resource.id),
  ).map((resource) => resource.id);
}

export function selectedImagePageIndexes(resourceIds: string[]) {
  const normalizedIds = new Set(normalizeResourceSelection(resourceIds));
  const selectedTitles = new Set(
    ACQUIRED_LAXITY_DOWNLOAD_RESOURCES.filter((resource) =>
      normalizedIds.has(resource.id),
    ).map((resource) => resource.title),
  );
  return ACQUIRED_LAXITY_IMAGES.map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => selectedTitles.has(entry.documentTitle))
    .map(({ index }) => index);
}
