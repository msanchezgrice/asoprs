import { describe, it, expect, vi } from "vitest";

// Mock Supabase before importing session-store
vi.mock("@/lib/supabase/browser", () => ({
  createBrowserSupabaseClient: () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "test" } } }) },
    from: () => ({ insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: {} }), update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() }),
    storage: { from: () => ({ upload: vi.fn().mockResolvedValue({ error: null }), getPublicUrl: () => ({ data: { publicUrl: "url" } }) }) },
  }),
}));

import { buildSessionRecap } from "./session-store";
import type { CompanionSession, CompanionTurn, CompanionEvent } from "./types";

describe("buildSessionRecap", () => {
  const baseSession: CompanionSession = {
    id: "sess-1",
    user_id: "user-1",
    started_at: "2026-04-06T10:00:00Z",
    ended_at: "2026-04-06T10:30:00Z",
    recap_json: null,
    created_at: "2026-04-06T10:00:00Z",
  };

  it("calculates duration correctly", () => {
    const recap = buildSessionRecap(baseSession, [], []);
    expect(recap.duration_seconds).toBe(1800); // 30 min
  });

  it("counts user and model turns", () => {
    const turns: CompanionTurn[] = [
      { id: "t1", session_id: "sess-1", role: "user", transcript: "hello", prompt_kind: null, started_at: "2026-04-06T10:01:00Z", ended_at: "2026-04-06T10:01:01Z" },
      { id: "t2", session_id: "sess-1", role: "model", transcript: "hi there", prompt_kind: null, started_at: "2026-04-06T10:01:01Z", ended_at: "2026-04-06T10:01:02Z" },
      { id: "t3", session_id: "sess-1", role: "user", transcript: "another question", prompt_kind: null, started_at: "2026-04-06T10:02:00Z", ended_at: "2026-04-06T10:02:01Z" },
    ];
    const recap = buildSessionRecap(baseSession, turns, []);
    expect(recap.turn_count.user).toBe(2);
    expect(recap.turn_count.model).toBe(1);
  });

  it("detects feature requests from transcript", () => {
    const turns: CompanionTurn[] = [
      { id: "t1", session_id: "sess-1", role: "user", transcript: "I wish I could zoom in on these images", prompt_kind: null, started_at: "2026-04-06T10:01:00Z", ended_at: "2026-04-06T10:01:01Z" },
      { id: "t2", session_id: "sess-1", role: "user", transcript: "why can't I change the packet size", prompt_kind: null, started_at: "2026-04-06T10:02:00Z", ended_at: "2026-04-06T10:02:01Z" },
    ];
    const recap = buildSessionRecap(baseSession, turns, []);
    expect(recap.feature_requests.length).toBe(2);
    expect(recap.feature_requests[0].transcript).toContain("zoom in");
  });

  it("detects frustration signals from transcript", () => {
    const turns: CompanionTurn[] = [
      { id: "t1", session_id: "sess-1", role: "user", transcript: "this is really confusing", prompt_kind: null, started_at: "2026-04-06T10:01:00Z", ended_at: "2026-04-06T10:01:01Z" },
      { id: "t2", session_id: "sess-1", role: "user", transcript: "the highlighting is broken", prompt_kind: null, started_at: "2026-04-06T10:02:00Z", ended_at: "2026-04-06T10:02:01Z" },
    ];
    const recap = buildSessionRecap(baseSession, turns, []);
    expect(recap.frustrations.length).toBe(2);
    expect(recap.frustrations[0].signal_type).toBe("verbal");
  });

  it("counts screenshots from events", () => {
    const events: CompanionEvent[] = [
      { id: "e1", session_id: "sess-1", event_type: "screenshot", payload: {}, screenshot_url: "url1", occurred_at: "2026-04-06T10:01:00Z" },
      { id: "e2", session_id: "sess-1", event_type: "screenshot", payload: {}, screenshot_url: "url2", occurred_at: "2026-04-06T10:01:05Z" },
      { id: "e3", session_id: "sess-1", event_type: "other", payload: {}, screenshot_url: null, occurred_at: "2026-04-06T10:01:10Z" },
    ];
    const recap = buildSessionRecap(baseSession, [], events);
    expect(recap.screenshots_captured).toBe(2);
  });

  it("builds summary text", () => {
    const turns: CompanionTurn[] = [
      { id: "t1", session_id: "sess-1", role: "user", transcript: "I wish I could zoom", prompt_kind: null, started_at: "2026-04-06T10:01:00Z", ended_at: "2026-04-06T10:01:01Z" },
      { id: "t2", session_id: "sess-1", role: "model", transcript: "noted", prompt_kind: null, started_at: "2026-04-06T10:01:01Z", ended_at: "2026-04-06T10:01:02Z" },
    ];
    const recap = buildSessionRecap(baseSession, turns, []);
    expect(recap.summary).toContain("1 user turns");
    expect(recap.summary).toContain("1 feature requests");
  });
});
