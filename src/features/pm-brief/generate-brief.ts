import Anthropic from "@anthropic-ai/sdk";
import { getServiceClient } from "@/lib/supabase";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "",
});

interface ProposalItem {
  title: string;
  description: string;
  origin_type: "request" | "bug" | "pattern" | "annoyance";
  evidence: string;
  confidence: "high" | "medium" | "low";
  tier: "config" | "code";
}

interface PMBriefResult {
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

export async function generatePMBrief(): Promise<PMBriefResult> {
  const supabase = getServiceClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Gather feedback entries from last 24h
  const { data: feedback } = await supabase
    .from("feedback_entries")
    .select("*")
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  // Gather companion session recaps from last 24h
  const { data: sessions } = await supabase
    .from("companion_sessions")
    .select("id, started_at, ended_at, recap_json")
    .gte("started_at", since)
    .not("recap_json", "is", null)
    .order("started_at", { ascending: false });

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

  const feedbackCount = feedback?.length ?? 0;
  const sessionCount = sessions?.length ?? 0;

  // If no data, return empty brief
  if (feedbackCount === 0 && sessionCount === 0) {
    return {
      summary: "No user activity in the last 24 hours. No proposals to generate.",
      top_friction_points: [],
      unused_features: [],
      proposals: [],
      raw_data: { feedback_count: 0, session_count: 0, total_turns: 0 },
    };
  }

  // Build context for Claude
  const feedbackSummary = (feedback ?? [])
    .map((f) => `[${f.tag}] on ${f.screen}: ${f.free_text ?? "(no comment)"} (${f.created_at})`)
    .join("\n");

  const recapSummary = (sessions ?? [])
    .map((s) => {
      const recap = s.recap_json;
      if (!recap) return "";
      return `Session ${s.id} (${recap.duration_seconds}s): ${recap.summary}\n  Frustrations: ${(recap.frustrations ?? []).map((f: { transcript: string }) => f.transcript).join("; ")}\n  Feature requests: ${(recap.feature_requests ?? []).map((r: { extracted_request: string }) => r.extracted_request).join("; ")}`;
    })
    .filter(Boolean)
    .join("\n\n");

  const userTranscripts = turns
    .map((t) => `[${t.started_at}] ${t.transcript}`)
    .join("\n");

  const prompt = `You are a PM agent analyzing user feedback and behavior data for OculoPrep, a study tool for oculoplastic oral board exams.

CURRENT FEATURES: Flashcards (text + image), multiple choice quizzes, PDF reader with highlighting, chat, mindmap, study packs, progress tracking, search.

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
      "tier": "config|code"
    }
  ]
}

Rules:
- Each proposal MUST cite specific evidence from the data above
- "config" tier = can be done by changing a database value (packet size, difficulty)
- "code" tier = requires code changes (new feature, UI change, bug fix)
- Max 5 proposals, ordered by confidence
- If there's not enough data for a proposal, don't make one up
- Be specific: "Increase ptosis packet size from 20 to 30" not "adjust difficulty"

Return ONLY valid JSON, no markdown fencing.`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  const responseText = message.content[0].type === "text" ? message.content[0].text : "";

  let parsed: PMBriefResult;
  try {
    const briefData = JSON.parse(responseText);
    // Validate required fields exist and have correct types
    const validatedProposals = Array.isArray(briefData.proposals)
      ? briefData.proposals.filter((p: unknown) => {
          if (!p || typeof p !== 'object') return false;
          const obj = p as Record<string, unknown>;
          return typeof obj.title === 'string' && typeof obj.description === 'string';
        }).slice(0, 5)
      : [];

    parsed = {
      summary: typeof briefData.summary === 'string' ? briefData.summary : 'Brief generated',
      top_friction_points: Array.isArray(briefData.top_friction_points) ? briefData.top_friction_points.filter((s: unknown) => typeof s === 'string') : [],
      unused_features: Array.isArray(briefData.unused_features) ? briefData.unused_features.filter((s: unknown) => typeof s === 'string') : [],
      proposals: validatedProposals,
      raw_data: { feedback_count: feedbackCount, session_count: sessionCount, total_turns: turns.length },
    };
  } catch {
    parsed = {
      summary: "Failed to parse PM brief. Raw response saved.",
      top_friction_points: [],
      unused_features: [],
      proposals: [],
      raw_data: {
        feedback_count: feedbackCount,
        session_count: sessionCount,
        total_turns: turns.length,
      },
    };
  }

  // Store the brief in Supabase
  await supabase.from("pm_briefs").insert({
    summary_json: parsed,
    action_items: parsed.proposals,
    status: "pending",
  });

  return parsed;
}
