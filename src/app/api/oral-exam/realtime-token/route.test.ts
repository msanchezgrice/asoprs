import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("@/lib/api-security", () => ({
  enforcePaidRateLimit: vi.fn().mockResolvedValue(null),
  requireSameOrigin: vi.fn().mockReturnValue(null),
  requireUser: vi.fn().mockResolvedValue({
    ok: true,
    user: { id: "test-user", email_confirmed_at: "2026-01-01T00:00:00Z" },
  }),
}));

const ORIGINAL_OPENAI_KEY = process.env.OPENAI_API_KEY;
const ORIGINAL_REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL;

describe("/api/oral-exam/realtime-token", () => {
  afterEach(() => {
    process.env.OPENAI_API_KEY = ORIGINAL_OPENAI_KEY;
    process.env.OPENAI_REALTIME_MODEL = ORIGINAL_REALTIME_MODEL;
    vi.unstubAllGlobals();
  });

  it("returns a clear unavailable response when the server key is missing", async () => {
    delete process.env.OPENAI_API_KEY;

    const response = await POST(new Request("http://localhost/api/oral-exam/realtime-token", { method: "POST" }));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error).toBe("OpenAI Realtime is not configured.");
  });

  it("returns a client secret when OpenAI accepts the session request", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.OPENAI_REALTIME_MODEL = "gpt-realtime-2";
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ value: "ek_live", expires_at: 456 }),
    });
    vi.stubGlobal("fetch", fetchImpl);

    const response = await POST(new Request("http://localhost/api/oral-exam/realtime-token", { method: "POST" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ value: "ek_live", expires_at: 456 });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const request = fetchImpl.mock.calls[0][1];
    const body = JSON.parse(request?.body as string);
    expect(body.session.model).toBe("gpt-realtime-2.1");
    expect(body.session.audio.input.turn_detection).toBeNull();
  });
});
