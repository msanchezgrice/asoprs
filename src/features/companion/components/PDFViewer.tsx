"use client";

import { useEffect, useState } from "react";
import { PdfReader } from "@/components/pdf/pdf-reader";
import { isPdfHighlightRectArray } from "@/components/pdf/highlight-types";
import type { PdfHighlightRect } from "@/components/pdf/highlight-types";
import { useHighlights } from "../hooks/useHighlights";
import { fetchHighlights, createHighlight } from "@/lib/highlights";
import type { Highlight } from "../types/highlight";

interface PDFViewerProps {
  url: string;
  docId: string;
  highlightMode?: boolean;
  color?: string;
}

/**
 * PDF viewer with integrated highlight and unhighlight support.
 *
 * Fetches existing highlights on mount, allows new highlights to be saved,
 * and enables users to click any highlighted region to remove it.
 */
export function PDFViewer({
  url,
  docId,
  highlightMode = false,
  color = "#FFEB3B",
}: PDFViewerProps) {
  const [initialHighlights, setInitialHighlights] = useState<Highlight[]>([]);

  useEffect(() => {
    fetchHighlights(docId).then((records) => {
      // Only pass PDF rect highlights (not text-chunk highlights) to the viewer
      const pdfOnly = records.filter(
        (r): r is typeof r & { rects: PdfHighlightRect[] } =>
          isPdfHighlightRectArray(r.rects)
      ) as Highlight[];
      setInitialHighlights(pdfOnly);
    });
  }, [docId]);

  const { highlights, addHighlight, removeHighlight } = useHighlights(initialHighlights);

  const handleSaveHighlight = async (
    pageNumber: number,
    text: string,
    rects: PdfHighlightRect[]
  ): Promise<void> => {
    const record = await createHighlight({
      document_id: docId,
      page_number: pageNumber,
      color,
      text_content: text,
      rects,
    });
    if (record && isPdfHighlightRectArray(record.rects)) {
      addHighlight(record as Highlight);
    }
  };

  const pdfHighlights = highlights.map((h) => ({
    id: h.id,
    page_number: h.page_number,
    color: h.color,
    text_content: h.text_content,
    rects: h.rects,
  }));

  return (
    <PdfReader
      url={url}
      highlights={pdfHighlights}
      highlightMode={highlightMode}
      onSaveHighlight={handleSaveHighlight}
      onDeleteHighlight={removeHighlight}
    />
  );
}
