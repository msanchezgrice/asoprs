import { NextRequest, NextResponse } from "next/server";
import { generateGlobalBrief, generateUserBrief } from "@/features/pm-brief/generate-brief";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase";
import { getDailyImprovementCount, getAutonomousConfig } from "@/features/auto-build/daily-cap";
import { generateBuildPlan, executeBuildPlan } from "@/features/auto-build/build-proposal";

// Vercel cron calls this endpoint
// Configure in vercel.json: { "crons": [{ "path": "/api/pm-brief", "schedule": "0 0 * * *" }] }
export async function POST(req: NextRequest) {
  // Verify: cron secret OR authenticated user
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    // Generate global brief
    const globalBrief = await generateGlobalBrief();

    // Get active users (users with feedback or companion sessions in the last 7 days)
    const db = getServiceClient();
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: feedbackUsers } = await db
      .from("feedback_entries")
      .select("user_id")
      .gte("created_at", since7d);

    const { data: sessionUsers } = await db
      .from("companion_sessions")
      .select("user_id")
      .gte("started_at", since7d);

    const activeUserIds = [
      ...new Set([
        ...(feedbackUsers ?? []).map((r) => r.user_id).filter(Boolean),
        ...(sessionUsers ?? []).map((r) => r.user_id).filter(Boolean),
      ]),
    ] as string[];

    // Fan out per-user briefs with concurrency limit of 5
    const userBriefs: Array<{ userId: string; brief?: unknown; error?: string }> = [];
    const CONCURRENCY = 5;

    for (let i = 0; i < activeUserIds.length; i += CONCURRENCY) {
      const batch = activeUserIds.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(async (userId) => {
          const brief = await generateUserBrief(userId);
          return { userId, brief };
        }),
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          userBriefs.push(result.value);
        } else {
          const reason = result.reason instanceof Error ? result.reason.message : "Unknown error";
          console.error(`Failed to generate brief for user in batch: ${reason}`);
          userBriefs.push({ userId: "unknown", error: reason });
        }
      }
    }

    // --- Auto-approve qualifying proposals ---
    let autoApproved = 0;
    let autoApproveSkipped = 0;
    let dailyCapUsed = 0;
    let dailyCapLimit = 10;

    try {
      const autoConfig = await getAutonomousConfig();
      if (autoConfig.auto_approve_proposals) {
        const dailyCap = await getDailyImprovementCount();
        dailyCapUsed = dailyCap.count;
        dailyCapLimit = dailyCap.limit;
        let remaining = dailyCap.remaining;

        // Collect all briefs that were just generated (global + user)
        const { data: recentBriefs } = await db
          .from("pm_briefs")
          .select("*")
          .order("generated_at", { ascending: false })
          .limit(activeUserIds.length + 1);

        for (const brief of recentBriefs ?? []) {
          const proposals = brief.action_items ?? [];
          let briefUpdated = false;

          for (let pi = 0; pi < proposals.length; pi++) {
            if (remaining <= 0) {
              autoApproveSkipped++;
              continue;
            }
            const proposal = proposals[pi];
            if (proposal.status === "approved" || proposal.status === "rejected") continue;

            // Check confidence matches threshold
            const confidenceLevels = ["low", "medium", "high"];
            const minIndex = confidenceLevels.indexOf(autoConfig.auto_approve_max_confidence);
            const proposalIndex = confidenceLevels.indexOf(proposal.confidence ?? "low");
            if (proposalIndex < minIndex) {
              autoApproveSkipped++;
              continue;
            }

            // Check delivery strategy is allowed
            const strategy = proposal.delivery_strategy ?? "global_fix";
            if (!autoConfig.auto_approve_delivery_strategies.includes(strategy)) {
              autoApproveSkipped++;
              continue;
            }

            // Auto-approve: create shipped_changes row
            const { data: change, error: changeError } = await db
              .from("shipped_changes")
              .insert({
                pm_brief_id: brief.id,
                title: proposal.title,
                description: proposal.description,
                origin_type: proposal.origin_type ?? "pattern",
                origin_trace: {
                  evidence: proposal.evidence,
                  confidence: proposal.confidence,
                  delivery_strategy: proposal.delivery_strategy ?? null,
                  target_user_id: proposal.target_user_id ?? null,
                },
                feature_context: {
                  build_status: "pending_prd",
                  delivery_strategy: proposal.delivery_strategy ?? null,
                  auto_approved: true,
                },
                status: "active",
              })
              .select()
              .single();

            if (changeError || !change) {
              console.error("Auto-approve insert failed:", changeError?.message);
              continue;
            }

            // Mark proposal as approved in the brief
            proposals[pi] = { ...proposal, status: "approved" };
            briefUpdated = true;
            autoApproved++;
            remaining--;

            // Auto-trigger build if enabled
            if (autoConfig.auto_trigger_build) {
              try {
                const originTrace = change.origin_trace as Record<string, unknown> | null;
                const deliveryStrategy = (originTrace?.delivery_strategy as string) ?? undefined;
                const targetUserId = (originTrace?.target_user_id as string) ?? undefined;
                const tier = (proposal.tier as string) ?? "code";

                const prd = await generateBuildPlan(
                  change.title,
                  change.description ?? "",
                  (originTrace?.evidence as string) ?? "",
                  tier,
                );

                const result = await executeBuildPlan(change.id, prd, tier, deliveryStrategy, targetUserId);

                if (result.buildStatus === "config_applied") {
                  await db.from("shipped_changes").update({
                    feature_context: {
                      ...change.feature_context,
                      prd,
                      build_status: "config_applied",
                      delivery_strategy: deliveryStrategy,
                      completed_at: new Date().toISOString(),
                      auto_approved: true,
                    },
                  }).eq("id", change.id);
                } else {
                  // For code changes, create GitHub Issue
                  const buildResult = result.result;
                  if (process.env.GITHUB_TOKEN) {
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
                            body: buildResult,
                            labels: ["auto-build"],
                          }),
                        },
                      );
                      if (issueRes.ok) {
                        const issue = await issueRes.json();
                        await db.from("shipped_changes").update({
                          feature_context: {
                            ...change.feature_context,
                            prd,
                            build_status: "triggered",
                            delivery_strategy: deliveryStrategy,
                            github_issue_url: issue.html_url,
                            github_issue_number: issue.number,
                            triggered_at: new Date().toISOString(),
                            auto_approved: true,
                          },
                        }).eq("id", change.id);
                      }
                    } catch (ghErr) {
                      console.error("Auto-build GitHub issue creation failed:", ghErr);
                    }
                  }
                }
              } catch (buildErr) {
                console.error("Auto-build failed for", change.id, buildErr);
              }
            }
          }

          if (briefUpdated) {
            await db.from("pm_briefs").update({ action_items: proposals, status: "actioned" }).eq("id", brief.id);
          }
        }
      }
    } catch (autoErr) {
      console.error("Auto-approve pipeline error:", autoErr);
    }

    console.log(`Auto-approved ${autoApproved} proposals (daily cap: ${dailyCapUsed + autoApproved}/${dailyCapLimit} used)`);

    return NextResponse.json({
      global: globalBrief,
      user_briefs: userBriefs,
      active_users: activeUserIds.length,
      auto_approved: autoApproved,
      auto_approve_skipped: autoApproveSkipped,
      daily_cap: { used: dailyCapUsed + autoApproved, limit: dailyCapLimit },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Also allow GET for manual trigger from admin console
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const globalBrief = await generateGlobalBrief();
    return NextResponse.json(globalBrief);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
