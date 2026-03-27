import { config } from "dotenv";
import * as path from "path";
config({ path: path.resolve(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import pdfParse from "pdf-parse";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, serviceKey);

const PDF_ROOT = path.resolve(__dirname, "../../ASOPRS_All_PDFs");

const CATEGORIES = [
  "Orbit",
  "Eyelid-Eyebrow",
  "Skin Conditions",
  "Face",
  "Lacrimal",
  "Other",
];

async function getAllPdfs(): Promise<
  { filePath: string; category: string; title: string }[]
> {
  const results: { filePath: string; category: string; title: string }[] = [];

  for (const category of CATEGORIES) {
    const catDir = path.join(PDF_ROOT, category);
    if (!fs.existsSync(catDir)) {
      console.log(`  Skipping missing category dir: ${category}`);
      continue;
    }

    const files = fs.readdirSync(catDir).filter((f) => f.endsWith(".pdf"));
    for (const file of files) {
      if (file === "500 Internal Server Error.pdf") continue;
      const title = file.replace(".pdf", "");
      results.push({
        filePath: path.join(catDir, file),
        category,
        title,
      });
    }
  }

  return results;
}

function chunkText(text: string, maxTokens = 1000): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let current: string[] = [];

  for (const word of words) {
    current.push(word);
    if (current.length >= maxTokens) {
      chunks.push(current.join(" "));
      const overlap = current.slice(-200);
      current = [...overlap];
    }
  }

  if (current.length > 0) {
    chunks.push(current.join(" "));
  }

  return chunks;
}

async function ingestOne(pdf: {
  filePath: string;
  category: string;
  title: string;
}) {
  const fileBuffer = fs.readFileSync(pdf.filePath);
  const fileName = path.basename(pdf.filePath);
  const storagePath = `${pdf.category}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from("pdfs")
    .upload(storagePath, fileBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError && !uploadError.message.includes("already exists")) {
    console.error(`  Upload failed for ${pdf.title}:`, uploadError.message);
    return null;
  }

  let parsed;
  try {
    parsed = await pdfParse(fileBuffer);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`  PDF parse failed for ${pdf.title}:`, msg);
    return null;
  }

  const { data: doc, error: insertError } = await supabase
    .from("documents")
    .insert({
      title: pdf.title,
      category: pdf.category,
      file_path: storagePath,
      storage_path: storagePath,
      page_count: parsed.numpages,
    })
    .select("id")
    .single();

  if (insertError) {
    console.error(`  DB insert failed for ${pdf.title}:`, insertError.message);
    return null;
  }

  const chunks = chunkText(parsed.text);
  const chunkRows = chunks.map((content, i) => ({
    document_id: doc.id,
    chunk_index: i,
    content,
    page_start: null,
    page_end: null,
  }));

  if (chunkRows.length > 0) {
    const { error: chunkError } = await supabase
      .from("document_chunks")
      .insert(chunkRows);

    if (chunkError) {
      console.error(
        `  Chunk insert failed for ${pdf.title}:`,
        chunkError.message
      );
    }
  }

  return { id: doc.id, title: pdf.title, chunks: chunks.length, pages: parsed.numpages };
}

async function main() {
  console.log("AESOPRS PDF Ingestion Pipeline");
  console.log("==============================\n");

  const pdfs = await getAllPdfs();
  console.log(`Found ${pdfs.length} PDFs across ${CATEGORIES.length} categories\n`);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < pdfs.length; i++) {
    const pdf = pdfs[i];
    process.stdout.write(
      `[${i + 1}/${pdfs.length}] ${pdf.title.substring(0, 50)}...`
    );

    const result = await ingestOne(pdf);
    if (result) {
      console.log(` OK (${result.pages}p, ${result.chunks} chunks)`);
      success++;
    } else {
      console.log(` FAILED`);
      failed++;
    }
  }

  console.log(`\nDone: ${success} succeeded, ${failed} failed out of ${pdfs.length} total`);
}

main().catch(console.error);
