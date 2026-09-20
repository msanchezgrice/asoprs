import { describe, expect, test, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

import { DELETE } from "./route";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const VALID_UUID = "12345678-1234-1234-1234-123456789012";

function makeRequest(id: string) {
  return new NextRequest(`http://localhost/api/highlights/${id}`, { method: "DELETE" });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function mockSupabase(user: { id: string } | null, dbResult: { error: { message: string } | null } = { error: null }) {
  const eqChain = { eq: vi.fn().mockResolvedValue(dbResult) };
  const deleteChain = { eq: vi.fn().mockReturnValue(eqChain) };

  vi.mocked(createServerSupabaseClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from: vi.fn().mockReturnValue({
      delete: vi.fn().mockReturnValue(deleteChain),
    }),
  } as never);
}

describe("DELETE /api/highlights/[id]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test("returns 401 when user is not authenticated", async () => {
    mockSupabase(null);
    const res = await DELETE(makeRequest(VALID_UUID), makeParams(VALID_UUID));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Authentication required");
  });

  test("returns 400 for invalid UUID", async () => {
    mockSupabase({ id: "user-1" });
    const res = await DELETE(makeRequest("not-a-uuid"), makeParams("not-a-uuid"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid highlight id");
  });

  test("deletes highlight and returns success for authenticated user", async () => {
    mockSupabase({ id: "user-1" }, { error: null });
    const res = await DELETE(makeRequest(VALID_UUID), makeParams(VALID_UUID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true });
  });

  test("returns 500 when database deletion fails", async () => {
    mockSupabase({ id: "user-1" }, { error: { message: "DB connection error" } });
    const res = await DELETE(makeRequest(VALID_UUID), makeParams(VALID_UUID));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("DB connection error");
  });

  test("only deletes highlights belonging to the authenticated user", async () => {
    const eqSpy = vi.fn().mockResolvedValue({ error: null });
    const eqUserSpy = vi.fn().mockReturnValue({ eq: eqSpy });
    const deleteSpy = vi.fn().mockReturnValue({ eq: eqUserSpy });

    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-abc" } } }),
      },
      from: vi.fn().mockReturnValue({ delete: deleteSpy }),
    } as never);

    await DELETE(makeRequest(VALID_UUID), makeParams(VALID_UUID));

    expect(eqUserSpy).toHaveBeenCalledWith("user_id", "user-abc");
    expect(eqSpy).toHaveBeenCalledWith("id", VALID_UUID);
  });
});
