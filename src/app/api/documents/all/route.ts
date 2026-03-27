import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export async function GET() {
  const supabase = getServiceClient();

  const [docsRes, fcRes, mcqRes] = await Promise.all([
    supabase
      .from("documents")
      .select("id, title, category, page_count, storage_path, created_at")
      .order("category")
      .order("title"),
    supabase.from("flashcards").select("id, document_id"),
    supabase.from("mcq_questions").select("id, document_id"),
  ]);

  if (docsRes.error) {
    return NextResponse.json({ error: docsRes.error.message }, { status: 500 });
  }

  const fcByDoc: Record<string, number> = {};
  for (const fc of fcRes.data || []) {
    fcByDoc[fc.document_id] = (fcByDoc[fc.document_id] || 0) + 1;
  }

  const mcqByDoc: Record<string, number> = {};
  for (const q of mcqRes.data || []) {
    mcqByDoc[q.document_id] = (mcqByDoc[q.document_id] || 0) + 1;
  }

  return NextResponse.json(
    (docsRes.data || []).map((d) => ({
      ...d,
      flashcard_count: fcByDoc[d.id] || 0,
      mcq_count: mcqByDoc[d.id] || 0,
    }))
  );
}
