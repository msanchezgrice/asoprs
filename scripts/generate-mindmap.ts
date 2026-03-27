import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });

interface ConceptRaw {
  name: string;
  categories: string[];
  doc_ids: string[];
}

interface EdgeRaw {
  source: string;
  target: string;
  relationship: string;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseJsonArray<T>(text: string): T[] {
  let cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start !== -1 && end !== -1) cleaned = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(cleaned);
  } catch {
    cleaned = cleaned.replace(/,\s*([\]}])/g, "$1");
    return JSON.parse(cleaned);
  }
}

async function generateWithRetry(prompt: string, retries = 3): Promise<string> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: { temperature: 0.3 },
      });
      return response.text || "";
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  Gemini attempt ${attempt + 1}/${retries} failed: ${msg}`);
      if (attempt < retries - 1) await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
    }
  }
  return "[]";
}

async function main() {
  console.log("=== Mind Map Generator ===\n");

  // Fetch all documents with their categories
  const { data: docs } = await supabase
    .from("documents")
    .select("id, title, category")
    .order("category");

  if (!docs || docs.length === 0) {
    console.error("No documents found.");
    return;
  }
  console.log(`Found ${docs.length} documents\n`);

  // Build a doc lookup
  const docLookup: Record<string, { title: string; category: string }> = {};
  for (const d of docs) docLookup[d.id] = { title: d.title, category: d.category };

  // Fetch ALL flashcards (paginate past Supabase 1000 limit)
  const flashcards: { document_id: string; front: string; back: string }[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data } = await supabase
      .from("flashcards")
      .select("document_id, front, back")
      .order("document_id")
      .range(from, from + pageSize - 1);
    if (!data || data.length === 0) break;
    flashcards.push(...data);
    from += data.length;
    if (data.length < pageSize) break;
  }

  if (flashcards.length === 0) {
    console.error("No flashcards found.");
    return;
  }
  console.log(`Found ${flashcards.length} flashcards\n`);

  // Group flashcards by document
  const docFlashcards: Record<string, { front: string; back: string }[]> = {};
  for (const fc of flashcards) {
    if (!docFlashcards[fc.document_id]) docFlashcards[fc.document_id] = [];
    docFlashcards[fc.document_id].push({ front: fc.front, back: fc.back });
  }

  // Ensure every document is represented, even those without flashcards
  for (const d of docs) {
    if (!docFlashcards[d.id]) docFlashcards[d.id] = [];
  }

  // Process documents in batches of 15 for concept extraction
  const allConcepts: Map<string, ConceptRaw> = new Map();
  const batchSize = 15;
  const docIds = Object.keys(docFlashcards);

  for (let i = 0; i < docIds.length; i += batchSize) {
    const batch = docIds.slice(i, i + batchSize);
    console.log(`\n[Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(docIds.length / batchSize)}] Extracting concepts from ${batch.length} docs...`);

    const batchData = batch.map((docId) => {
      const info = docLookup[docId];
      const fcs = docFlashcards[docId].slice(0, 8);
      const fcText = fcs.length > 0
        ? "\nFlashcards:\n" + fcs.map((f) => `Q: ${f.front}\nA: ${f.back}`).join("\n")
        : "";
      return {
        docId,
        title: info?.title || "Unknown",
        category: info?.category || "Other",
        fcText,
      };
    });

    const prompt = `You are a medical education expert in oculoplastic surgery. Extract key CONCEPTS from these study materials. For EACH document, identify 3-5 important concepts (conditions, procedures, anatomy, clinical signs, medications, imaging modalities, etc.).

IMPORTANT: Use STANDARDIZED names so the same concept from different documents merges:
- "CT Imaging" not "CT scan" or "computed tomography"  
- "Thyroid Eye Disease" not "TED" or "Graves ophthalmopathy"
- "Orbital Decompression" not "decompression surgery"
- "Proptosis" not "exophthalmos"
- "Biopsy" for all biopsy types
- "Corticosteroids" not "steroids" or "methylprednisolone"

Documents:
${batchData.map((d) => `--- "${d.title}" [${d.category}] ID:${d.docId} ---${d.fcText}`).join("\n\n")}

Return a JSON array of:
{"name": "Concept Name", "doc_id": "uuid", "category": "Category"}

