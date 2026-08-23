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
  const requestError = requireSameOrigin(request) ?? rejectOversizedBody(request, 24_000);
  if (requestError) return requestError;

  const auth = await requireUser({ verifiedEmail: true });
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit(auth.user.id, "companion_event", 240, 3_600);
  if (rateLimit) return rateLimit;

  const body = await request.json();
  const { session_id, event_type, payload, screenshot_url, occurred_at } = body;
  const payloadLength = JSON.stringify(payload ?? {}).length;
  const expectedScreenshotPrefix = `${auth.user.id}/${session_id}/`;
  if (
    typeof session_id !== "string" || !UUID_RE.test(session_id) ||
    typeof event_type !== "string" || !event_type.trim() || event_type.length > 100 ||
    payloadLength > 16_000 || typeof (payload ?? {}) !== "object" || Array.isArray(payload) ||
    (screenshot_url !== undefined && screenshot_url !== null && (
      typeof screenshot_url !== "string" || screenshot_url.length > 500 ||
      !screenshot_url.startsWith(expectedScreenshotPrefix)
    )) ||
    (occurred_at !== undefined && (typeof occurred_at !== "string" || Number.isNaN(Date.parse(occurred_at))))
  ) {
    return NextResponse.json({ error: "Invalid companion event" }, { status: 400 });
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
    .from("companion_events")
    .insert({
      session_id,
      event_type: event_type.trim(),
      payload: payload ?? {},
      screenshot_url: screenshot_url ?? null,
      occurred_at: occurred_at ? new Date(occurred_at).toISOString() : new Date().toISOString(),
      feedback_type: "user",
    })
    .select("id, session_id, event_type, payload, screenshot_url, occurred_at")
    .single();

  if (error) {
    console.error("Unable to save companion event:", error.code);
    return NextResponse.json({ error: "Unable to save event" }, { status: 503 });
  }

  return NextResponse.json(data, { status: 201 });
}
