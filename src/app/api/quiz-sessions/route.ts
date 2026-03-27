import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const { document_id, total_questions, correct_count, mode } = await req.json();
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const score_pct =
    total_questions > 0
      ? Math.round((correct_count / total_questions) * 100)
      : 0;

  const { data, error } = await supabase
    .from("user_quiz_sessions")
    .insert({
      user_id: user.id,
      document_id,
      session_type: "quiz",
      total_questions,
      correct_count,
      score_pct,
      mode: mode || "practice",
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id, score_pct });
}
