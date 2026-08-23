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
  const response = await fetch("/api/companion/sessions", { method: "POST" });
  if (!response.ok) {
    console.error("Failed to create companion session.");
    return null;
  }
  return response.json() as Promise<CompanionSession>;
}

export async function endSession(
  sessionId: string,
  recap: SessionRecap,
): Promise<void> {
  await fetch("/api/companion/recap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, recap_json: recap }),
  });
}

export async function saveTurn(
  sessionId: string,
  turn: Omit<CompanionTurn, "id" | "session_id">,
): Promise<void> {
  await fetch("/api/companion/turns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      role: turn.role,
      transcript: turn.transcript.slice(0, 8_000),
      prompt_kind: turn.prompt_kind?.slice(0, 100) ?? null,
      started_at: turn.started_at,
      ended_at: turn.ended_at,
    }),
  });
}

export async function saveEvent(
  sessionId: string,
  event: Omit<CompanionEvent, "id" | "session_id">,
): Promise<void> {
  await fetch("/api/companion/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      event_type: event.event_type.slice(0, 100),
      payload: JSON.stringify(event.payload ?? {}).length <= 16_000 ? event.payload : {},
      screenshot_url: event.screenshot_url?.slice(0, 500) ?? null,
      occurred_at: event.occurred_at,
    }),
  });
}

export async function saveScreenshot(
  sessionId: string,
  base64Jpeg: string,
): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const buffer = Uint8Array.from(atob(base64Jpeg), (c) => c.charCodeAt(0));
  if (buffer.byteLength > 2 * 1024 * 1024) {
    console.error("Screenshot exceeds the private bucket size limit.");
    return null;
  }

  const filename = `${user.id}/${sessionId}/${Date.now()}.jpg`;

  const { error } = await supabase.storage
    .from("companion-screenshots")
    .upload(filename, buffer, { contentType: "image/jpeg" });

  if (error) {
    console.error("Failed to upload screenshot:", error);
    return null;
  }

  // Store only the private object path. A signed URL must be minted on demand
  // after an ownership check if this image is ever displayed.
  return filename;
}

export async function deleteScreenshot(path: string): Promise<void> {
  const { error } = await supabase.storage
    .from("companion-screenshots")
    .remove([path]);

  if (error) {
    console.error("Failed to remove stale companion screenshot:", error);
  }
}

export function buildSessionRecap(
  session: CompanionSession,
  turns: CompanionTurn[],
  events: CompanionEvent[],
): SessionRecap {
  const userTurns = turns.filter((t) => t.role === "user").slice(-100);
  const modelTurns = turns.filter((t) => t.role === "model").slice(-100);

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
