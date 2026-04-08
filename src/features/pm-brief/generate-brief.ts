import Anthropic from "@anthropic-ai/sdk";
import { getServiceClient } from "@/lib/supabase";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "",
});

export type DeliveryStrategy = "global_fix" | "config_change" | "content_weight" | "isolated_module";

export interface ProposalItem {
  title: string;
  description: string;
  origin_type: "request" | "bug" | "pattern" | "annoyance";
  evidence: string;
  confidence: "high" | "medium" | "low";
  tier: "config" | "code";
  delivery_strategy: DeliveryStrategy;
  scope: "global" | "user";
  target_user_id?: string | null;
}

export interface PMBriefResult {
  summary: string;
  top_friction_points: string[];
  unused_features: string[];
  proposals: ProposalItem[];
  raw_data: {
    feedback_count: number;
    session_count: number;
    total_turns: number;
  };
}

const DELIVERY_STRATEGY_PROMPT = `
DELIVERY STRATEGY CLASSIFICATION:
Each proposal MUST include a "delivery_strategy" field with one of these values:
- "global_fix" — bugs, broken features, security issues that affect all users
- "config_change" — tunable parameters per user (packet size, difficulty level, timer duration)
- "content_weight" — adjust content ordering/frequency for a specific user (show more of topic X, less of Y)
- "isolated_module" — new UI component or behavior for a specific user (a new widget, custom view)

CODEBASE CONTEXT (for reasoning about delivery strategy):
- src/app/ — Next.js pages (flashcards, quiz, pdf-reader, chat, mindmap, search, study-packs, progress)
- src/features/ — Feature modules (companion, pm-brief, study-packs)
- src/lib/ — Shared utilities, Supabase client, study-pack builder
- src/components/ — Shared UI components
- Database: feedback_entries, companion_sessions, companion_turns, user_memory_profiles, pm_briefs

Rules for classification:
- If a fix touches core shared code (bug fix, security patch), use "global_fix"
- If a change is a numeric/boolean parameter that can differ per user, use "config_change"
- If a change reorders or re-weights existing content for a user, use "content_weight"
- If a change adds new UI or behavior that doesn't exist yet, use "isolated_module"
`;

const VALID_DELIVERY_STRATEGIES: DeliveryStrategy[] = ["global_fix", "config_change", "content_weight", "isolated_module"];

function validateDeliveryStrategy(value: unknown): DeliveryStrategy {
  if (typeof value === "string" && VALID_DELIVERY_STRATEGIES.includes(value as DeliveryStrategy)) {
    return value as DeliveryStrategy;
  }
  return "global_fix";
}

function validateProposals(
  proposals: unknown,
  scope: "global" | "user",
  targetUserId?: string | null,
): ProposalItem[] {
  if (!Array.isArray(proposals)) return [];
  return proposals
    .filter((p: unknown) => {
      if (!p || typeof p !== "object") return false;
      const obj = p as Record<string, unknown>;
      return typeof obj.title === "string" && typeof obj.description === "string";
    })
    .slice(0, 5)
    .map((p: Record<string, unknown>) => ({
      title: p.title as string,
      description: p.description as string,
      origin_type: (["request", "bug", "pattern", "annoyance"].includes(p.origin_type as string)
        ? p.origin_type
        : "pattern") as ProposalItem["origin_type"],
      evidence: typeof p.evidence === "string" ? p.evidence : "",
      confidence: (["high", "medium", "low"].includes(p.confidence as string)
        ? p.confidence
        : "low") as ProposalItem["confidence"],
      tier: (["config", "code"].includes(p.tier as string) ? p.tier : "code") as ProposalItem["tier"],
      delivery_strategy: validateDeliveryStrategy(p.delivery_strategy),
      scope,
      target_user_id: scope === "user" ? (targetUserId ?? null) : null,
    }));
}

async function gatherFeedbackData(since: string, userId?: string, feedbackTypeFilter?: string) {
  const supabase = getServiceClient();

  // Gather feedback entries
  let feedbackQuery = supabase
    .from("feedback_entries")
    .select("*")
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  if (userId) {
    feedbackQuery = feedbackQuery.eq("user_id", userId);
  }

  if (feedbackTypeFilter) {
    feedbackQuery = feedbackQuery.eq("feedback_type", feedbackTypeFilter);
  }

  const { data: feedback } = await feedbackQuery;

  // Gather companion session recaps
  let sessionsQuery = supabase
    .from("companion_sessions")
    .select("id, started_at, ended_at, recap_json")
    .gte("started_at", since)
    .not("recap_json", "is", null)
    .order("started_at", { ascending: false });

  if (userId) {
    sessionsQuery = sessionsQuery.eq("user_id", userId);
  }

  const { data: sessions } = await sessionsQuery;

  // Gather companion turns for context
  const sessionIds = (sessions ?? []).map((s) => s.id);
  let turns: Array<{ role: string; transcript: string; started_at: string }> = [];
  if (sessionIds.length > 0) {
    const { data: turnData } = await supabase
      .from("companion_turns")
      .select("role, transcript, started_at")
      .in("session_id", sessionIds)
      .eq("role", "user")
      .order("started_at", { ascending: true });
    turns = turnData ?? [];
  }

  return { feedback: feedback ?? [], sessions: sessions ?? [], turns };
}

