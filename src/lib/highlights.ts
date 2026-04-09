import type { PdfHighlightRect } from "@/components/pdf/highlight-types";

export interface HighlightRecord {
  id: string;
  document_id: string;
  page_number: number;
  color: string;
  text_content: string | null;
  rects: PdfHighlightRect[] | { chunkIndex: number; startOffset: number; endOffset: number };
  created_at: string;
}

export interface SavePdfHighlightInput {
  document_id: string;
  page_number: number;
  color: string;
  text_content: string;
  rects: PdfHighlightRect[];
}

export interface SaveTextHighlightInput {
  document_id: string;
  page_number: number;
  color: string;
  text_content: string;
  rects: { chunkIndex: number; startOffset: number; endOffset: number };
}

/**
 * Fetch all highlights for a document.
 */
export async function fetchHighlights(docId: string): Promise<HighlightRecord[]> {
  const res = await fetch(`/api/highlights?docId=${encodeURIComponent(docId)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Save a new highlight (PDF rect-based or text offset-based).
 * Returns the saved record or null on failure.
 */
export async function saveHighlight(
  input: SavePdfHighlightInput | SaveTextHighlightInput
): Promise<HighlightRecord | null> {
  const res = await fetch("/api/highlights", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.id ? (data as HighlightRecord) : null;
}

/**
 * Remove a highlight by its ID.
 * Returns true on success.
 */
export async function removeHighlight(id: string): Promise<boolean> {
  const res = await fetch(`/api/highlights?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  return res.ok;
}
