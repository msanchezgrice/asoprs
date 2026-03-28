export interface PdfHighlightRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function isPdfHighlightRectArray(value: unknown): value is PdfHighlightRect[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as PdfHighlightRect).x === "number" &&
        typeof (entry as PdfHighlightRect).y === "number" &&
        typeof (entry as PdfHighlightRect).width === "number" &&
        typeof (entry as PdfHighlightRect).height === "number"
    )
  );
}
