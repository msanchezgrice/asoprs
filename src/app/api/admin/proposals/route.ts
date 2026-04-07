import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getServiceClient();
  const { data: briefs, error } = await db
    .from("pm_briefs")
    .select("*")
    .order("generated_at", { ascending: false })
    .limit(10);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(briefs);
}

export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { brief_id, proposal_index, action, reason, feature_context } = body;

  if (!brief_id || proposal_index === undefined || !action) {
    return NextResponse.json({ error: "brief_id, proposal_index, and action are required" }, { status: 400 });
  }

  const db = getServiceClient();

  // Get the brief
  const { data: brief, error: briefError } = await db
    .from("pm_briefs")
    .select("*")
    .eq("id", brief_id)
    .single();

  if (briefError || !brief) {
    return NextResponse.json({ error: "Brief not found" }, { status: 404 });
  }

  const proposals = brief.action_items ?? [];
  const proposal = proposals[proposal_index];
  if (!proposal) {
    return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  }

  if (action === "approve") {
    // Create a shipped change
    const { data: change, error: changeError } = await db
      .from("shipped_changes")
      .insert({
        pm_brief_id: brief_id,
        title: proposal.title,
        description: proposal.description,
        origin_type: proposal.origin_type ?? "pattern",
        origin_trace: { evidence: proposal.evidence, confidence: proposal.confidence },
        feature_context: feature_context ?? null,
        status: "active",
      })
      .select()
      .single();

    if (changeError) {
      return NextResponse.json({ error: changeError.message }, { status: 500 });
    }

    // Mark proposal as actioned
    proposals[proposal_index] = { ...proposal, status: "approved" };
    await db.from("pm_briefs").update({ action_items: proposals, status: "actioned" }).eq("id", brief_id);

    return NextResponse.json({ action: "approved", change });
  }

  if (action === "reject") {
    proposals[proposal_index] = { ...proposal, status: "rejected", reject_reason: reason ?? "" };
    await db.from("pm_briefs").update({ action_items: proposals, status: "reviewed" }).eq("id", brief_id);
    return NextResponse.json({ action: "rejected" });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
