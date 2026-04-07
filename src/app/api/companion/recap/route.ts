import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { session_id, recap_json } = body;

  if (!session_id || !recap_json) {
    return NextResponse.json({ error: "session_id and recap_json are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("companion_sessions")
    .update({
      ended_at: new Date().toISOString(),
      recap_json,
    })
    .eq("id", session_id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
