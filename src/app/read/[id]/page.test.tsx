import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ReaderPageContent } from "./page";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/dynamic", () => ({
  default: () => () => null,
}));

vi.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => ({
    user: { id: "user-1" },
  }),
}));

vi.mock("@/components/user-feature-slot", () => ({
  UserFeatureSlot: () => null,
}));

const DOCUMENT_RESPONSE = {
  id: "doc-1",
  title: "Sample Reader Doc",
  category: "Orbit",
  page_count: 1,
  storage_path: null,
  chunks: [
    {
      id: "chunk-1",
      chunk_index: 0,
      content: "Alpha beta gamma delta.",
      page_start: 1,
      page_end: 1,
    },
  ],
};

const CREATED_HIGHLIGHT = {
  id: "hl-1",
  document_id: "doc-1",
  page_number: 0,
  color: "#FFEB3B",
  text_content: "Alpha beta",
  rects: { chunkIndex: 0, startOffset: 0, endOffset: 10 },
  created_at: "2026-04-12T00:00:00Z",
};

let fetchMock: ReturnType<typeof vi.fn>;

function renderReaderPage() {
  return render(<ReaderPageContent id="doc-1" />);
}

describe("ReaderPage highlight undo", () => {
  beforeEach(() => {
    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === "/api/documents/doc-1") {
        return {
          json: async () => DOCUMENT_RESPONSE,
        } as Response;
      }

      if (url === "/api/highlights?docId=doc-1") {
        return {
          json: async () => [],
        } as Response;
      }

      if (url === "/api/highlights" && init?.method === "POST") {
        return {
          status: 200,
          json: async () => CREATED_HIGHLIGHT,
        } as Response;
      }

      if (url === "/api/highlights?id=hl-1" && init?.method === "DELETE") {
        return {
          ok: true,
          json: async () => ({ success: true }),
        } as Response;
      }

      throw new Error(`Unhandled fetch: ${url} ${init?.method || "GET"}`);
    });

    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("enables undo after creating a text highlight and removes that highlight on undo", async () => {
    renderReaderPage();

    await screen.findByRole("button", { name: /^highlight$/i });
    await waitFor(() => {
      const requestedUrls = fetchMock.mock.calls.map(([input]) =>
        typeof input === "string" ? input : input.toString()
      );

      expect(requestedUrls).toContain("/api/documents/doc-1");
      expect(requestedUrls).toContain("/api/highlights?docId=doc-1");
    });

    const undoButton = screen.getByRole("button", { name: /undo highlight/i });
    expect(undoButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /^highlight$/i }));
    expect(screen.queryAllByRole("button", { name: "" })).toHaveLength(0);

    const paragraph = screen.getByText("Alpha beta gamma delta.");
    const textNode = paragraph.firstChild;
    if (!textNode) {
      throw new Error("Expected paragraph text node");
    }

    const removeAllRanges = vi.fn();
    Object.defineProperty(window, "getSelection", {
      configurable: true,
      value: () => ({
        isCollapsed: false,
        toString: () => "Alpha beta",
        getRangeAt: () => ({
          startContainer: textNode,
        }),
        removeAllRanges,
      }),
    });

    fireEvent.mouseUp(document);

    await waitFor(() => expect(undoButton).toBeEnabled());
    fireEvent.click(undoButton);

    await waitFor(() => {
      expect(undoButton).toBeDisabled();
      expect(fetchMock).toHaveBeenCalledWith("/api/highlights?id=hl-1", { method: "DELETE" });
    });

    expect(removeAllRanges).toHaveBeenCalled();
  });
});
