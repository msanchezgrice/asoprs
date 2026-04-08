import { afterEach, describe, expect, test, vi } from "vitest";
import {
  deleteHighlightById,
  isValidHighlightId,
  removeHighlightById,
  groupHighlightsByPage,
  rectsOverlap,
  findOverlappingHighlightIds,
} from "./highlights";
import type { PdfHighlightRect } from "@/components/pdf/highlight-types";

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

describe("removeHighlightById", () => {
  test("removes the highlight with the given id", () => {
    const highlights = [
      { id: "a", page_number: 1 },
      { id: "b", page_number: 2 },
      { id: "c", page_number: 3 },
    ];
    expect(removeHighlightById(highlights, "b")).toEqual([
      { id: "a", page_number: 1 },
      { id: "c", page_number: 3 },
    ]);
  });

  test("returns the original list unchanged when id is not found", () => {
    const highlights = [{ id: "a", page_number: 1 }];
    expect(removeHighlightById(highlights, "missing")).toEqual(highlights);
  });

  test("returns empty array when removing the only element", () => {
    expect(removeHighlightById([{ id: "only", page_number: 1 }], "only")).toEqual([]);
  });

  test("does not mutate the original array", () => {
    const highlights = [{ id: "x", page_number: 1 }, { id: "y", page_number: 2 }];
    const copy = [...highlights];
    removeHighlightById(highlights, "x");
    expect(highlights).toEqual(copy);
  });
});

describe("groupHighlightsByPage", () => {
  test("groups highlights by page number", () => {
    const highlights = [
      { id: "a", page_number: 1 },
      { id: "b", page_number: 2 },
      { id: "c", page_number: 1 },
    ];
    const grouped = groupHighlightsByPage(highlights);
    expect(grouped.get(1)).toEqual([
      { id: "a", page_number: 1 },
      { id: "c", page_number: 1 },
    ]);
    expect(grouped.get(2)).toEqual([{ id: "b", page_number: 2 }]);
  });

  test("returns empty map for empty input", () => {
    expect(groupHighlightsByPage([])).toEqual(new Map());
  });
});

describe("rectsOverlap", () => {
  const r = (x: number, y: number, w: number, h: number): PdfHighlightRect => ({
    x, y, width: w, height: h,
  });

  test("returns true for overlapping rects", () => {
    expect(rectsOverlap(r(0.1, 0.1, 0.3, 0.1), r(0.2, 0.1, 0.3, 0.1))).toBe(true);
  });

  test("returns false for non-overlapping rects side by side", () => {
    expect(rectsOverlap(r(0.0, 0.1, 0.2, 0.1), r(0.3, 0.1, 0.2, 0.1))).toBe(false);
  });

  test("returns false for rects that only touch at the edge", () => {
    expect(rectsOverlap(r(0.0, 0.1, 0.3, 0.1), r(0.3, 0.1, 0.3, 0.1))).toBe(false);
  });

  test("returns true when one rect is contained within another", () => {
    expect(rectsOverlap(r(0.0, 0.0, 1.0, 1.0), r(0.2, 0.2, 0.1, 0.1))).toBe(true);
  });
});

describe("findOverlappingHighlightIds", () => {
  const makeH = (id: string, rects: PdfHighlightRect[]) => ({ id, rects });

  test("returns ids of highlights that overlap with the target", () => {
    const highlights = [
      makeH("a", [{ x: 0.1, y: 0.1, width: 0.4, height: 0.05 }]),
      makeH("b", [{ x: 0.2, y: 0.1, width: 0.4, height: 0.05 }]),
      makeH("c", [{ x: 0.8, y: 0.8, width: 0.1, height: 0.05 }]),
    ];
    const result = findOverlappingHighlightIds("a", highlights);
    expect(result).toContain("b");
    expect(result).not.toContain("a");
    expect(result).not.toContain("c");
  });

  test("returns empty array when target id is not found", () => {
    const highlights = [makeH("a", [{ x: 0.1, y: 0.1, width: 0.3, height: 0.05 }])];
    expect(findOverlappingHighlightIds("nonexistent", highlights)).toEqual([]);
  });

  test("does not include the target highlight id in results", () => {
    const highlights = [makeH("a", [{ x: 0.1, y: 0.1, width: 0.3, height: 0.05 }])];
    expect(findOverlappingHighlightIds("a", highlights)).not.toContain("a");
  });
});
