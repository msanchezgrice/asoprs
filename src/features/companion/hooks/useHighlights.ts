"use client";

import { useState, useCallback } from "react";
import { type Highlight } from "../types/highlight";
import { deleteHighlightById } from "@/lib/highlights";

export function useHighlights(initialHighlights: Highlight[] = []) {
  const [highlights, setHighlights] = useState<Highlight[]>(initialHighlights);

  const removeHighlight = useCallback(async (id: string): Promise<void> => {
    await deleteHighlightById(id);
    setHighlights((prev) => prev.filter((h) => h.id !== id));
  }, []);

  const addHighlight = useCallback((highlight: Highlight): void => {
    setHighlights((prev) => [...prev, highlight]);
  }, []);

  return { highlights, setHighlights, addHighlight, removeHighlight };
}
