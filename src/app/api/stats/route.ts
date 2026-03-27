import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export async function GET() {
  const supabase = getServiceClient();

  const [docsRes, fcRes, mcqRes, conceptsRes, edgesRes] = await Promise.all([
    supabase.from("documents").select("id, category"),
    supabase.from("flashcards").select("id", { count: "exact", head: true }),
    supabase.from("mcq_questions").select("id", { count: "exact", head: true }),
    supabase
      .from("mindmap_concepts")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("mindmap_edges")
      .select("id", { count: "exact", head: true }),
  ]);

  const docs = docsRes.data || [];
  const categoryBreakdown: Record<string, number> = {};
  for (const d of docs) {
    categoryBreakdown[d.category] = (categoryBreakdown[d.category] || 0) + 1;
  }

  return NextResponse.json({
    documents: docs.length,
    flashcards: fcRes.count || 0,
    mcqs: mcqRes.count || 0,
    concepts: conceptsRes.count || 0,
    connections: edgesRes.count || 0,
    categories: categoryBreakdown,
  });
}
