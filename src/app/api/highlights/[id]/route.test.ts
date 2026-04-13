import { beforeEach, describe, expect, test, vi } from "vitest";
import { DELETE } from "./route";
import type { NextRequest } from "next/server";

function makeSupabaseMock(opts: {
  user: { id: string } | null;
  deleteError?: { message: string } | null;
}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: opts.user } }),
    },
    from: vi.fn().mockReturnValue({
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: opts.deleteError ?? null }),
        }),
      }),
    }),
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

const { createServerSupabaseClient } = await import("@/lib/supabase/server");

describe("DELETE /api/highlights/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns 401 when user is not authenticated", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeSupabaseMock({ user: null }) as never
    );

    const res = await DELETE(null as unknown as NextRequest, {
      params: Promise.resolve({ id: "hl-1" }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Authentication required");
  });

  test("deletes highlight and returns success for authenticated user", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeSupabaseMock({ user: { id: "user-1" } }) as never
    );

    const res = await DELETE(null as unknown as NextRequest, {
      params: Promise.resolve({ id: "hl-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("returns 500 when database error occurs", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "user-1" },
        deleteError: { message: "DB connection failed" },
      }) as never
    );

    const res = await DELETE(null as unknown as NextRequest, {
      params: Promise.resolve({ id: "hl-1" }),
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("DB connection failed");
  });

  test("calls supabase delete with correct user_id and highlight id", async () => {
    const supabaseMock = makeSupabaseMock({ user: { id: "user-42" } });
    vi.mocked(createServerSupabaseClient).mockResolvedValue(supabaseMock as never);

    await DELETE(null as unknown as NextRequest, {
      params: Promise.resolve({ id: "highlight-99" }),
    });

    const fromChain = supabaseMock.from("user_pdf_highlights");
    const deleteChain = fromChain.delete();
    expect(deleteChain.eq).toHaveBeenCalledWith("user_id", "user-42");
    expect(deleteChain.eq("user_id", "user-42").eq).toHaveBeenCalledWith("id", "highlight-99");
  });
});
