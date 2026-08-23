import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { rejectOversizedBody, requireSameOrigin } from "@/lib/api-security";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const docId = req.nextUrl.searchParams.get("docId");
  if (!docId || !UUID_RE.test(docId)) {
    return NextResponse.json({ error: "Valid docId is required" }, { status: 400 });
  }

  const contentDb = getServiceClient();
  const userDb = await createServerSupabaseClient();
  const {
    data: { user },
  } = await userDb.auth.getUser();

  const { data, error } = await contentDb
    .from("flashcards")
    .select("*")
    .eq("document_id", docId)
    .order("created_at")
    .limit(500);

  if (error) {
    return NextResponse.json({ error: "Unable to load flashcards" }, { status: 503 });
  }

  if (!user || !data?.length) {
    return NextResponse.json(data || [], {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
        "Vary": "Cookie",
      },
    });
  }

  const progressRes = await userDb
    .from("user_flashcard_progress")
    .select("flashcard_id, status, ease_factor, interval_days, next_review, last_reviewed")
    .in(
      "flashcard_id",
      data.map((card) => card.id)
    );

  const progressByCard = new Map(
    (progressRes.data || []).map((entry) => [entry.flashcard_id, entry])
  );

  return NextResponse.json(
    data.map((card) => ({
      ...card,
      ...(progressByCard.get(card.id) || {}),
    })),
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function PATCH(req: NextRequest) {
  const requestError = requireSameOrigin(req) ?? rejectOversizedBody(req, 4_000);
  if (requestError) return requestError;

  const { id, document_id, status, ease_factor, interval_days, next_review, last_reviewed } =
    await req.json();
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  if (
    typeof id !== "string" || !UUID_RE.test(id) ||
    typeof document_id !== "string" || !UUID_RE.test(document_id) ||
    (status !== undefined && !["new", "learning", "mastered"].includes(status)) ||
    (ease_factor !== undefined && (typeof ease_factor !== "number" || !Number.isFinite(ease_factor) || ease_factor < 1 || ease_factor > 5)) ||
    (interval_days !== undefined && (!Number.isInteger(interval_days) || interval_days < 0 || interval_days > 36_500)) ||
    (next_review !== undefined && next_review !== null && (typeof next_review !== "string" || Number.isNaN(Date.parse(next_review)))) ||
    (last_reviewed !== undefined && last_reviewed !== null && (typeof last_reviewed !== "string" || Number.isNaN(Date.parse(last_reviewed))))
  ) {
    return NextResponse.json({ error: "Invalid flashcard progress" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (status) update.status = status;
  if (ease_factor !== undefined) update.ease_factor = ease_factor;
  if (interval_days !== undefined) update.interval_days = interval_days;
  if (next_review) update.next_review = next_review;
  if (last_reviewed) update.last_reviewed = last_reviewed;

  const { error } = await getServiceClient().from("user_flashcard_progress").upsert(
    {
      user_id: user.id,
      flashcard_id: id,
      document_id,
      ...update,
    },
    {
      onConflict: "user_id,flashcard_id",
    }
  );

  if (error) {
    return NextResponse.json({ error: "Unable to save flashcard progress" }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
