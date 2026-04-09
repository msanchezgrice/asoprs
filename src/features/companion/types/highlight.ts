import { type PdfHighlightRect } from "@/components/pdf/highlight-types";

export interface Highlight {
  id: string;
  document_id: string;
  page_number: number;
  color: string;
  text_content: string | null;
  rects: PdfHighlightRect[];
  created_at: string;
}
