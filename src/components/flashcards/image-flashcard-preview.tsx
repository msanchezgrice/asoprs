"use client";

import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Loader2 } from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

export function ImageFlashcardPreview({
  file,
  pageNumber,
  width,
  pageWidth,
  pageHeight,
  crop,
}: {
  file: string;
  pageNumber: number;
  width: number;
  pageWidth: number;
  pageHeight: number;
  crop: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
}) {
  const visibleWidth = Math.max(0.1, crop.right - crop.left);
  const visibleHeight = Math.max(0.1, crop.bottom - crop.top);
  const renderWidth = width / visibleWidth;
  const renderHeight = renderWidth * (pageHeight / pageWidth);
  const frameHeight = renderHeight * visibleHeight;

  return (
    <div
      className="overflow-hidden rounded-xl bg-white shadow-sm"
      style={{ width, height: frameHeight }}
    >
      <div
        style={{
          width: renderWidth,
          height: renderHeight,
          transform: `translate(${-crop.left * renderWidth}px, ${-crop.top * renderHeight}px)`,
          transformOrigin: "top left",
        }}
      >
        <Document
          file={file}
          loading={<Loader2 className="h-6 w-6 animate-spin text-coral" />}
        >
          <Page
            pageNumber={pageNumber}
            width={renderWidth}
            renderAnnotationLayer={false}
            renderTextLayer={false}
          />
        </Document>
      </div>
    </div>
  );
}
