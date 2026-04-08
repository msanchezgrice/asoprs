import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type {
  CompanionSession,
  CompanionTurn,
  CompanionEvent,
  SessionRecap,
  FrustrationSignal,
  FeatureRequest,
} from "./types";

const supabase = createBrowserSupabaseClient();

export async function createSession(): Promise<CompanionSession | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("companion_sessions")
    .insert({ user_id: user.id })
    .select()
    .single();

  if (error) {
    console.error("Failed to create companion session:", error);
    return null;
  }
  return data;
}

export async function endSession(
  sessionId: string,
  recap: SessionRecap,
): Promise<void> {
  await supabase
    .from("companion_sessions")
    .update({
      ended_at: new Date().toISOString(),
      recap_json: recap,
    })
    .eq("id", sessionId);
}

export async function saveTurn(
  sessionId: string,
  turn: Omit<CompanionTurn, "id" | "session_id">,
  feedbackType?: string,
): Promise<void> {
  await supabase.from("companion_turns").insert({
    session_id: sessionId,
    ...turn,
    feedback_type: feedbackType ?? "user",
  });
}

export async function saveEvent(
  sessionId: string,
  event: Omit<CompanionEvent, "id" | "session_id">,
  feedbackType?: string,
): Promise<void> {
  await supabase.from("companion_events").insert({
    session_id: sessionId,
    ...event,
    feedback_type: feedbackType ?? "user",
  });
}

export async function saveScreenshot(
  sessionId: string,
  base64Jpeg: string,
): Promise<string | null> {
  const filename = `${sessionId}/${Date.now()}.jpg`;
  const buffer = Uint8Array.from(atob(base64Jpeg), (c) => c.charCodeAt(0));

  const { error } = await supabase.storage
    .from("companion-screenshots")
    .upload(filename, buffer, { contentType: "image/jpeg" });

  if (error) {
    console.error("Failed to upload screenshot:", error);
    return null;
  }

  const { data } = supabase.storage
    .from("companion-screenshots")
    .getPublicUrl(filename);

  return data.publicUrl;
}

export function buildSessionRecap(
  session: CompanionSession,
  turns: CompanionTurn[],
  events: CompanionEvent[],
): SessionRecap {
  const userTurns = turns.filter((t) => t.role === "user");
  const modelTurns = turns.filter((t) => t.role === "model");

  const frustrations: FrustrationSignal[] = [];
  const featureRequests: FeatureRequest[] = [];

  for (const turn of userTurns) {
    const text = turn.transcript.toLowerCase();

    if (
      text.includes("i wish") ||
      text.includes("why can't") ||
      text.includes("this should") ||
      text.includes("it would be nice") ||
      text.includes("can you add")
    ) {
      featureRequests.push({
        timestamp: turn.started_at,
        transcript: turn.transcript,
        screenshot_url: null,
        extracted_request: turn.transcript,
      });
    }

    if (
      text.includes("confusing") ||
      text.includes("annoying") ||
      text.includes("frustrat") ||
      text.includes("broken") ||
      text.includes("doesn't work") ||
      text.includes("can't see") ||
      text.includes("too small") ||
      text.includes("wrong")
    ) {
      frustrations.push({
        timestamp: turn.started_at,
        transcript: turn.transcript,
        screenshot_url: null,
        signal_type: "verbal",
        description: turn.transcript,
      });
    }
  }

  const startedAt = new Date(session.started_at).getTime();
  const endedAt = session.ended_at
    ? new Date(session.ended_at).getTime()
    : Date.now();

  const screenshotEvents = events.filter((e) => e.event_type === "screenshot");

  return {
    session_id: session.id,
    duration_seconds: Math.round((endedAt - startedAt) / 1000),
    turn_count: { user: userTurns.length, model: modelTurns.length },
    frustrations,
    feature_requests: featureRequests,
    questions_answered: modelTurns.length,
    screenshots_captured: screenshotEvents.length,
    summary: buildSummaryText(
      userTurns.length,
      modelTurns.length,
      frustrations.length,
      featureRequests.length,
    ),
  };
}

function buildSummaryText(
  userTurns: number,
  modelTurns: number,
  frustrations: number,
  featureRequests: number,
): string {
  const parts: string[] = [];
  parts.push(`${userTurns} user turns, ${modelTurns} model responses`);
  if (frustrations > 0) parts.push(`${frustrations} frustrations detected`);
  if (featureRequests > 0) parts.push(`${featureRequests} feature requests`);
  return parts.join(". ") + ".";
}
