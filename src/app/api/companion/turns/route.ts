import { NextRequest, NextResponse } from "next/server";
import {
  enforceRateLimit,
  rejectOversizedBody,
  requireSameOrigin,
  requireUser,
} from "@/lib/api-security";
import { getServiceClient } from "@/lib/supabase/service";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const requestError = requireSameOrigin(request) ?? rejectOversizedBody(request, 16_000);
  if (requestError) return requestError;

  const auth = await requireUser({ verifiedEmail: true });
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit(auth.user.id, "companion_turn", 300, 3_600);
  if (rateLimit) return rateLimit;

  const body = await request.json();
  const { session_id, role, transcript, prompt_kind, started_at, ended_at } = body;
  if (
    typeof session_id !== "string" || !UUID_RE.test(session_id) ||
    !["user", "model", "system"].includes(role) ||
    typeof transcript !== "string" || !transcript.trim() || transcript.length > 8_000 ||
    (prompt_kind !== undefined && prompt_kind !== null && (typeof prompt_kind !== "string" || prompt_kind.length > 100)) ||
    typeof started_at !== "string" || Number.isNaN(Date.parse(started_at)) ||
    typeof ended_at !== "string" || Number.isNaN(Date.parse(ended_at))
  ) {
    return NextResponse.json({ error: "Invalid companion turn" }, { status: 400 });
  }

  const db = getServiceClient();
  const { data: session, error: sessionError } = await db
    .from("companion_sessions")
    .select("id")
    .eq("id", session_id)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (sessionError || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const { data, error } = await db
    .from("companion_turns")
    .insert({
      session_id,
      role,
      transcript: transcript.trim(),
      prompt_kind: prompt_kind ?? null,
      started_at: new Date(started_at).toISOString(),
      ended_at: new Date(ended_at).toISOString(),
      feedback_type: "user",
    })
    .select("id, session_id, role, transcript, prompt_kind, started_at, ended_at")
    .single();

  if (error) {
    console.error("Unable to save companion turn:", error.code);
    return NextResponse.json({ error: "Unable to save turn" }, { status: 503 });
  }

  return NextResponse.json(data, { status: 201 });
}
