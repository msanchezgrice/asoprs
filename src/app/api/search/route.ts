import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { embedText } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  const { query, category, limit = 10 } = await req.json();

  if (!query || typeof query !== "string") {
    return NextResponse.json(
      { error: "query is required" },
      { status: 400 }
    );
  }

  try {
    const embedding = await embedText(query);
    const supabase = getServiceClient();

    const { data, error } = await supabase.rpc("search_chunks", {
      query_embedding: JSON.stringify(embedding),
      match_count: limit,
      filter_category: category || null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
