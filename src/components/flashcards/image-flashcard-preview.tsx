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
}: {
  file: string;
  pageNumber: number;
  width: number;
}) {
  return (
    <Document
      file={file}
      loading={<Loader2 className="h-6 w-6 animate-spin text-coral" />}
    >
      <Page
        pageNumber={pageNumber}
        width={width}
        renderAnnotationLayer={false}
        renderTextLayer={false}
      />
    </Document>
  );
}
