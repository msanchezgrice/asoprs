import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { session_id, role, transcript, prompt_kind, started_at, ended_at } = body;

  if (!session_id || !role || !transcript) {
    return NextResponse.json({ error: "session_id, role, and transcript are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("companion_turns")
    .insert({ session_id, role, transcript, prompt_kind, started_at, ended_at })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
