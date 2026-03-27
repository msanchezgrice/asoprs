import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export const maxDuration = 30;

export async function GET() {
  const supabase = getServiceClient();

  const [conceptsRes, edgesRes, docsRes] = await Promise.all([
    supabase
      .from("mindmap_concepts")
      .select("id, name, slug, categories, doc_count, doc_ids")
      .order("doc_count", { ascending: false })
      .limit(800),
    supabase
      .from("mindmap_edges")
      .select("id, source_id, target_id, relationship")
      .limit(500),
    supabase
      .from("documents")
      .select("id, title, category")
      .limit(300),
  ]);

  if (conceptsRes.error) {
    return NextResponse.json(
      { error: conceptsRes.error.message },
      { status: 500 }
    );
  }

  const docMap: Record<string, { title: string; category: string }> = {};
  for (const d of docsRes.data || []) {
    docMap[d.id] = { title: d.title, category: d.category };
  }

  return NextResponse.json({
    concepts: conceptsRes.data || [],
    edges: edgesRes.data || [],
    documents: docMap,
  });
}
