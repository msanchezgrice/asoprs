import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_UUID = "123e4567-e89b-12d3-a456-426614174000";

// Build a chainable Supabase delete mock: .delete().eq().eq()
function makeDeleteChain(resolvedValue: { error: null | { message: string } }) {
  const eq2 = vi.fn().mockResolvedValue(resolvedValue);
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
  return { delete: vi.fn().mockReturnValue({ eq: eq1 }) };
}

const mockAuth = { getUser: vi.fn() };
const mockFrom = vi.fn();
const mockSupabase = { auth: mockAuth, from: mockFrom };

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(() => Promise.resolve(mockSupabase)),
}));

import { DELETE } from "./route";

describe("highlights DELETE endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when the user is not authenticated", async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: null } });

    const req = new NextRequest(`http://localhost/api/highlights?id=${VALID_UUID}`, {
      method: "DELETE",
    });
    const res = await DELETE(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("Authentication required");
  });

  it("returns 400 when id query param is missing", async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });

    const req = new NextRequest("http://localhost/api/highlights", {
      method: "DELETE",
    });
    const res = await DELETE(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("valid id required");
  });

  it("returns 400 when id is not a valid UUID", async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });

    const req = new NextRequest("http://localhost/api/highlights?id=not-a-uuid", {
      method: "DELETE",
    });
    const res = await DELETE(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("valid id required");
  });

  it("deletes the highlight and returns success when authenticated with a valid id", async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockFrom.mockReturnValue(makeDeleteChain({ error: null }));

    const req = new NextRequest(`http://localhost/api/highlights?id=${VALID_UUID}`, {
      method: "DELETE",
    });
    const res = await DELETE(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("returns 500 when the database delete fails", async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockFrom.mockReturnValue(makeDeleteChain({ error: { message: "DB error" } }));

    const req = new NextRequest(`http://localhost/api/highlights?id=${VALID_UUID}`, {
      method: "DELETE",
    });
    const res = await DELETE(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("DB error");
  });
});
