import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({
    auth: { getUser: mocks.getUser },
  }),
}));

vi.mock("@/lib/supabase/service", () => ({
  getServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: mocks.maybeSingle }),
      }),
    }),
    rpc: mocks.rpc,
  }),
}));

import {
  enforcePaidRateLimit,
  enforceRateLimit,
  requireAdmin,
  requireCronOrAdmin,
  requireSameOrigin,
  requireUser,
} from "./api-security";

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

describe("API security boundary", () => {
  beforeEach(() => {
    mocks.getUser.mockReset();
    mocks.maybeSingle.mockReset();
    mocks.rpc.mockReset();
    delete process.env.CRON_SECRET;
  });

  afterEach(() => {
    process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
  });

  it("rejects requests without a verified server-side user", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const result = await requireUser();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("rejects an ordinary user from the admin boundary", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-a", email_confirmed_at: "2026-01-01T00:00:00Z" } },
      error: null,
    });
    mocks.maybeSingle.mockResolvedValue({ data: { role: "user" }, error: null });

    const result = await requireAdmin();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("accepts only a trusted database admin assignment", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "admin-a", email_confirmed_at: "2026-01-01T00:00:00Z" } },
      error: null,
    });
    mocks.maybeSingle.mockResolvedValue({ data: { role: "admin" }, error: null });

    await expect(requireAdmin()).resolves.toMatchObject({ ok: true });
  });

  it("fails a cron call closed when no cron secret is configured", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const result = await requireCronOrAdmin(new Request("https://asoprs.example/api/cron"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("rejects cross-site mutation origins", () => {
    const request = new Request("https://asoprs.example/api/feedback", {
      method: "POST",
      headers: { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" },
    });

    expect(requireSameOrigin(request)?.status).toBe(403);
  });

  it("returns 429 and Retry-After when the durable quota is exhausted", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ allowed: false, remaining: 0, retry_after_seconds: 37 }],
      error: null,
    });

    const response = await enforceRateLimit("user-a", "chat", 20, 600);
    expect(response?.status).toBe(429);
    expect(response?.headers.get("Retry-After")).toBe("37");
  });

  it("fails closed when the quota store is unavailable", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "08006" } });

    const response = await enforceRateLimit("user-a", "chat", 20, 600);
    expect(response?.status).toBe(503);
  });

  it("layers user, network, and global ceilings for paid APIs", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ allowed: true, remaining: 9, retry_after_seconds: 0 }],
      error: null,
    });

    const response = await enforcePaidRateLimit(
      new Request("https://asoprs.example/api/chat", {
        headers: { "x-vercel-forwarded-for": "203.0.113.42" },
      }),
      "user-a",
      "chat",
      { user: 20, ip: 40, global: 1_000, windowSeconds: 600 },
    );

    expect(response).toBeNull();
    expect(mocks.rpc).toHaveBeenCalledTimes(3);
    expect(mocks.rpc.mock.calls[0][1].p_actor).toBe("user:user-a");
    expect(mocks.rpc.mock.calls[1][1].p_actor).toMatch(/^network:[0-9a-f]{32}$/);
    expect(mocks.rpc.mock.calls[2][1].p_actor).toBe("global");
  });
});
