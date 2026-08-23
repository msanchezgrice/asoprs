import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET() {
  const supabase = getServiceClient();

  const [docsRes, countsRes] = await Promise.all([
    supabase
      .from("documents")
      .select("id, title, category, page_count, storage_path, created_at")
      .order("category")
      .order("title"),
    supabase
      .from("document_content_counts")
      .select("document_id, flashcard_count, mcq_count"),
  ]);

  if (docsRes.error || countsRes.error) {
    return NextResponse.json({ error: "Unable to load document library" }, { status: 503 });
  }

  const countsByDoc = new Map(
    (countsRes.data || []).map((count) => [count.document_id, count]),
  );

  return NextResponse.json(
    (docsRes.data || []).map((d) => ({
      ...d,
      flashcard_count: Number(countsByDoc.get(d.id)?.flashcard_count ?? 0),
      mcq_count: Number(countsByDoc.get(d.id)?.mcq_count ?? 0),
    })),
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    },
  );
}
