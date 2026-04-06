import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { screen, tag, free_text, context_json } = body;

  if (!screen || !tag) {
    return NextResponse.json(
      { error: "screen and tag are required" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase.from("feedback_entries").insert({
    user_id: user.id,
    screen,
    tag,
    free_text: free_text ?? null,
    context_json: context_json ?? null,
  }).select().single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
