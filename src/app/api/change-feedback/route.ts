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
  const requestError = requireSameOrigin(request) ?? rejectOversizedBody(request, 4_000);
  if (requestError) return requestError;

  const auth = await requireUser({ verifiedEmail: true });
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit(auth.user.id, "change_feedback", 30, 3_600);
  if (rateLimit) return rateLimit;

  const body = await request.json();
  const { change_id, rating, comment } = body;
  if (
    typeof change_id !== "string" || !UUID_RE.test(change_id) ||
    !["better", "same", "worse"].includes(rating) ||
    (comment !== undefined && comment !== null && (typeof comment !== "string" || comment.length > 2_000))
  ) {
    return NextResponse.json({ error: "Invalid change feedback" }, { status: 400 });
  }

  const db = getServiceClient();
  const { data: change, error: changeError } = await db
    .from("shipped_changes")
    .select("id, origin_trace, feature_context")
    .eq("id", change_id)
    .eq("status", "active")
    .maybeSingle();

  if (changeError || !change) {
    return NextResponse.json({ error: "Change not found" }, { status: 404 });
  }

  const originTrace = change.origin_trace as Record<string, unknown> | null;
  const featureContext = change.feature_context as Record<string, unknown> | null;
  const targetUserId = originTrace?.target_user_id ?? featureContext?.target_user_id;
  const buildStatus = featureContext?.build_status;
  if (
    (targetUserId && targetUserId !== auth.user.id) ||
    (buildStatus !== "completed" && buildStatus !== "config_applied")
  ) {
    return NextResponse.json({ error: "Change not found" }, { status: 404 });
  }

  const { data, error } = await db
    .from("change_feedback")
    .insert({
      change_id,
      user_id: auth.user.id,
      rating,
      comment: comment?.trim() || null,
    })
    .select("id, created_at")
    .single();

  if (error) {
    console.error("Unable to save change feedback:", error.code);
    return NextResponse.json({ error: "Unable to save feedback" }, { status: 503 });
  }

  return NextResponse.json(data, { status: 201 });
}
