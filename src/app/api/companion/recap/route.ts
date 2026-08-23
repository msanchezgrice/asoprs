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
  const requestError = requireSameOrigin(request) ?? rejectOversizedBody(request, 64_000);
  if (requestError) return requestError;

  const auth = await requireUser({ verifiedEmail: true });
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit(auth.user.id, "companion_recap", 20, 3_600);
  if (rateLimit) return rateLimit;

  const body = await request.json();
  const { session_id, recap_json } = body;
  if (
    typeof session_id !== "string" || !UUID_RE.test(session_id) ||
    !recap_json || typeof recap_json !== "object" || Array.isArray(recap_json) ||
    JSON.stringify(recap_json).length > 48_000
  ) {
    return NextResponse.json({ error: "Invalid companion recap" }, { status: 400 });
  }

  const { data, error } = await getServiceClient()
    .from("companion_sessions")
    .update({ ended_at: new Date().toISOString(), recap_json })
    .eq("id", session_id)
    .eq("user_id", auth.user.id)
    .select("id, ended_at, recap_json")
    .maybeSingle();

  if (error) {
    console.error("Unable to save companion recap:", error.code);
    return NextResponse.json({ error: "Unable to save recap" }, { status: 503 });
  }
  if (!data) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  return NextResponse.json(data);
}
