import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useHighlights } from "./useHighlights";
import type { Highlight } from "../types/highlight";

vi.mock("@/lib/highlights", () => ({
  deleteHighlightById: vi.fn().mockResolvedValue(undefined),
}));

const makeHighlight = (overrides: Partial<Highlight> = {}): Highlight => ({
  id: "hl-1",
  document_id: "doc-1",
  page_number: 1,
  color: "#FFEB3B",
  text_content: "sample text",
  rects: [{ x: 0.1, y: 0.2, width: 0.4, height: 0.03 }],
  created_at: "2024-01-01T00:00:00Z",
  ...overrides,
});

describe("useHighlights", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("initialises with provided highlights", () => {
    const highlights = [makeHighlight({ id: "hl-1" }), makeHighlight({ id: "hl-2" })];
    const { result } = renderHook(() => useHighlights(highlights));
    expect(result.current.highlights).toHaveLength(2);
  });

  test("removeHighlight calls deleteHighlight and removes from state", async () => {
    const { deleteHighlightById: deleteHighlight } = await import("@/lib/highlights");
    const highlights = [makeHighlight({ id: "hl-1" }), makeHighlight({ id: "hl-2" })];
    const { result } = renderHook(() => useHighlights(highlights));

    await act(async () => {
      await result.current.removeHighlight("hl-1");
    });

    expect(deleteHighlight).toHaveBeenCalledWith("hl-1");
    expect(result.current.highlights).toHaveLength(1);
    expect(result.current.highlights[0].id).toBe("hl-2");
  });

  test("removeHighlight only removes the targeted highlight", async () => {
    const highlights = [
      makeHighlight({ id: "hl-1", page_number: 1 }),
      makeHighlight({ id: "hl-2", page_number: 2 }),
      makeHighlight({ id: "hl-3", page_number: 3 }),
    ];
    const { result } = renderHook(() => useHighlights(highlights));

    await act(async () => {
      await result.current.removeHighlight("hl-2");
    });

    expect(result.current.highlights.map((h) => h.id)).toEqual(["hl-1", "hl-3"]);
  });

  test("removeHighlight works across multiple PDF pages", async () => {
    const highlights = [
      makeHighlight({ id: "p1-hl", page_number: 1 }),
      makeHighlight({ id: "p5-hl", page_number: 5 }),
      makeHighlight({ id: "p10-hl", page_number: 10 }),
    ];
    const { result } = renderHook(() => useHighlights(highlights));

    await act(async () => {
      await result.current.removeHighlight("p5-hl");
    });

    expect(result.current.highlights).toHaveLength(2);
    expect(result.current.highlights.find((h) => h.id === "p5-hl")).toBeUndefined();
    expect(result.current.highlights.find((h) => h.id === "p1-hl")).toBeDefined();
    expect(result.current.highlights.find((h) => h.id === "p10-hl")).toBeDefined();
  });

  test("addHighlight appends a new highlight to state", () => {
    const { result } = renderHook(() => useHighlights([]));
    const newHighlight = makeHighlight({ id: "hl-new" });

    act(() => {
      result.current.addHighlight(newHighlight);
    });

    expect(result.current.highlights).toHaveLength(1);
    expect(result.current.highlights[0].id).toBe("hl-new");
  });

  test("handles overlapping highlights — each removed individually", async () => {
    const overlapping = [
      makeHighlight({ id: "hl-a", rects: [{ x: 0.1, y: 0.1, width: 0.5, height: 0.05 }] }),
      makeHighlight({ id: "hl-b", rects: [{ x: 0.2, y: 0.1, width: 0.3, height: 0.05 }] }),
    ];
    const { result } = renderHook(() => useHighlights(overlapping));

    await act(async () => {
      await result.current.removeHighlight("hl-a");
    });

    expect(result.current.highlights).toHaveLength(1);
    expect(result.current.highlights[0].id).toBe("hl-b");

    await act(async () => {
      await result.current.removeHighlight("hl-b");
    });

    expect(result.current.highlights).toHaveLength(0);
  });

  test("removeHighlight propagates errors from the API", async () => {
    const { deleteHighlightById: deleteHighlight } = await import("@/lib/highlights");
    vi.mocked(deleteHighlight).mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useHighlights([makeHighlight()]));

    await expect(
      act(async () => {
        await result.current.removeHighlight("hl-1");
      })
    ).rejects.toThrow("Network error");

    // State is not mutated when the API call fails
    expect(result.current.highlights).toHaveLength(1);
  });
});
