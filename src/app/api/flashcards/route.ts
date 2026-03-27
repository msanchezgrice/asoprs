import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const docId = req.nextUrl.searchParams.get("docId");
  const contentDb = getServiceClient();
  const userDb = await createServerSupabaseClient();
  const {
    data: { user },
  } = await userDb.auth.getUser();

  let query = contentDb.from("flashcards").select("*").order("created_at");

  if (docId) {
    query = query.eq("document_id", docId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!user || !data?.length) {
    return NextResponse.json(data || []);
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
    }))
  );
}

export async function PATCH(req: NextRequest) {
  const { id, document_id, status, ease_factor, interval_days, next_review, last_reviewed } =
    await req.json();
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const update: Record<string, unknown> = {};
  if (status) update.status = status;
  if (ease_factor !== undefined) update.ease_factor = ease_factor;
  if (interval_days !== undefined) update.interval_days = interval_days;
  if (next_review) update.next_review = next_review;
  if (last_reviewed) update.last_reviewed = last_reviewed;

  const { error } = await supabase.from("user_flashcard_progress").upsert(
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
