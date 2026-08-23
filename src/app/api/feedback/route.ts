import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import {
  enforceRateLimit,
  rejectOversizedBody,
  requireSameOrigin,
  requireUser,
} from "@/lib/api-security";

export async function POST(req: NextRequest) {
  const requestError = requireSameOrigin(req) ?? rejectOversizedBody(req, 32_000);
  if (requestError) return requestError;

  const auth = await requireUser({ verifiedEmail: true });
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit(auth.user.id, "feedback", 30, 3_600);
  if (rateLimit) return rateLimit;

  const body = await req.json();
  const { screen, tag, free_text, context_json, page_category } = body;

  if (
    typeof screen !== "string" || !screen || screen.length > 100 ||
    typeof tag !== "string" || !tag || tag.length > 100 ||
    (free_text !== undefined && free_text !== null && (typeof free_text !== "string" || free_text.length > 4_000)) ||
    (page_category !== undefined && page_category !== null && (typeof page_category !== "string" || page_category.length > 100)) ||
    (context_json !== undefined && context_json !== null && (
      typeof context_json !== "object" || Array.isArray(context_json) || JSON.stringify(context_json).length > 8_000
    ))
  ) {
    return NextResponse.json(
      { error: "screen and tag are required" },
      { status: 400 },
    );
  }

  const { data: roleData } = await getServiceClient()
    .from("builder_roles")
    .select("role")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  const isBuilder = roleData?.role === "admin" || roleData?.role === "builder";

  const { data, error } = await getServiceClient().from("feedback_entries").insert({
    user_id: auth.user.id,
    screen,
    tag,
    free_text: free_text ?? null,
    context_json: context_json ?? null,
    feedback_type: isBuilder ? "builder" : "user",
    user_role: isBuilder ? roleData.role : "user",
    page_category: page_category ?? null,
  }).select("id, created_at").single();

  if (error) {
    return NextResponse.json({ error: "Unable to save feedback" }, { status: 503 });
  }

  return NextResponse.json(data, { status: 201 });
}
