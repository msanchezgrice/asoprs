import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";

import { enforceRateLimit, rejectOversizedBody, requireSameOrigin } from "@/lib/api-security";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const requestError = requireSameOrigin(req) ?? rejectOversizedBody(req, 4_000);
  if (requestError) return requestError;

  const { document_id, total_questions, correct_count, mode } = await req.json();
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const rateLimit = await enforceRateLimit(user.id, "quiz_session_write", 200, 3_600);
  if (rateLimit) return rateLimit;

  if (
    typeof document_id !== "string" || !UUID_RE.test(document_id) ||
    !Number.isInteger(total_questions) || total_questions < 1 || total_questions > 500 ||
    !Number.isInteger(correct_count) || correct_count < 0 || correct_count > total_questions ||
    !["practice", "timed"].includes(mode ?? "practice")
  ) {
    return NextResponse.json({ error: "Invalid quiz session" }, { status: 400 });
  }

  const score_pct =
    total_questions > 0
      ? Math.round((correct_count / total_questions) * 100)
      : 0;

  const { data, error } = await getServiceClient()
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
    return NextResponse.json({ error: "Unable to save quiz session" }, { status: 503 });
  }

  return NextResponse.json({ id: data.id, score_pct });
}
