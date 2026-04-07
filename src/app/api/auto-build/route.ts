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
    const tier = change.feature_context?.tier ?? "code";
    const prd = await generateBuildPlan(
      change.title,
      change.description ?? "",
      change.origin_trace?.evidence ?? "",
      tier,
    );

    // Extract delivery_strategy and target_user_id from origin_trace
    const originTrace = change.origin_trace as Record<string, unknown> | null;
    const deliveryStrategy = (originTrace?.delivery_strategy as string) ?? undefined;
    const targetUserId = (originTrace?.target_user_id as string) ?? undefined;

    // Step 2: Execute build plan (generates strategy-specific implementation prompt)
    const result = await executeBuildPlan(change_id, prd, tier, deliveryStrategy, targetUserId);

    // Check if already triggered (dedup)
    const existingContext = change.feature_context as Record<string, unknown> | null;
    if (existingContext?.build_status === 'triggered' && existingContext?.github_issue_url) {
      return NextResponse.json({
        change_id,
        prd,
        build_result: result,
        github_issue_url: existingContext.github_issue_url as string,
        github_issue_number: existingContext.github_issue_number as number,
        already_triggered: true,
      });
    }

    // For config_change and content_weight: no GitHub Issue needed
    if (result.buildStatus === "config_applied") {
      return NextResponse.json({
        change_id,
        prd,
        build_result: result,
        delivery_strategy: deliveryStrategy,
        config_applied: true,
        github_issue_url: null,
        github_issue_number: null,
      });
    }

    let github_issue_url: string | null = null;
    let github_issue_number: number | null = null;

    // Step 3: For code-tier strategies (global_fix, isolated_module), create GitHub Issue
    if (result.success && process.env.GITHUB_TOKEN) {
      try {
        const issueRes = await fetch(
          "https://api.github.com/repos/msanchezgrice/asoprs/issues",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
              "Content-Type": "application/json",
              Accept: "application/vnd.github+json",
            },
            body: JSON.stringify({
              title: change.title,
              body: result.result,
              labels: ["auto-build"],
            }),
          }
        );

        if (issueRes.ok) {
          const issue = await issueRes.json();
          github_issue_url = issue.html_url;
          github_issue_number = issue.number;

          // Update shipped_changes with issue URL and build status
          await db
            .from("shipped_changes")
            .update({
              feature_context: {
                ...change.feature_context,
                prd,
                build_status: "triggered",
                delivery_strategy: deliveryStrategy,
                github_issue_url: issue.html_url,
                github_issue_number: issue.number,
                triggered_at: new Date().toISOString(),
              },
            })
            .eq("id", change_id);
        }
      } catch (ghErr) {
        // GitHub issue creation is non-critical; log but don't fail the request
        console.error("Failed to create GitHub issue:", ghErr);
      }
    }

    return NextResponse.json({
      change_id,
      prd,
      build_result: result,
      delivery_strategy: deliveryStrategy,
      github_issue_url,
      github_issue_number,
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
