import { getServiceClient } from "@/lib/supabase";

export interface DailyCapInfo {
  count: number;
  limit: number;
  remaining: number;
}

export async function getDailyImprovementCount(): Promise<DailyCapInfo> {
  const supabase = getServiceClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from("shipped_changes")
    .select("*", { count: "exact", head: true })
    .gte("shipped_at", today.toISOString());

  // Load limit from settings
  const { data: settings } = await supabase
    .from("admin_settings")
    .select("value")
    .eq("key", "approval_config")
    .single();

  const limit = (settings?.value as Record<string, unknown>)?.max_improvements_per_day as number ?? 10;
  return { count: count ?? 0, limit, remaining: Math.max(0, limit - (count ?? 0)) };
}

export interface ApprovalAutoConfig {
  auto_approve_proposals: boolean;
  auto_trigger_build: boolean;
  auto_run_approval_agent: boolean;
  max_improvements_per_day: number;
  auto_approve_max_confidence: string;
  auto_approve_delivery_strategies: string[];
}

export async function getAutonomousConfig(): Promise<ApprovalAutoConfig> {
  const supabase = getServiceClient();
  const { data: settings } = await supabase
    .from("admin_settings")
    .select("value")
    .eq("key", "approval_config")
    .single();

  const value = (settings?.value ?? {}) as Record<string, unknown>;
  return {
    auto_approve_proposals: value.auto_approve_proposals === true,
    auto_trigger_build: value.auto_trigger_build === true,
    auto_run_approval_agent: value.auto_run_approval_agent === true,
    max_improvements_per_day: typeof value.max_improvements_per_day === "number" ? value.max_improvements_per_day : 10,
    auto_approve_max_confidence: typeof value.auto_approve_max_confidence === "string" ? value.auto_approve_max_confidence : "high",
    auto_approve_delivery_strategies: Array.isArray(value.auto_approve_delivery_strategies)
      ? value.auto_approve_delivery_strategies
      : ["global_fix", "config_change", "content_weight", "isolated_module"],
  };
}
