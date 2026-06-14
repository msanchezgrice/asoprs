import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const ORIGINAL_OPENAI_KEY = process.env.OPENAI_API_KEY;

describe("/api/oral-exam/realtime-token", () => {
  afterEach(() => {
    process.env.OPENAI_API_KEY = ORIGINAL_OPENAI_KEY;
    vi.unstubAllGlobals();
  });

  it("returns a clear unavailable response when the server key is missing", async () => {
    delete process.env.OPENAI_API_KEY;

    const response = await POST();
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error).toBe("OpenAI Realtime is not configured.");
  });

  it("returns a client secret when OpenAI accepts the session request", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ value: "ek_live", expires_at: 456 }),
    });
    vi.stubGlobal("fetch", fetchImpl);

    const response = await POST();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ value: "ek_live", expires_at: 456 });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