Return ONLY valid JSON array.`;

    const text = await generateWithRetry(prompt);
    try {
      const concepts = parseJsonArray<{ name: string; doc_id: string; category: string }>(text);
      const validDocIds = new Set(docs.map((d) => d.id));
      for (const c of concepts) {
        if (!c.name || !c.doc_id || !validDocIds.has(c.doc_id)) continue;
        const key = c.name.toLowerCase().trim();
        if (!allConcepts.has(key)) {
          allConcepts.set(key, {
            name: c.name.trim(),
            categories: [c.category || "Other"],
            doc_ids: [c.doc_id],
          });
        } else {
          const existing = allConcepts.get(key)!;
          if (!existing.doc_ids.includes(c.doc_id)) existing.doc_ids.push(c.doc_id);
          if (c.category && !existing.categories.includes(c.category)) existing.categories.push(c.category);
        }
      }
      console.log(`  Extracted ${concepts.length} concept mentions, total unique: ${allConcepts.size}`);
    } catch (err) {
      console.error(`  Failed to parse concepts: ${err}`);
    }

    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log(`\n=== Total unique concepts: ${allConcepts.size} ===\n`);

  const conceptList = Array.from(allConcepts.values());
  const multiDocConcepts = conceptList.filter((c) => c.doc_ids.length >= 2);

  // Sort by doc_count (cross-document concepts first), then alphabetically
  conceptList.sort((a, b) => b.doc_ids.length - a.doc_ids.length || a.name.localeCompare(b.name));
  const topConcepts = conceptList.slice(0, 250);

  console.log(`Multi-document concepts: ${multiDocConcepts.length}`);
  console.log(`Top concepts for edge generation: ${topConcepts.length}\n`);

  const allEdges: EdgeRaw[] = [];
  const edgeBatchSize = 60;

  for (let i = 0; i < topConcepts.length; i += edgeBatchSize) {
    const batch = topConcepts.slice(i, i + edgeBatchSize);
    console.log(`[Edge batch ${Math.floor(i / edgeBatchSize) + 1}/${Math.ceil(topConcepts.length / edgeBatchSize)}] Finding relationships...`);

    const conceptNames = batch.map((c) => `${c.name} (${c.categories.join("/")})`);

    const edgePrompt = `You are a medical knowledge graph expert in oculoplastic surgery. Identify MEANINGFUL clinical relationships between these concepts. Focus especially on CROSS-CATEGORY connections.

Concepts: ${JSON.stringify(conceptNames)}

Return a JSON array of relationships:
{"source": "Exact Concept Name", "target": "Exact Concept Name", "relationship": "type"}

Relationship types: "treats", "causes", "diagnoses", "associated_with", "part_of", "complication_of", "technique_for", "differential_of", "risk_factor_for"

Rules:
- Use ONLY the concept names (without the category in parentheses)
- Generate 25-40 edges per batch
- Prioritize cross-category connections
- Both names MUST exactly match a concept from the list

Return ONLY valid JSON array.`;

    const edgeText = await generateWithRetry(edgePrompt);
    try {
      const edges = parseJsonArray<EdgeRaw>(edgeText);
      const validEdges = edges.filter(
        (e) =>
          allConcepts.has(e.source.toLowerCase().trim()) &&
          allConcepts.has(e.target.toLowerCase().trim())
      );
      allEdges.push(...validEdges);
      console.log(`  Generated ${validEdges.length} valid edges (${edges.length} total)`);
    } catch (err) {
      console.error(`  Failed to parse edges: ${err}`);
    }

    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log(`\n=== Total edges: ${allEdges.length} ===\n`);

  // Clear existing data
  console.log("Clearing existing mindmap data...");
  await supabase.from("mindmap_edges").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("mindmap_concepts").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  // Insert concepts
  console.log(`Inserting ${conceptList.length} concepts...`);
  const conceptRows = conceptList.map((c) => ({
    name: c.name,
    slug: slugify(c.name),
    categories: c.categories,
    doc_count: c.doc_ids.length,
    doc_ids: c.doc_ids,
  }));

  const conceptBatch = 50;
  const insertedConcepts: Record<string, string> = {};

  for (let i = 0; i < conceptRows.length; i += conceptBatch) {
    const batch = conceptRows.slice(i, i + conceptBatch);
    const { data, error } = await supabase.from("mindmap_concepts").insert(batch).select("id, name");
    if (error) {
      console.error(`  Insert error at batch ${i}: ${error.message}`);
    } else if (data) {
      for (const row of data) {
        insertedConcepts[row.name.toLowerCase().trim()] = row.id;
      }
    }
  }
  console.log(`  Inserted ${Object.keys(insertedConcepts).length} concepts`);

  // Insert edges
  const dedupEdges = new Set<string>();
  const edgeRows = allEdges
    .map((e) => {
      const sourceId = insertedConcepts[e.source.toLowerCase().trim()];
      const targetId = insertedConcepts[e.target.toLowerCase().trim()];
      if (!sourceId || !targetId || sourceId === targetId) return null;
      const key = [sourceId, targetId].sort().join("-");
      if (dedupEdges.has(key)) return null;
      dedupEdges.add(key);
      return {
        source_id: sourceId,
        target_id: targetId,
        relationship: e.relationship,
      };
    })
    .filter(Boolean);

  console.log(`Inserting ${edgeRows.length} edges...`);
  for (let i = 0; i < edgeRows.length; i += conceptBatch) {
    const batch = edgeRows.slice(i, i + conceptBatch);
    const { error } = await supabase.from("mindmap_edges").insert(batch);
    if (error) console.error(`  Edge insert error: ${error.message}`);
  }

  console.log("\n=== Mind map generation complete! ===");
  console.log(`Concepts: ${Object.keys(insertedConcepts).length}`);
  console.log(`Edges: ${edgeRows.length}`);
}

main().catch(console.error);
