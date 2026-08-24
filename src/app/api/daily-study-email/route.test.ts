import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  buildDailyStudyEmail: vi.fn(),
  createRepository: vi.fn(),
  enforceRateLimit: vi.fn(),
  getServiceClient: vi.fn(),
  loadDailyStudyContent: vi.fn(),
}));

vi.mock("@/features/daily-study-email/daily-study-email", () => ({
  buildDailyStudyEmail: mocks.buildDailyStudyEmail,
}));

vi.mock("@/features/daily-study-email/load-daily-study-content", () => ({
  createSupabaseDailyStudyRepository: mocks.createRepository,
  loadDailyStudyContent: mocks.loadDailyStudyContent,
}));

vi.mock("@/lib/api-security", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
}));

vi.mock("@/lib/supabase/service", () => ({
  getServiceClient: mocks.getServiceClient,
}));

import { GET } from "./route";

describe("/api/daily-study-email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforceRateLimit.mockResolvedValue(null);
    mocks.getServiceClient.mockReturnValue({});
    mocks.createRepository.mockReturnValue({});
    mocks.loadDailyStudyContent.mockResolvedValue({ facts: [], questions: [] });
    mocks.buildDailyStudyEmail.mockReturnValue({
      subject: "Your 5-minute ASOPRS drill",
      html: "<p>Good morning.</p>",
      text: "Good morning.",
    });
  });

  it.each([
    "?unexpected=true",
    "?format=json",
    "?date=2000-01-01",
    "?date=2026-08-23&date=2026-08-23",
    "?format=text&format=text",
  ])("rejects an unbounded query variant: %s", async (query) => {
    const response = await GET(
      new NextRequest(`http://localhost/api/daily-study-email${query}`)
    );

    expect(response.status).toBe(400);
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(mocks.getServiceClient).not.toHaveBeenCalled();
  });

  it("fails closed before database content reads when the global limit is exhausted", async () => {
    mocks.enforceRateLimit.mockResolvedValue(
      NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": "60" } }
      )
    );

    const response = await GET(
      new NextRequest("http://localhost/api/daily-study-email")
    );

    expect(response.status).toBe(429);
    expect(mocks.getServiceClient).not.toHaveBeenCalled();
  });

  it("does not cache the undated automation response across a day rollover", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/daily-study-email")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(payload.subject).toBe("Your 5-minute ASOPRS drill");
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(
      "global",
      "daily_study_email",
      120,
      3_600
    );
    expect(mocks.loadDailyStudyContent).toHaveBeenCalledOnce();
  });

  it("uses bounded shared caching only for an explicit date", async () => {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const response = await GET(
      new NextRequest(`http://localhost/api/daily-study-email?date=${today}`)
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, s-maxage=3600, stale-while-revalidate=86400"
    );
  });
});
