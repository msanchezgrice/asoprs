CREATE TABLE IF NOT EXISTS mindmap_concepts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  categories text[] NOT NULL DEFAULT '{}',
  doc_count int NOT NULL DEFAULT 0,
  doc_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mindmap_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid REFERENCES mindmap_concepts(id) ON DELETE CASCADE,
  target_id uuid REFERENCES mindmap_concepts(id) ON DELETE CASCADE,
  relationship text NOT NULL,
  document_id uuid REFERENCES documents(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(source_id, target_id, relationship)
);

CREATE INDEX idx_mindmap_concepts_slug ON mindmap_concepts(slug);
CREATE INDEX idx_mindmap_edges_source ON mindmap_edges(source_id);
CREATE INDEX idx_mindmap_edges_target ON mindmap_edges(target_id);

ALTER TABLE mindmap_concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE mindmap_edges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read concepts" ON mindmap_concepts FOR SELECT USING (true);
CREATE POLICY "public read edges" ON mindmap_edges FOR SELECT USING (true);;
