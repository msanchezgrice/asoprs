import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fetchHighlights, saveHighlight, removeHighlight } from "./highlights";

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

describe("highlights lib", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("fetchHighlights", () => {
    test("returns array of highlight records on success", async () => {
      const records = [
        { id: "hl-1", document_id: "doc-1", page_number: 1, color: "#FFEB3B", text_content: "Test", rects: [], created_at: "" },
      ];
      global.fetch = mockFetch(200, records);

      const result = await fetchHighlights("doc-1");

      expect(global.fetch).toHaveBeenCalledWith("/api/highlights?docId=doc-1");
      expect(result).toEqual(records);
    });

    test("returns empty array when response is not ok", async () => {
      global.fetch = mockFetch(500, { error: "server error" });

      const result = await fetchHighlights("doc-1");

      expect(result).toEqual([]);
    });

    test("returns empty array when response body is not an array", async () => {
      global.fetch = mockFetch(200, { error: "unexpected" });

      const result = await fetchHighlights("doc-1");

      expect(result).toEqual([]);
    });
  });

  describe("saveHighlight", () => {
    test("returns saved highlight record on success", async () => {
      const saved = { id: "hl-new", document_id: "doc-1", page_number: 2, color: "#FF9800", text_content: "Hello", rects: [{ x: 0.1, y: 0.1, width: 0.3, height: 0.05 }], created_at: "" };
      global.fetch = mockFetch(200, saved);

      const result = await saveHighlight({
        document_id: "doc-1",
        page_number: 2,
        color: "#FF9800",
        text_content: "Hello",
        rects: [{ x: 0.1, y: 0.1, width: 0.3, height: 0.05 }],
      });

      expect(result).toEqual(saved);
      const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[0]).toBe("/api/highlights");
      expect(call[1].method).toBe("POST");
    });

    test("returns null when response is not ok", async () => {
      global.fetch = mockFetch(401, { error: "Authentication required" });

      const result = await saveHighlight({
        document_id: "doc-1",
        page_number: 1,
        color: "#FFEB3B",
        text_content: "text",
        rects: [],
      });

      expect(result).toBeNull();
    });

    test("returns null when response body has no id", async () => {
      global.fetch = mockFetch(200, { error: "something wrong" });

      const result = await saveHighlight({
        document_id: "doc-1",
        page_number: 1,
        color: "#FFEB3B",
        text_content: "text",
        rects: [],
      });

      expect(result).toBeNull();
    });
  });

  describe("removeHighlight", () => {
    test("returns true on successful deletion", async () => {
      global.fetch = mockFetch(200, { success: true });

      const result = await removeHighlight("hl-1");

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith("/api/highlights?id=hl-1", { method: "DELETE" });
    });

    test("returns false when deletion fails", async () => {
      global.fetch = mockFetch(400, { error: "valid id required" });

      const result = await removeHighlight("bad-id");

      expect(result).toBe(false);
    });

    test("returns false on server error", async () => {
      global.fetch = mockFetch(500, { error: "internal error" });

      const result = await removeHighlight("hl-1");

      expect(result).toBe(false);
    });

    test("URL-encodes the highlight id", async () => {
      global.fetch = mockFetch(200, { success: true });

      await removeHighlight("hl/special&id");

      expect(global.fetch).toHaveBeenCalledWith(
        "/api/highlights?id=hl%2Fspecial%26id",
        { method: "DELETE" }
      );
    });
  });
});
