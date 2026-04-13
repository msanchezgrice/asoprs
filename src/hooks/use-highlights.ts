import { useCallback } from "react";
import { removeHighlight } from "@/lib/highlights";

export function useHighlightDelete(onDeleted: (id: string) => void) {
  return useCallback(
    async (id: string) => {
      await removeHighlight(id);
      onDeleted(id);
    },
    [onDeleted]
  );
}
