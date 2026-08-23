import { NextRequest, NextResponse } from "next/server";
import {
  enforceRateLimit,
  requireSameOrigin,
  requireUser,
} from "@/lib/api-security";
import { getServiceClient } from "@/lib/supabase/service";

export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const auth = await requireUser({ verifiedEmail: true });
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit(auth.user.id, "companion_session", 20, 3_600);
  if (rateLimit) return rateLimit;

  const { data, error } = await getServiceClient()
    .from("companion_sessions")
    .insert({ user_id: auth.user.id })
    .select("id, user_id, started_at, ended_at, recap_json, created_at")
    .single();

  if (error) {
    console.error("Unable to create companion session:", error.code);
    return NextResponse.json({ error: "Unable to create session" }, { status: 503 });
  }

  return NextResponse.json(data, { status: 201 });
}

export async function GET() {
  const auth = await requireUser({ verifiedEmail: true });
  if (!auth.ok) return auth.response;

  const { data, error } = await getServiceClient()
    .from("companion_sessions")
    .select("id, started_at, ended_at, recap_json, created_at")
    .eq("user_id", auth.user.id)
    .order("started_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("Unable to load companion sessions:", error.code);
    return NextResponse.json({ error: "Unable to load sessions" }, { status: 503 });
  }

  return NextResponse.json(data ?? [], {
    headers: { "Cache-Control": "private, no-store" },
  });
}
