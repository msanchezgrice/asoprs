import { useState, useCallback } from "react";
import { deleteHighlightById, fetchHighlights } from "@/lib/highlights.js";

export interface HighlightRecord {
  id: string;
  document_id: string;
  page_number: number;
  color: string;
  text_content: string | null;
  rects: unknown;
  created_at: string;
}

export function useHighlights(docId: string) {
  const [highlights, setHighlights] = useState<HighlightRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchHighlights(docId);
      setHighlights(data as HighlightRecord[]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load highlights"
      );
    } finally {
      setLoading(false);
    }
  }, [docId]);

  const removeHighlight = useCallback(async (id: string) => {
    try {
      await deleteHighlightById(id);
      setHighlights((prev) => prev.filter((h) => h.id !== id));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete highlight"
      );
      throw err;
    }
  }, []);

  const addHighlight = useCallback((highlight: HighlightRecord) => {
    setHighlights((prev) => [...prev, highlight]);
  }, []);

  return { highlights, loading, error, load, removeHighlight, addHighlight };
}
