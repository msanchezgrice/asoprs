import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/highlights.js", () => ({
  fetchHighlights: vi.fn(),
  deleteHighlightById: vi.fn(),
}));

// Import after mocking to get the TS version (docId-based API)
import { useHighlights } from "./useHighlights.ts";
import { fetchHighlights, deleteHighlightById } from "@/lib/highlights.js";

const MOCK_HIGHLIGHTS = [
  {
    id: "hl-1",
    document_id: "doc-1",
    page_number: 1,
    color: "#FFEB3B",
    text_content: "First highlight",
    rects: [{ x: 0.1, y: 0.2, width: 0.4, height: 0.03 }],
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "hl-2",
    document_id: "doc-1",
    page_number: 2,
    color: "#4CAF50",
    text_content: "Second highlight",
    rects: [{ x: 0.2, y: 0.3, width: 0.3, height: 0.02 }],
    created_at: "2026-01-02T00:00:00Z",
  },
];

describe("useHighlights", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("load() fetches highlights and populates the highlights list", async () => {
    vi.mocked(fetchHighlights).mockResolvedValue(MOCK_HIGHLIGHTS);

    const { result } = renderHook(() => useHighlights("doc-1"));

    expect(result.current.highlights).toEqual([]);
    expect(result.current.loading).toBe(false);

    act(() => {
      void result.current.load();
    });

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.highlights).toEqual(MOCK_HIGHLIGHTS);
    expect(result.current.error).toBeNull();
    expect(fetchHighlights).toHaveBeenCalledWith("doc-1");
  });

  test("load() sets error state when fetchHighlights throws", async () => {
    vi.mocked(fetchHighlights).mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useHighlights("doc-1"));

    await act(async () => {
      await result.current.load();
    });

    expect(result.current.error).toBe("Network error");
    expect(result.current.highlights).toEqual([]);
  });

  test("removeHighlight() deletes a highlight from the list and calls the API", async () => {
    vi.mocked(fetchHighlights).mockResolvedValue(MOCK_HIGHLIGHTS);
    vi.mocked(deleteHighlightById).mockResolvedValue(undefined);

    const { result } = renderHook(() => useHighlights("doc-1"));

    await act(async () => {
      await result.current.load();
    });

    expect(result.current.highlights).toHaveLength(2);

    await act(async () => {
      await result.current.removeHighlight("hl-1");
    });

    expect(deleteHighlightById).toHaveBeenCalledWith("hl-1");
    expect(result.current.highlights).toHaveLength(1);
    expect(result.current.highlights[0].id).toBe("hl-2");
  });

  test("removeHighlight() sets error state and re-throws when API fails", async () => {
    vi.mocked(fetchHighlights).mockResolvedValue(MOCK_HIGHLIGHTS);
    vi.mocked(deleteHighlightById).mockRejectedValue(new Error("DB error"));

    const { result } = renderHook(() => useHighlights("doc-1"));

    await act(async () => {
      await result.current.load();
    });

    let thrownError: Error | null = null;
    await act(async () => {
      try {
        await result.current.removeHighlight("hl-1");
      } catch (err) {
        thrownError = err as Error;
      }
    });

    expect(thrownError).not.toBeNull();
    expect(thrownError!.message).toBe("DB error");
    expect(result.current.error).toBe("DB error");
    // List unchanged since delete failed
    expect(result.current.highlights).toHaveLength(2);
  });

  test("addHighlight() appends a highlight without an API call", () => {
    const { result } = renderHook(() => useHighlights("doc-1"));

    const newHighlight = {
      id: "hl-new",
      document_id: "doc-1",
      page_number: 3,
      color: "#2196F3",
      text_content: "New highlight",
      rects: [],
      created_at: "2026-01-03T00:00:00Z",
    };

    act(() => {
      result.current.addHighlight(newHighlight);
    });

    expect(result.current.highlights).toHaveLength(1);
    expect(result.current.highlights[0]).toEqual(newHighlight);
    expect(fetchHighlights).not.toHaveBeenCalled();
    expect(deleteHighlightById).not.toHaveBeenCalled();
  });
});
