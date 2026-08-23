import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import { runApprovalAgent } from "@/features/auto-build/approval-agent";
import type { ApprovalConfig } from "@/features/auto-build/approval-agent";
import { requireAdmin, requireSameOrigin, rejectOversizedBody } from "@/lib/api-security";

const DEFAULT_CONFIG: ApprovalConfig = {
  mode: "dry_run",
  risk_threshold: 30,
  auto_merge_enabled: false,
  require_tests_pass: true,
  require_new_tests: true,
  max_files_changed: 10,
  max_lines_changed: 500,
  blocked_paths: ["src/app/api/auth/", "migrations/"],
  model: "claude-opus-4-6",
  notify_on_approve: true,
  notify_on_escalate: true,
};

export async function POST(req: Request) {
  const requestError = requireSameOrigin(req) ?? rejectOversizedBody(req, 2_000);
  if (requestError) return requestError;

  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { pr_number } = await req.json();

  if (!Number.isInteger(pr_number) || pr_number < 1 || pr_number > 10_000_000) {
    return NextResponse.json({ error: "pr_number is required and must be a number" }, { status: 400 });
  }

  // Load approval config from admin_settings
  const db = getServiceClient();
  const { data: boundChange, error: bindingError } = await db
    .from("shipped_changes")
    .select("id")
    .eq("feature_context->>pr_number", String(pr_number))
    .maybeSingle();

  if (bindingError || !boundChange) {
    return NextResponse.json({ error: "PR is not bound to an approved change" }, { status: 404 });
  }
  const { data: settingRow } = await db
    .from("admin_settings")
    .select("value")
    .eq("key", "approval_config")
    .single();

  const config: ApprovalConfig = settingRow?.value
    ? { ...DEFAULT_CONFIG, ...(settingRow.value as Partial<ApprovalConfig>) }
    : DEFAULT_CONFIG;

  try {
    const result = await runApprovalAgent(pr_number, config);

    // Update shipped_changes if there's a matching record
    if (result.auto_merged) {
      await db
        .from("shipped_changes")
        .update({
          feature_context: {
            build_status: "completed",
            auto_approved: true,
            approval_result: result,
            completed_at: new Date().toISOString(),
          },
        })
        .eq("feature_context->>pr_number", String(pr_number));
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Approval agent failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
