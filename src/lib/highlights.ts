import type { PdfHighlightRect } from "@/components/pdf/highlight-types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidHighlightId(id: string): boolean {
  return UUID_RE.test(id);
}

export async function deleteHighlightById(id: string): Promise<void> {
  if (!isValidHighlightId(id)) {
    throw new Error("Invalid highlight ID format");
  }

  const response = await fetch(
    `/api/highlights?id=${encodeURIComponent(id)}`,
    { method: "DELETE" }
  );

  if (!response.ok) {
    throw new Error(`Failed to delete highlight: ${response.status}`);
  }
}

/**
 * Remove a highlight by id from a list, returning a new array without mutation.
 */
export function removeHighlightById<T extends { id: string }>(
  highlights: T[],
  id: string
): T[] {
  return highlights.filter((h) => h.id !== id);
}

/**
 * Group highlights by page number into a Map for efficient per-page lookup.
 */
export function groupHighlightsByPage<T extends { page_number: number }>(
  highlights: T[]
): Map<number, T[]> {
  const grouped = new Map<number, T[]>();
  for (const highlight of highlights) {
    const existing = grouped.get(highlight.page_number) ?? [];
    existing.push(highlight);
    grouped.set(highlight.page_number, existing);
  }
  return grouped;
}

/**
 * Returns true when two PdfHighlightRects overlap (exclusive boundaries).
 */
export function rectsOverlap(a: PdfHighlightRect, b: PdfHighlightRect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/**
 * Given a list of highlights, returns the ids of highlights whose rects
 * overlap with any rect of the target highlight (excluding the target itself).
 */
export function findOverlappingHighlightIds(
  targetId: string,
  highlights: Array<{ id: string; rects: PdfHighlightRect[] }>
): string[] {
  const target = highlights.find((h) => h.id === targetId);
  if (!target) return [];

  return highlights
    .filter((h) => {
      if (h.id === targetId) return false;
      return target.rects.some((tr) => h.rects.some((hr) => rectsOverlap(tr, hr)));
    })
    .map((h) => h.id);
}
