import { NextRequest, NextResponse } from "next/server";
import { generateGlobalBrief, generateUserBrief } from "@/features/pm-brief/generate-brief";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase";

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

    return NextResponse.json({
      global: globalBrief,
      user_briefs: userBriefs,
      active_users: activeUserIds.length,
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
