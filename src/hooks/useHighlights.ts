import { useCallback, useState } from "react";
import { removeHighlight } from "@/lib/highlights";

export interface HighlightBase {
  id: string;
}

/**
 * Hook for managing a list of highlights with delete support.
 */
export function useHighlights<T extends HighlightBase>(initial: T[] = []) {
  const [highlights, setHighlights] = useState<T[]>(initial);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const deleteHighlight = useCallback(async (id: string) => {
    try {
      await removeHighlight(id);
      setHighlights((prev) => prev.filter((h) => h.id !== id));
      setRemoveError(null);
    } catch (err) {
      setRemoveError(
        err instanceof Error ? err.message : "Failed to remove highlight"
      );
    }
  }, []);

  return { highlights, setHighlights, deleteHighlight, removeError };
}
