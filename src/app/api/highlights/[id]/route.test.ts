import { describe, it, expect, vi, beforeEach } from "vitest";

let mockUser: { id: string } | null = { id: "user-123" };
let mockDeleteError: { message: string } | null = null;

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () =>
    Promise.resolve({
      auth: {
        getUser: () => Promise.resolve({ data: { user: mockUser } }),
      },
      from: () => ({
        delete: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ error: mockDeleteError }),
          }),
        }),
      }),
    }),
}));

import { DELETE } from "./route";
import { NextRequest } from "next/server";

const VALID_UUID = "123e4567-e89b-12d3-a456-426614174000";

function makeRequest(id: string) {
  return new NextRequest(`http://localhost/api/highlights/${id}`, { method: "DELETE" });
}

describe("DELETE /api/highlights/[id]", () => {
  beforeEach(() => {
    mockUser = { id: "user-123" };
    mockDeleteError = null;
  });

  it("returns 401 when not authenticated", async () => {
    mockUser = null;
    const res = await DELETE(makeRequest(VALID_UUID), {
      params: Promise.resolve({ id: VALID_UUID }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Authentication required");
  });

  it("returns 400 for invalid (non-UUID) id", async () => {
    const res = await DELETE(makeRequest("not-a-uuid"), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid highlight id");
  });

  it("deletes highlight and returns success for valid UUID", async () => {
    const res = await DELETE(makeRequest(VALID_UUID), {
      params: Promise.resolve({ id: VALID_UUID }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("returns 500 when the database returns an error", async () => {
    mockDeleteError = { message: "DB constraint violation" };
    const res = await DELETE(makeRequest(VALID_UUID), {
      params: Promise.resolve({ id: VALID_UUID }),
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("DB constraint violation");
  });
});
