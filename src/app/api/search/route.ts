import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import { embedText } from "@/lib/gemini";
import {
  enforcePaidRateLimit,
  rejectOversizedBody,
  requireSameOrigin,
  requireUser,
} from "@/lib/api-security";

export async function POST(req: NextRequest) {
  const requestError = requireSameOrigin(req) ?? rejectOversizedBody(req, 8_000);
  if (requestError) return requestError;

  const auth = await requireUser({ verifiedEmail: true });
  if (!auth.ok) return auth.response;

  const rateLimit = await enforcePaidRateLimit(req, auth.user.id, "semantic_search", {
    user: 60,
    ip: 120,
    global: 3_000,
    windowSeconds: 600,
  });
  if (rateLimit) return rateLimit;

  const { query, category, limit = 10 } = await req.json();

  if (
    !query || typeof query !== "string" || query.length > 1_000 ||
    (category !== undefined && (typeof category !== "string" || category.length > 100))
  ) {
    return NextResponse.json(
      { error: "query is required" },
      { status: 400 }
    );
  }

  try {
    const matchCount = Number.isFinite(Number(limit))
      ? Math.min(20, Math.max(1, Math.trunc(Number(limit))))
      : 10;
    const embedding = await embedText(query);
    const supabase = getServiceClient();

    const { data, error } = await supabase.rpc("search_chunks", {
      query_embedding: JSON.stringify(embedding),
      match_count: matchCount,
      filter_category: category || null,
    });

    if (error) {
      return NextResponse.json({ error: "Search unavailable" }, { status: 503 });
    }

    return NextResponse.json(data);
  } catch (e: unknown) {
    console.error("Semantic search failed:", e);
    return NextResponse.json({ error: "Search unavailable" }, { status: 503 });
  }
}
