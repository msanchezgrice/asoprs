"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Loader2 } from "lucide-react";
import { isPdfHighlightRectArray, type PdfHighlightRect } from "./highlight-types";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

export interface PdfHighlight {
  id: string;
  page_number: number;
  color: string;
  text_content: string | null;
  rects: PdfHighlightRect[];
}

function normalizeRect(
  rect: DOMRect,
  pageRect: DOMRect
): PdfHighlightRect | null {
  const left = Math.max(rect.left, pageRect.left);
  const top = Math.max(rect.top, pageRect.top);
  const right = Math.min(rect.right, pageRect.right);
  const bottom = Math.min(rect.bottom, pageRect.bottom);
  const width = right - left;
  const height = bottom - top;

  if (width <= 0 || height <= 0 || pageRect.width <= 0 || pageRect.height <= 0) {
    return null;
  }

  return {
    x: (left - pageRect.left) / pageRect.width,
    y: (top - pageRect.top) / pageRect.height,
    width: width / pageRect.width,
    height: height / pageRect.height,
  };
}

export function PdfReader({
  url,
  highlights,
  highlightMode,
  onSaveHighlight,
}: {
  url: string;
  highlights: PdfHighlight[];
  highlightMode: boolean;
  onSaveHighlight: (pageNumber: number, text: string, rects: PdfHighlightRect[]) => Promise<void>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageWidth, setPageWidth] = useState(900);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const node = containerRef.current;
    const updateWidth = () => {
      const nextWidth = Math.max(280, Math.min(960, node.clientWidth - 32));
      setPageWidth(nextWidth);
    };

    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const highlightsByPage = useMemo(() => {
    const grouped = new Map<number, PdfHighlight[]>();

    for (const highlight of highlights) {
      const existing = grouped.get(highlight.page_number) || [];
      existing.push(highlight);
      grouped.set(highlight.page_number, existing);
    }

    return grouped;
  }, [highlights]);

  const handleMouseUp = useCallback(async () => {
    if (!highlightMode) {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      return;
    }

    const range = selection.getRangeAt(0);
    const anchor =
      range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? (range.commonAncestorContainer as Element)
        : range.commonAncestorContainer.parentElement;
    const pageNode = anchor?.closest<HTMLElement>("[data-pdf-page-number]");

    if (!pageNode) {
      return;
    }

    const pageNumber = Number(pageNode.dataset.pdfPageNumber || "0");
    const pageRect = pageNode.getBoundingClientRect();
    const rects = Array.from(range.getClientRects())
      .map((rect) => normalizeRect(rect, pageRect))
      .filter((rect): rect is PdfHighlightRect => rect !== null);

    if (!pageNumber || rects.length === 0) {
      selection.removeAllRanges();
      return;
    }

    const text = selection.toString().trim();
    selection.removeAllRanges();
    await onSaveHighlight(pageNumber, text, rects);
  }, [highlightMode, onSaveHighlight]);

  if (loadingError) {
    return (
      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-ivory-dark/50 p-4 md:p-8"
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          <div className="rounded-xl border border-ivory-dark bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800 shadow-sm">
            PDF highlights save directly on the document, but this file could not be rendered in-app.
          </div>
          <div className="rounded-xl border border-coral/20 bg-white p-6 text-sm text-coral shadow-sm">
            Unable to render this PDF in-app. {loadingError}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-auto bg-ivory-dark/50 p-4 md:p-8"
      onMouseUp={() => {
        void handleMouseUp();
      }}
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="rounded-xl border border-ivory-dark bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800 shadow-sm">
          PDF highlights now save directly on the document. Turn on <span className="font-semibold">Highlight</span>, then drag over text on any page.
        </div>

        <Document
          file={url}
          loading={
            <div className="flex items-center justify-center rounded-xl border border-ivory-dark bg-white p-12 shadow-sm">
              <Loader2 className="h-6 w-6 animate-spin text-coral" />
              <span className="ml-3 text-sm text-warm-gray">Loading PDF…</span>
            </div>
          }
          onLoadSuccess={({ numPages: totalPages }) => {
            setLoadingError(null);
            setNumPages(totalPages);
          }}
          onLoadError={(error) => {
            setLoadingError(error.message);
          }}
        >
          {Array.from({ length: numPages }, (_, index) => {
            const pageNumber = index + 1;
            const pageHighlights = highlightsByPage.get(pageNumber) || [];

            return (
              <div
                key={pageNumber}
                data-pdf-page-number={pageNumber}
                className={`relative mx-auto overflow-hidden rounded-xl border border-ivory-dark bg-white shadow-sm ${highlightMode ? "cursor-text" : ""}`}
                style={{ width: pageWidth }}
              >
                <Page
                  pageNumber={pageNumber}
                  width={pageWidth}
                  renderAnnotationLayer
                  renderTextLayer
                />

                <div className="pointer-events-none absolute inset-0">
                  {pageHighlights.map((highlight) =>
                    highlight.rects.map((rect, rectIndex) => (
                      <div
                        key={`${highlight.id}-${rectIndex}`}
                        className="absolute rounded-[2px]"
                        style={{
                          left: `${rect.x * 100}%`,
                          top: `${rect.y * 100}%`,
                          width: `${rect.width * 100}%`,
                          height: `${rect.height * 100}%`,
                          backgroundColor: `${highlight.color}66`,
                        }}
                        title={highlight.text_content || "Saved highlight"}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </Document>
      </div>
    </div>
  );
}
