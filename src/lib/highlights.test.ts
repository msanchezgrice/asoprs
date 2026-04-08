import { afterEach, describe, expect, test, vi } from "vitest";
import { deleteHighlightById, isValidHighlightId } from "./highlights";

const VALID_UUID = "123e4567-e89b-12d3-a456-426614174000";

describe("isValidHighlightId", () => {
  test("accepts a valid lowercase UUID", () => {
    expect(isValidHighlightId(VALID_UUID)).toBe(true);
  });

  test("accepts a valid uppercase UUID", () => {
    expect(isValidHighlightId(VALID_UUID.toUpperCase())).toBe(true);
  });

  test("rejects an empty string", () => {
    expect(isValidHighlightId("")).toBe(false);
  });

  test("rejects a plain string", () => {
    expect(isValidHighlightId("not-a-uuid")).toBe(false);
  });

  test("rejects a truncated UUID", () => {
    expect(isValidHighlightId("123e4567-e89b-12d3-a456")).toBe(false);
  });

  test("rejects a numeric id", () => {
    expect(isValidHighlightId("12345")).toBe(false);
  });
});

describe("deleteHighlightById", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("rejects an invalid id without calling fetch", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    await expect(deleteHighlightById("bad-id")).rejects.toThrow(
      "Invalid highlight ID format"
    );

    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("calls DELETE /api/highlights?id=<uuid> for a valid id", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetch);

    await deleteHighlightById(VALID_UUID);

    expect(mockFetch).toHaveBeenCalledWith(
      `/api/highlights?id=${VALID_UUID}`,
      { method: "DELETE" }
    );
  });

  test("throws when the server responds with an error status", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal("fetch", mockFetch);

    await expect(deleteHighlightById(VALID_UUID)).rejects.toThrow(
      "Failed to delete highlight: 500"
    );
  });

  test("resolves without error on a 404-style id that is valid UUID format", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetch);

    await expect(
      deleteHighlightById("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
    ).resolves.toBeUndefined();
  });
});
