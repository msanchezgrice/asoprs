import { config } from "dotenv";
import * as path from "path";
config({ path: path.resolve(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const genai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });

const CONCURRENCY = 2;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function generateWithRetry(
  prompt: string,
  systemInstruction: string,
  retries = 4
): Promise<string> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await genai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: { systemInstruction, temperature: 0.3 },
      });
      return res.text ?? "";
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
        const wait = (attempt + 1) * 30000;
        await sleep(wait);
        continue;
      }
      if (msg.includes("fetch failed") || msg.includes("ECONNRESET") || msg.includes("503") || msg.includes("500")) {
        await sleep(5000 * (attempt + 1));
        continue;
      }
      if (attempt < retries - 1) {
        await sleep(3000);
        continue;
      }
      throw e;
    }
  }
  throw new Error("Max retries exceeded");
}

function parseJsonArray(raw: string): unknown[] {
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    const cleaned = jsonMatch[0].replace(/,\s*\]/g, "]").replace(/,\s*}/g, "}");
    try { return JSON.parse(cleaned); } catch { return []; }
  }
}

async function generateFlashcards(docId: string, title: string, content: string, count: number = 30) {
  const easy = Math.round(count * 0.27);
  const hard = Math.round(count * 0.27);
  const medium = count - easy - hard;
  const system = `You are a medical education specialist. Output ONLY a JSON array.`;
  const prompt = `Create ${count} flashcards for ASOPRS board exam on "${title}".
JSON format: [{"front":"question","back":"answer","difficulty":"easy|medium|hard"},...]
~${easy} easy, ~${medium} medium, ~${hard} hard. Board-relevant. Concise backs (1-3 sentences). Do NOT duplicate any existing flashcard topics.
Content: ${content.substring(0, 10000)}`;

  const raw = await generateWithRetry(prompt, system);
  const cards = parseJsonArray(raw);
  return cards
    .filter((c: unknown): c is { front: string; back: string; difficulty?: string } =>
      typeof c === "object" && c !== null && "front" in c && "back" in c)
    .map((c) => ({
      document_id: docId, front: c.front, back: c.back,
      difficulty: ["easy","medium","hard"].includes(c.difficulty||"") ? c.difficulty : "medium",
    }));
}

async function generateMCQs(docId: string, title: string, content: string, batchNum: number, batchSize: number) {
  const system = `You are an ASOPRS board exam question writer. Output ONLY a JSON array.`;
  const prompt = `Create ${batchSize} MCQs (3 options each) for "${title}" (batch ${batchNum}).
JSON: [{"question":"stem","option_a":"...","option_b":"...","option_c":"...","correct_index":0,"explanation":"brief","difficulty":"easy|medium|hard"},...]
correct_index: 0=A,1=B,2=C. ~30% easy, ~50% medium, ~20% hard. Clinical vignettes for medium/hard.
${batchNum > 1 ? "Cover DIFFERENT subtopics than batch 1." : ""}
Content: ${content.substring(0, 10000)}`;

  const raw = await generateWithRetry(prompt, system);
  const qs = parseJsonArray(raw);
  return qs
    .filter((q: unknown): q is { question: string; option_a: string; option_b: string; option_c: string; correct_index: number; explanation?: string; difficulty?: string } =>
      typeof q === "object" && q !== null && "question" in q && "option_a" in q)
    .map((q) => ({
      document_id: docId, question: q.question,
      option_a: q.option_a, option_b: q.option_b, option_c: q.option_c,
      correct_index: typeof q.correct_index === "number" ? q.correct_index : 0,
      explanation: q.explanation || "",
      difficulty: ["easy","medium","hard"].includes(q.difficulty||"") ? q.difficulty : "medium",
    }));
}

async function processDoc(doc: { id: string; title: string }, index: number, total: number) {
  const label = `[${index + 1}/${total}] ${doc.title.substring(0, 45)}`;

  const { data: chunks, error: chunkErr } = await supabase
    .from("document_chunks").select("content").eq("document_id", doc.id).order("chunk_index");

  if (chunkErr) {
    console.log(`${label}... SKIP (err: ${chunkErr.message})`);
    return { fc: 0, mcq: 0, fcErr: 0, mcqErr: 0 };
  }
  if (!chunks || chunks.length === 0) {
    console.log(`${label}... SKIP (0 chunks for ${doc.id})`);
    return { fc: 0, mcq: 0, fcErr: 0, mcqErr: 0 };
  }

  const fullContent = chunks.map((c) => c.content).join("\n\n");
  if (!fullContent.trim()) {
    console.log(`${label}... SKIP (empty)`);
    return { fc: 0, mcq: 0, fcErr: 0, mcqErr: 0 };
  }

  let fcCount = 0, mcqCount = 0, fcErr = 0, mcqErr = 0;

  const TARGET_FC = 30;
  const { count: existingFc } = await supabase
    .from("flashcards").select("id", { count: "exact", head: true }).eq("document_id", doc.id);

  if ((existingFc || 0) < TARGET_FC) {
    try {
      const needed = TARGET_FC - (existingFc || 0);
      const cards = await generateFlashcards(doc.id, doc.title, fullContent, needed);
      if (cards.length > 0) {
        const { error: e } = await supabase.from("flashcards").insert(cards);
        if (e) throw new Error(e.message);
        fcCount = (existingFc || 0) + cards.length;
      }
    } catch { fcErr = 1; }
    await sleep(500);
  } else {
    fcCount = existingFc || 0;
  }

  const { count: existingMcq } = await supabase
    .from("mcq_questions").select("id", { count: "exact", head: true }).eq("document_id", doc.id);

  if ((existingMcq || 0) < 50) {
    try {
      let docMcqs = 0;
      for (let b = 0; b < 2; b++) {
        const qs = await generateMCQs(doc.id, doc.title, fullContent, b + 1, 50);
        if (qs.length > 0) {
          const { error: e } = await supabase.from("mcq_questions").insert(qs);
          if (e) throw new Error(e.message);
          docMcqs += qs.length;
        }
        await sleep(500);
      }
      mcqCount = docMcqs;
    } catch { mcqErr = 1; }
  } else {
    mcqCount = existingMcq || 0;
  }

  console.log(`${label}... FC:${fcCount}${fcErr ? "(ERR)" : ""} MCQ:${mcqCount}${mcqErr ? "(ERR)" : ""}`);
  return { fc: fcCount, mcq: mcqCount, fcErr, mcqErr };
}

async function main() {
  console.log("AESOPRS Content Generation Pipeline (parallel)");
  console.log("================================================\n");

  const { data: docs, error } = await supabase
    .from("documents").select("id, title").order("title");

  if (error || !docs) { console.error("Failed:", error?.message); return; }

  console.log(`Processing ${docs.length} documents with concurrency ${CONCURRENCY}\n`);

  let fcTotal = 0, mcqTotal = 0, fcFailed = 0, mcqFailed = 0;

  for (let i = 0; i < docs.length; i += CONCURRENCY) {
    const batch = docs.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((doc, j) => processDoc(doc, i + j, docs.length))
    );
    for (const r of results) {
      fcTotal += r.fc; mcqTotal += r.mcq; fcFailed += r.fcErr; mcqFailed += r.mcqErr;
    }
    await sleep(500);
  }

  console.log(`\nDone!\n  Flashcards: ${fcTotal} (${fcFailed} failed)\n  MCQs: ${mcqTotal} (${mcqFailed} failed)`);
}

main().catch(console.error);
