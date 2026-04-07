import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { generateBuildPlan, executeBuildPlan } from "@/features/auto-build/build-proposal";
import { getServiceClient } from "@/lib/supabase";

// POST: Generate PRD and trigger build for an approved proposal
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { change_id } = body;

  if (!change_id) {
    return NextResponse.json({ error: "change_id is required" }, { status: 400 });
  }

  const db = getServiceClient();
  const { data: change, error } = await db
    .from("shipped_changes")
    .select("*")
    .eq("id", change_id)
    .single();

  if (error || !change) {
    return NextResponse.json({ error: "Change not found" }, { status: 404 });
  }

  try {
    // Step 1: Generate PRD
    const prd = await generateBuildPlan(
      change.title,
      change.description ?? "",
      change.origin_trace?.evidence ?? "",
      change.feature_context?.tier ?? "code",
    );

    // Step 2: Execute build plan (generates implementation prompt)
    const tier = change.feature_context?.tier ?? "code";
    const result = await executeBuildPlan(change_id, prd, tier);

    return NextResponse.json({
      change_id,
      prd,
      build_result: result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET: List build queue
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getServiceClient();
  const { data } = await db
    .from("shipped_changes")
    .select("*")
    .eq("status", "active")
    .order("shipped_at", { ascending: false });

  return NextResponse.json(data ?? []);
}
