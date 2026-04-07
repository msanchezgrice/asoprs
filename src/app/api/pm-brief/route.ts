import { NextRequest, NextResponse } from "next/server";
import { generatePMBrief } from "@/features/pm-brief/generate-brief";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// Vercel cron calls this endpoint
// Configure in vercel.json: { "crons": [{ "path": "/api/pm-brief", "schedule": "0 0 * * *" }] }
export async function POST(req: NextRequest) {
  // Verify: cron secret OR authenticated user
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    // Cron mode: verify bearer token
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    // No cron secret: require authenticated user (admin console manual trigger)
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const brief = await generatePMBrief();
    return NextResponse.json(brief);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Also allow GET for manual trigger from admin console
export async function GET(req: NextRequest) {
  // Verify: cron secret OR authenticated user
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    // Cron mode: verify bearer token
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    // No cron secret: require authenticated user (admin console manual trigger)
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const brief = await generatePMBrief();
    return NextResponse.json(brief);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
