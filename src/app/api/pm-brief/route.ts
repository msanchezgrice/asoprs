import { NextRequest, NextResponse } from "next/server";
import { generateGlobalBrief } from "@/features/pm-brief/generate-brief";
import {
  enforceRateLimit,
  requireAdmin,
  requireSameOrigin,
} from "@/lib/api-security";

// Manual admin-only analysis. Invited users' feedback and companion data are
// excluded by generateGlobalBrief; no scheduled cross-tenant export runs.
export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit(auth.user.id, "pm_brief", 2, 3_600);
  if (rateLimit) return rateLimit;

  try {
    return NextResponse.json(await generateGlobalBrief());
  } catch (error) {
    console.error("Unable to generate PM brief:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Unable to generate PM brief" }, { status: 503 });
  }
}
