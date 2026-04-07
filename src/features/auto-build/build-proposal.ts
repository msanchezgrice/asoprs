import Anthropic from "@anthropic-ai/sdk";
import { getServiceClient } from "@/lib/supabase";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "",
});

interface BuildPlan {
  proposal_id: string;
  title: string;
  description: string;
  tier: "config" | "code";
  prd: {
    problem: string;
    solution: string;
    acceptance_criteria: string[];
    files_to_modify: string[];
    test_requirements: string[];
    rollback_plan: string;
  };
  status: "pending" | "building" | "pr_created" | "merged" | "failed";
  pr_url: string | null;
  error: string | null;
}

export async function generateBuildPlan(
  proposalTitle: string,
  proposalDescription: string,
  proposalEvidence: string,
  proposalTier: string,
): Promise<BuildPlan["prd"]> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `You are a senior product engineer generating a PRD (Product Requirements Document) for a feature change to OculoPrep, a Next.js 16 + Supabase study tool for oculoplastic oral board exams.

PROPOSAL: ${proposalTitle}
DESCRIPTION: ${proposalDescription}
EVIDENCE: ${proposalEvidence}
TIER: ${proposalTier}

The codebase structure:
- src/app/ — Next.js App Router pages and API routes
- src/features/ — Feature modules (feedback/, companion/, pm-brief/, change-tour/, admin/)
- src/components/ — Shared UI components
- src/lib/ — Utilities and Supabase client
- src/hooks/ — React hooks
- Tech: Next.js 16, Supabase (Postgres + Auth + Storage), Tailwind CSS, Vitest

Generate a structured PRD as JSON with this exact format:
{
  "problem": "One sentence: what user pain does this address?",
  "solution": "2-3 sentences: what exactly to build and how",
  "acceptance_criteria": ["List of specific, testable criteria"],
  "files_to_modify": ["List of file paths that need changes"],
  "test_requirements": ["List of tests to write"],
  "rollback_plan": "How to revert if this breaks something"
}

Be specific about file paths. For config-tier changes, the solution should be a database update. For code-tier changes, describe the actual code changes needed.

Return ONLY valid JSON, no markdown fencing.`,
      },
    ],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "{}";
  const raw = JSON.parse(text);
  return {
    problem: typeof raw.problem === 'string' ? raw.problem : 'Unknown problem',
    solution: typeof raw.solution === 'string' ? raw.solution : 'No solution provided',
    acceptance_criteria: Array.isArray(raw.acceptance_criteria) ? raw.acceptance_criteria.filter((s: unknown) => typeof s === 'string') : [],
    files_to_modify: Array.isArray(raw.files_to_modify) ? raw.files_to_modify.filter((s: unknown) => typeof s === 'string') : [],
    test_requirements: Array.isArray(raw.test_requirements) ? raw.test_requirements.filter((s: unknown) => typeof s === 'string') : [],
    rollback_plan: typeof raw.rollback_plan === 'string' ? raw.rollback_plan : 'Revert the commit',
  };
}

