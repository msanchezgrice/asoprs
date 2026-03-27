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

const BATCH_SIZE = 20;
const DELAY_MS = 1000;

async function embedBatch(texts: string[]): Promise<number[][]> {
  const result = await genai.models.embedContent({
    model: "gemini-embedding-001",
    contents: texts.map((t) => t.substring(0, 8000)),
    config: { outputDimensionality: 768 },
  });

  return result.embeddings!.map((e) => e.values!);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("AESOPRS Chunk Embedding Pipeline");
  console.log("================================\n");

  const { data: chunks, error } = await supabase
    .from("document_chunks")
    .select("id, content")
    .is("embedding", null)
    .order("id");

  if (error) {
    console.error("Failed to fetch chunks:", error.message);
    return;
  }

  console.log(`Found ${chunks.length} chunks without embeddings\n`);

  let done = 0;
  let failed = 0;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map((c) => c.content);

    try {
      const embeddings = await embedBatch(texts);

      for (let j = 0; j < batch.length; j++) {
        const { error: updateErr } = await supabase
          .from("document_chunks")
          .update({ embedding: JSON.stringify(embeddings[j]) })
          .eq("id", batch[j].id);

        if (updateErr) {
          console.error(`  Update failed for ${batch[j].id}:`, updateErr.message);
          failed++;
        } else {
          done++;
        }
      }

      process.stdout.write(
        `\r  Embedded ${done + failed}/${chunks.length} chunks (${done} ok, ${failed} failed)`
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`\n  Batch error at ${i}: ${msg}`);
      failed += batch.length;

      if (msg.includes("429") || msg.includes("quota")) {
        console.log("  Rate limited, waiting 30s...");
        await sleep(30000);
        i -= BATCH_SIZE;
        failed -= batch.length;
        continue;
      }
    }

    await sleep(DELAY_MS);
  }

  console.log(
    `\n\nDone: ${done} embedded, ${failed} failed out of ${chunks.length} total`
  );
}

main().catch(console.error);