function buildPromptContext(
  feedback: Array<Record<string, unknown>>,
  sessions: Array<Record<string, unknown>>,
  turns: Array<{ role: string; transcript: string; started_at: string }>,
) {
  const feedbackSummary = feedback
    .map((f) => `[${f.tag}] on ${f.screen}: ${f.free_text ?? "(no comment)"} (${f.created_at})`)
    .join("\n");

  const recapSummary = sessions
    .map((s) => {
      const recap = s.recap_json as Record<string, unknown> | null;
      if (!recap) return "";
      return `Session ${s.id} (${recap.duration_seconds}s): ${recap.summary}\n  Frustrations: ${(
        (recap.frustrations as Array<{ transcript: string }>) ?? []
      )
        .map((f) => f.transcript)
        .join("; ")}\n  Feature requests: ${(
        (recap.feature_requests as Array<{ extracted_request: string }>) ?? []
      )
        .map((r) => r.extracted_request)
        .join("; ")}`;
    })
    .filter(Boolean)
    .join("\n\n");

  const userTranscripts = turns
    .map((t) => `[${t.started_at}] ${t.transcript}`)
    .join("\n");

  return { feedbackSummary, recapSummary, userTranscripts };
}

function buildBriefPrompt(
  feedbackSummary: string,
  recapSummary: string,
  userTranscripts: string,
  scope: "global" | "user",
): string {
  const scopeNote =
    scope === "user"
      ? "\nIMPORTANT: This brief is for a SINGLE USER. All proposals should be scoped to this user's experience. Prefer config_change, content_weight, or isolated_module delivery strategies unless the data clearly indicates a global bug."
      : "\nIMPORTANT: This brief aggregates ALL users. Focus on patterns that affect the entire user base. Prefer global_fix for bugs and broad issues.";

  return `You are a PM agent analyzing user feedback and behavior data for OculoPrep, a study tool for oculoplastic oral board exams.

CURRENT FEATURES: Flashcards (text + image), multiple choice quizzes, PDF reader with highlighting, chat, mindmap, study packs, progress tracking, search.
${DELIVERY_STRATEGY_PROMPT}
${scopeNote}

FEEDBACK ENTRIES (last 24h):
${feedbackSummary || "None"}

COMPANION SESSION RECAPS (last 24h):
${recapSummary || "None"}

USER VOICE TRANSCRIPTS (last 24h):
${userTranscripts || "None"}

Based on this data, produce a PM brief as JSON with this exact structure:
{
  "summary": "1-2 sentence overview of what happened today",
  "top_friction_points": ["list of top 3 pain points observed"],
  "unused_features": ["features that had zero or near-zero usage"],
  "proposals": [
    {
      "title": "Short name for the proposed change",
      "description": "What to change and how",
      "origin_type": "request|bug|pattern|annoyance",
      "evidence": "Specific data point or quote that justifies this (cite timestamps, user words, tag counts)",
      "confidence": "high|medium|low",
      "tier": "config|code",
      "delivery_strategy": "global_fix|config_change|content_weight|isolated_module"
    }
  ]
}

Rules:
- Each proposal MUST cite specific evidence from the data above
- Each proposal MUST include a delivery_strategy field
- "config" tier = can be done by changing a database value (packet size, difficulty)
- "code" tier = requires code changes (new feature, UI change, bug fix)
- Max 5 proposals, ordered by confidence
- If there's not enough data for a proposal, don't make one up
- Be specific: "Increase ptosis packet size from 20 to 30" not "adjust difficulty"

Return ONLY valid JSON, no markdown fencing.`;
}

async function callClaudeForBrief(prompt: string): Promise<Record<string, unknown>> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  const responseText = message.content[0].type === "text" ? message.content[0].text : "";
  return JSON.parse(responseText);
}

