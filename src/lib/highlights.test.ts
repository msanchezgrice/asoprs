import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { removeHighlight } from "./highlights";

describe("removeHighlight", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("calls DELETE /api/highlights/:id", async () => {
    fetchMock.mockResolvedValue({ ok: true });

    await removeHighlight("hl-123");

    expect(fetchMock).toHaveBeenCalledWith("/api/highlights/hl-123", {
      method: "DELETE",
    });
  });

  test("resolves without error on success", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    await expect(removeHighlight("hl-1")).resolves.toBeUndefined();
  });

  test("throws an error when the response is not ok", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Not found" }),
    });

    await expect(removeHighlight("hl-1")).rejects.toThrow("Not found");
  });

  test("throws a generic error when response has no error field", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({}),
    });

    await expect(removeHighlight("hl-1")).rejects.toThrow(
      "Failed to delete highlight"
    );
  });

  test("throws an error when json parsing fails", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => {
        throw new Error("invalid json");
      },
    });

    await expect(removeHighlight("hl-1")).rejects.toThrow(
      "Failed to delete highlight"
    );
  });
});