function toKebabCase(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function generateGlobalFixPrompt(prd: BuildPlan["prd"]): string {
  return `Implement this change in the OculoPrep study portal codebase at /Users/miguel/ASOPRS/study-portal:

## PRD
- Problem: ${prd.problem}
- Solution: ${prd.solution}

## Files to modify
${prd.files_to_modify.map((f) => `- ${f}`).join("\n")}

## Acceptance criteria
${prd.acceptance_criteria.map((c) => `- [ ] ${c}`).join("\n")}

## Tests to write
${prd.test_requirements.map((t) => `- ${t}`).join("\n")}

## Instructions
1. Read each file listed above before modifying
2. Make the minimum changes needed
3. Write tests for each acceptance criterion
4. Run \`npm run test\` to verify
5. Commit with message: "feat: ${prd.problem}"

Do NOT modify unrelated files. Keep changes minimal and focused.`;
}

function generateConfigChangePrompt(
  prd: BuildPlan["prd"],
  targetUserId: string,
): string {
  return `This is a config-only change. No code changes needed.
Update the database directly:
- Table: user_memory_profiles
- User ID: ${targetUserId}
- Change: ${prd.solution}

Run this SQL via Supabase:
UPDATE user_memory_profiles SET config = config || '${JSON.stringify({ solution: prd.solution })}'::jsonb WHERE user_id = '${targetUserId}';`;
}

function generateContentWeightPrompt(
  prd: BuildPlan["prd"],
  targetUserId: string,
): string {
  return `This is a content weight adjustment for user ${targetUserId}.
Update the adaptive engine configuration:
- User ID: ${targetUserId}
- Change: ${prd.solution}

Run this SQL via Supabase:
UPDATE user_memory_profiles SET format_usage_stats = format_usage_stats || '${JSON.stringify({ adjustment: prd.solution })}'::jsonb WHERE user_id = '${targetUserId}';`;
}

function generateIsolatedModulePrompt(
  prd: BuildPlan["prd"],
  targetUserId: string,
  title: string,
): string {
  const featureKey = toKebabCase(title);
  const mountPoint =
    prd.files_to_modify.length > 0
      ? prd.files_to_modify[0].replace(/^src\//, "").replace(/\.\w+$/, "")
      : "global-overlay";

  return `Create a new per-user feature module for the OculoPrep study portal.

TARGET USER: ${targetUserId}
FEATURE KEY: ${featureKey}

## What to create

1. New directory: src/features/user-features/${featureKey}/
   - component.tsx — self-contained React component
   - mount.ts — exports { mountPoint: "${mountPoint}" }

2. Register in src/features/user-features/registry.ts:
   Add: '${featureKey}': dynamic(() => import('./${featureKey}/component'))

3. Database: Insert into user_features table:
   INSERT INTO user_features (user_id, feature_key, feature_module, delivery_strategy, mount_point)
   VALUES ('${targetUserId}', '${featureKey}', '${featureKey}', 'isolated_module', '${mountPoint}');

## PRD
- Problem: ${prd.problem}
- Solution: ${prd.solution}
- Mount point: ${mountPoint}

## Rules
- The component must be SELF-CONTAINED. Do NOT modify any existing files except registry.ts.
- Import shared utilities from @/lib/ and @/hooks/ as needed.
- The component receives a \`config\` prop: { config: Record<string, unknown> }
- Run npm run test after changes.`;
}

export async function executeBuildPlan(
  changeId: string,
  prd: BuildPlan["prd"],
  tier: string,
  deliveryStrategy?: string,
  targetUserId?: string,
): Promise<{ success: boolean; result: string; buildStatus?: string }> {
  const supabase = getServiceClient();
  const strategy = deliveryStrategy ?? (tier === "config" ? "config_change" : "global_fix");

  if (strategy === "config_change") {
    const prompt = generateConfigChangePrompt(prd, targetUserId ?? "unknown");
    await supabase
      .from("shipped_changes")
      .update({
        feature_context: {
          prd,
          build_status: "config_applied",
          build_method: "config_update",
          delivery_strategy: strategy,
          implementation_prompt: prompt,
          completed_at: new Date().toISOString(),
        },
      })
      .eq("id", changeId);

    return {
      success: true,
      result: prompt,
      buildStatus: "config_applied",
    };
  }

  if (strategy === "content_weight") {
    const prompt = generateContentWeightPrompt(prd, targetUserId ?? "unknown");
    await supabase
      .from("shipped_changes")
      .update({
        feature_context: {
          prd,
          build_status: "config_applied",
          build_method: "content_weight",
          delivery_strategy: strategy,
          implementation_prompt: prompt,
          completed_at: new Date().toISOString(),
        },
      })
      .eq("id", changeId);

    return {
      success: true,
      result: prompt,
      buildStatus: "config_applied",
    };
  }

  // Code-tier strategies: global_fix and isolated_module
  let implementationPrompt: string;

  if (strategy === "isolated_module") {
    // Fetch the change title for feature key generation
    const { data: changeData } = await supabase
      .from("shipped_changes")
      .select("title")
      .eq("id", changeId)
      .single();
    const title = changeData?.title ?? changeId;
    implementationPrompt = generateIsolatedModulePrompt(prd, targetUserId ?? "unknown", title);
  } else {
    // global_fix (default)
    implementationPrompt = generateGlobalFixPrompt(prd);
  }

  // Store the implementation prompt and mark as ready for build
  await supabase
    .from("shipped_changes")
    .update({
      feature_context: {
        prd,
        build_status: "ready_for_build",
        delivery_strategy: strategy,
        implementation_prompt: implementationPrompt,
        created_at: new Date().toISOString(),
      },
    })
    .eq("id", changeId);

  return {
    success: true,
    result: implementationPrompt,
  };
}

// Exported for testing
export { toKebabCase, generateGlobalFixPrompt, generateConfigChangePrompt, generateContentWeightPrompt, generateIsolatedModulePrompt };

export async function getQueuedBuilds(): Promise<
  Array<{
    id: string;
    title: string;
    description: string;
    origin_type: string;
    feature_context: Record<string, unknown> | null;
    shipped_at: string;
    status: string;
  }>
> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("shipped_changes")
    .select("*")
    .eq("status", "active")
    .order("shipped_at", { ascending: false });

  return data ?? [];
}
