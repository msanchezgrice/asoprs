import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { session_id, event_type, payload, screenshot_url, occurred_at } = body;

  if (!session_id || !event_type) {
    return NextResponse.json({ error: "session_id and event_type are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("companion_events")
    .insert({
      session_id,
      event_type,
      payload: payload ?? {},
      screenshot_url: screenshot_url ?? null,
      occurred_at: occurred_at ?? new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
