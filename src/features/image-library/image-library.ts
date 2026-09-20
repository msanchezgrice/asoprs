import cards from "@/data/image-flashcards.generated.json";
import catalog from "@/data/image-library-sections.generated.json";

export const COMPLETE_IMAGE_LIBRARY_PDF_PATH =
  "/image-library/asoprs-image-library-complete.pdf";

export type ImageLibraryEntry = {
  id: string;
  sectionId: string;
  sectionTitle: string;
  domainTitle: string;
  documentTitle: string;
  category: string;
  resourceOrder: number;
  figureLabel: string;
  pageNumber: number;
  imagePath: string;
  caption: string;
  sourcePdfPath: string;
};

export type ImageLibraryResource = {
  id: string;
  title: string;
  figureCount: number;
  resourceOrder: number;
};

export type ImageLibrarySection = {
  id: string;
  title: string;
  domainTitle: string;
  isAuthoritativeSection: boolean;
  order: number;
  resourceCount: number;
  figureCount: number;
  resources: ImageLibraryResource[];
  pdfPath: string;
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
    "Figure 6. The lateral 'Charlie Brown' hollow forms between the lateral orbital fat pad and adjacent malar fat. Upper: debulking the puffy lateral fat pad with blepharoplasty improves the contour, here combined with midface lift. Lower: another option is conservative, feathered filling of the hollow.",
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
  return `/image-library/figures/${id}.jpg`;
}

function figureNumber(label: string) {
  return Number.parseInt(label.match(/\d+/)?.[0] ?? "0", 10);
}

const catalogGroups = catalog.domains.flatMap((domain) =>
  domain.groups.map((group) => ({ ...group, domainOrder: domain.order })),
);

const resourceCatalog = catalogGroups.flatMap((group) =>
  group.resources.map((resource) => ({
    ...resource,
    sectionId: group.id,
    sectionTitle: group.displayTitle,
    domainTitle: group.domainTitle,
  })),
);

const resourceByStoragePath = new Map(
  resourceCatalog.map((resource) => [resource.storagePath, resource]),
);

export function sortImageLibraryEntries<T extends ImageLibraryEntry>(entries: T[]) {
  return [...entries].sort((a, b) => {
    if (a.resourceOrder !== b.resourceOrder) {
      return a.resourceOrder - b.resourceOrder;
    }
    if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
    return figureNumber(a.figureLabel) - figureNumber(b.figureLabel);
  });
}

export const ALL_IMAGE_LIBRARY_IMAGES = sortImageLibraryEntries(
  cards.flatMap((card) => {
    const resource = resourceByStoragePath.get(card.storagePath);
    if (!resource) return [];
    return [
      {
        id: card.id,
        sectionId: resource.sectionId,
        sectionTitle: resource.sectionTitle,
        domainTitle: resource.domainTitle,
        documentTitle: card.documentTitle,
        category: card.category,
        resourceOrder: resource.resourceOrder,
        figureLabel: card.figureLabel,
        pageNumber: IMAGE_PAGE_OVERRIDES[card.id] ?? card.pageNumber,
        imagePath: buildImageAssetPath(card.id),
        caption: CAPTION_OVERRIDES[card.id] ?? card.caption,
        sourcePdfPath: card.storagePath,
      },
    ];
  }),
);

export const IMAGE_LIBRARY_SECTIONS: ImageLibrarySection[] = catalogGroups
  .map((group) => ({
    id: group.id,
    title: group.displayTitle,
    domainTitle: group.domainTitle,
    isAuthoritativeSection: group.isAuthoritativeSection,
    order: group.order,
    resourceCount: group.resourceCount,
    figureCount: ALL_IMAGE_LIBRARY_IMAGES.filter(
      (entry) => entry.sectionId === group.id,
    ).length,
    resources: group.resources.map((resource) => ({
      id: resource.id,
      title: resource.title,
      resourceOrder: resource.resourceOrder,
      figureCount: ALL_IMAGE_LIBRARY_IMAGES.filter(
        (entry) => entry.sourcePdfPath === resource.storagePath,
      ).length,
    })),
    pdfPath: COMPLETE_IMAGE_LIBRARY_PDF_PATH,
  }))
  .sort((a, b) => a.order - b.order);

export const IMAGE_LIBRARY_DOWNLOAD_SECTIONS = IMAGE_LIBRARY_SECTIONS.filter(
  (section) => section.figureCount > 0,
);

export const FIRST_SECTION_TITLE = "Acquired Laxity";
export const ACQUIRED_LAXITY_RESOURCES = IMAGE_LIBRARY_SECTIONS.find(
  (section) => section.id === "eyelid-eyebrow-acquired-laxity",
)!.resources.map((resource) => resource.title);
export const ACQUIRED_LAXITY_IMAGES = ALL_IMAGE_LIBRARY_IMAGES.filter(
  (entry) => entry.sectionId === "eyelid-eyebrow-acquired-laxity",
);

export function normalizeSectionSelection(sectionIds: string[]) {
  const requestedIds = new Set(sectionIds);
  return IMAGE_LIBRARY_DOWNLOAD_SECTIONS.filter((section) =>
    requestedIds.has(section.id),
  ).map((section) => section.id);
}

export function selectedImagePageIndexes(sectionIds: string[]) {
  const normalizedIds = new Set(normalizeSectionSelection(sectionIds));
  return ALL_IMAGE_LIBRARY_IMAGES.map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => normalizedIds.has(entry.sectionId))
    .map(({ index }) => index);
}
