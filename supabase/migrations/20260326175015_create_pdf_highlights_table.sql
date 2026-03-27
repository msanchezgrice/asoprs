CREATE TABLE pdf_highlights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_number integer NOT NULL,
  color text NOT NULL DEFAULT '#FFEB3B',
  text_content text,
  rects jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_pdf_highlights_document_id ON pdf_highlights(document_id);;