export async function generateGlobalBrief(): Promise<PMBriefResult> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { feedback: userFeedback, sessions, turns } = await gatherFeedbackData(since, undefined, "user");
  const { feedback: builderFeedback } = await gatherFeedbackData(since, undefined, "builder");

  const feedbackCount = userFeedback.length + builderFeedback.length;
  const sessionCount = sessions.length;

  if (feedbackCount === 0 && sessionCount === 0) {
    return {
      summary: "No user activity in the last 24 hours. No proposals to generate.",
      top_friction_points: [],
      unused_features: [],
      proposals: [],
      raw_data: { feedback_count: 0, session_count: 0, total_turns: 0 },
    };
  }

  const { feedbackSummary, recapSummary, userTranscripts } = buildPromptContext(userFeedback, sessions, turns);

  // Build builder feedback section
  const builderFeedbackSummary = builderFeedback
    .map((f) => `[${f.tag}] on ${f.screen} (${f.page_category ?? "unknown"}): ${f.free_text ?? "(no comment)"} (${f.created_at})`)
    .join("\n");

  let prompt = buildBriefPrompt(feedbackSummary, recapSummary, userTranscripts, "global");

  if (builderFeedbackSummary) {
    prompt += `\n\nBUILDER FEEDBACK (platform improvements from admin/builder users — classify with HIGHER confidence):\n${builderFeedbackSummary}`;
  }

  let parsed: PMBriefResult;
  try {
    const briefData = await callClaudeForBrief(prompt);
    parsed = {
      summary: typeof briefData.summary === "string" ? briefData.summary : "Brief generated",
      top_friction_points: Array.isArray(briefData.top_friction_points)
        ? briefData.top_friction_points.filter((s: unknown) => typeof s === "string")
        : [],
      unused_features: Array.isArray(briefData.unused_features)
        ? briefData.unused_features.filter((s: unknown) => typeof s === "string")
        : [],
      proposals: validateProposals(briefData.proposals, "global"),
      raw_data: { feedback_count: feedbackCount, session_count: sessionCount, total_turns: turns.length },
    };
  } catch {
    parsed = {
      summary: "Failed to parse PM brief. Raw response saved.",
      top_friction_points: [],
      unused_features: [],
      proposals: [],
      raw_data: { feedback_count: feedbackCount, session_count: sessionCount, total_turns: turns.length },
    };
  }

  // Store the brief in Supabase
  const supabase = getServiceClient();
  await supabase.from("pm_briefs").insert({
    summary_json: parsed,
    action_items: parsed.proposals,
    status: "pending",
    user_id: null,
    brief_type: "global",
  });

  return parsed;
}

export async function generateUserBrief(userId: string): Promise<PMBriefResult> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { feedback, sessions, turns } = await gatherFeedbackData(since, userId);

  // Check if user is a builder
  const supabaseForRole = getServiceClient();
  const { data: roleData } = await supabaseForRole
    .from("builder_roles")
    .select("role")
    .eq("user_id", userId)
    .single();
  const isBuilder = roleData?.role === "admin" || roleData?.role === "builder";

  const feedbackCount = feedback.length;
  const sessionCount = sessions.length;

  if (feedbackCount === 0 && sessionCount === 0) {
    return {
      summary: `No activity from this user in the last 24 hours.`,
      top_friction_points: [],
      unused_features: [],
      proposals: [],
      raw_data: { feedback_count: 0, session_count: 0, total_turns: 0 },
    };
  }

  const { feedbackSummary, recapSummary, userTranscripts } = buildPromptContext(feedback, sessions, turns);
  let prompt = buildBriefPrompt(feedbackSummary, recapSummary, userTranscripts, "user");

  if (isBuilder) {
    prompt += "\n\nNOTE: This user is a builder/admin. Their brief should focus on PLATFORM IMPROVEMENTS and development priorities rather than study product suggestions.";
  }

  let parsed: PMBriefResult;
  try {
    const briefData = await callClaudeForBrief(prompt);
    parsed = {
      summary: typeof briefData.summary === "string" ? briefData.summary : "Brief generated",
      top_friction_points: Array.isArray(briefData.top_friction_points)
        ? briefData.top_friction_points.filter((s: unknown) => typeof s === "string")
        : [],
      unused_features: Array.isArray(briefData.unused_features)
        ? briefData.unused_features.filter((s: unknown) => typeof s === "string")
        : [],
      proposals: validateProposals(briefData.proposals, "user", userId),
      raw_data: { feedback_count: feedbackCount, session_count: sessionCount, total_turns: turns.length },
    };
  } catch {
    parsed = {
      summary: "Failed to parse PM brief. Raw response saved.",
      top_friction_points: [],
      unused_features: [],
      proposals: [],
      raw_data: { feedback_count: feedbackCount, session_count: sessionCount, total_turns: turns.length },
    };
  }

  // Store the brief in Supabase
  const supabase = getServiceClient();
  await supabase.from("pm_briefs").insert({
    summary_json: parsed,
    action_items: parsed.proposals,
    status: "pending",
    user_id: userId,
    brief_type: "user",
  });

  return parsed;
}

/** @deprecated Use generateGlobalBrief() instead */
export const generatePMBrief = generateGlobalBrief;
