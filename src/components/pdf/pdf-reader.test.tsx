import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { PdfReader, type PdfHighlight } from "./pdf-reader";

vi.mock("react-pdf", async () => {
  const React = await import("react");

  return {
    pdfjs: {
      GlobalWorkerOptions: {
        workerSrc: "",
      },
    },
    Document: ({
      children,
      onLoadSuccess,
    }: {
      children: React.ReactNode;
      onLoadSuccess?: (payload: { numPages: number }) => void;
    }) => {
      React.useEffect(() => {
        onLoadSuccess?.({ numPages: 1 });
      }, [onLoadSuccess]);

      return <div data-testid="mock-document">{children}</div>;
    },
    Page: ({ pageNumber }: { pageNumber: number }) => (
      <div data-testid={`mock-page-${pageNumber}`}>
        <span>Mock PDF text for page {pageNumber}</span>
      </div>
    ),
  };
});

interface SelectionStub {
  isCollapsed: boolean;
  toString: () => string;
  getRangeAt: (index: number) => RangeStub;
  removeAllRanges: ReturnType<typeof vi.fn>;
}

interface RangeStub {
  commonAncestorContainer: Node;
  getClientRects: () => DOMRect[];
}

function installSelectionStub(selection: SelectionStub) {
  Object.defineProperty(window, "getSelection", {
    configurable: true,
    value: vi.fn(() => selection),
  });
}

function setPageRect(pageNode: HTMLElement, rect: DOMRect) {
  Object.defineProperty(pageNode, "getBoundingClientRect", {
    configurable: true,
    value: () => rect,
  });
}

function getPageNode() {
  const pageNode = document.querySelector("[data-pdf-page-number='1']");
  if (!(pageNode instanceof HTMLElement)) {
    throw new Error("Expected page wrapper to render");
  }
  return pageNode;
}

describe("PdfReader", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    delete (window as Window & { getSelection?: () => Selection | null }).getSelection;
  });

  test("saves normal text selections as highlight rects", async () => {
    const onSaveHighlight = vi.fn().mockResolvedValue(undefined);

    render(
      <PdfReader
        url="https://example.com/mock.pdf"
        highlights={[]}
        highlightMode
        onSaveHighlight={onSaveHighlight}
      />
    );

    await screen.findByTestId("mock-page-1");

    const pageNode = getPageNode();
    const textNode = screen.getByText("Mock PDF text for page 1").firstChild;
    if (!textNode) {
      throw new Error("Expected text node");
    }

    setPageRect(pageNode, new DOMRect(0, 0, 400, 600));

    const selection: SelectionStub = {
      isCollapsed: false,
      toString: () => "Mock PDF text",
      getRangeAt: () => ({
        commonAncestorContainer: textNode,
        getClientRects: () => [new DOMRect(40, 120, 160, 18)],
      }),
      removeAllRanges: vi.fn(),
    };

    installSelectionStub(selection);

    fireEvent.mouseUp(pageNode);

    await waitFor(() =>
      expect(onSaveHighlight).toHaveBeenCalledWith(1, "Mock PDF text", [
        { x: 0.1, y: 0.2, width: 0.4, height: 0.03 },
      ])
    );

    expect(selection.removeAllRanges).toHaveBeenCalled();
  });

  test("ignores suspicious selections that cover almost the entire page", async () => {
    const onSaveHighlight = vi.fn().mockResolvedValue(undefined);

    render(
      <PdfReader
        url="https://example.com/mock.pdf"
        highlights={[]}
        highlightMode
        onSaveHighlight={onSaveHighlight}
      />
    );

    await screen.findByTestId("mock-page-1");

    const pageNode = getPageNode();
    const textNode = screen.getByText("Mock PDF text for page 1").firstChild;
    if (!textNode) {
      throw new Error("Expected text node");
    }

    setPageRect(pageNode, new DOMRect(0, 0, 400, 600));

    const selection: SelectionStub = {
      isCollapsed: false,
      toString: () => "Accidental whole page selection",
      getRangeAt: () => ({
        commonAncestorContainer: textNode,
        getClientRects: () => [new DOMRect(2, 2, 396, 590)],
      }),
      removeAllRanges: vi.fn(),
    };

    installSelectionStub(selection);

    fireEvent.mouseUp(pageNode);

    await waitFor(() => expect(onSaveHighlight).not.toHaveBeenCalled());
    expect(selection.removeAllRanges).toHaveBeenCalled();
  });

  test("renders saved PDF highlights as removable controls in PDF view", async () => {
    const onDeleteHighlight = vi.fn().mockResolvedValue(undefined);
    const highlights: PdfHighlight[] = [
      {
        id: "hl-1",
        page_number: 1,
        color: "#FFEB3B",
        text_content: "Saved highlight",
        rects: [{ x: 0.1, y: 0.2, width: 0.4, height: 0.03 }],
      },
    ];

    render(
      <PdfReader
        {...({
          url: "https://example.com/mock.pdf",
          highlights,
          highlightMode: false,
          onSaveHighlight: vi.fn(),
          onDeleteHighlight,
        } as never)}
      />
    );

    const deleteButtons = await screen.findAllByRole("button", {
      name: /remove highlight: saved highlight/i,
    });

    fireEvent.click(deleteButtons[0]);

    expect(onDeleteHighlight).toHaveBeenCalledWith("hl-1");
  });

  test("does not call onDeleteHighlight when clicking highlight while in highlight mode", async () => {
    const onDeleteHighlight = vi.fn().mockResolvedValue(undefined);
    const highlights: PdfHighlight[] = [
      {
        id: "hl-1",
        page_number: 1,
        color: "#FFEB3B",
        text_content: "Saved highlight",
        rects: [{ x: 0.1, y: 0.2, width: 0.4, height: 0.03 }],
      },
    ];

    render(
      <PdfReader
        url="https://example.com/mock.pdf"
        highlights={highlights}
        highlightMode
        onSaveHighlight={vi.fn()}
        onDeleteHighlight={onDeleteHighlight}
      />
    );

    await screen.findByTestId("mock-page-1");

    const buttons = screen.getAllByRole("button");
    for (const btn of buttons) {
      fireEvent.click(btn);
    }

    expect(onDeleteHighlight).not.toHaveBeenCalled();
  });

  test("removes only the clicked highlight and preserves others", async () => {
    const onDeleteHighlight = vi.fn().mockResolvedValue(undefined);
    const highlights: PdfHighlight[] = [
      {
        id: "hl-1",
        page_number: 1,
        color: "#FFEB3B",
        text_content: "First highlight",
        rects: [{ x: 0.1, y: 0.1, width: 0.3, height: 0.03 }],
      },
      {
        id: "hl-2",
        page_number: 1,
        color: "#4CAF50",
        text_content: "Second highlight",
        rects: [{ x: 0.1, y: 0.4, width: 0.3, height: 0.03 }],
      },
    ];

    render(
      <PdfReader
        {...({
          url: "https://example.com/mock.pdf",
          highlights,
          highlightMode: false,
          onSaveHighlight: vi.fn(),
          onDeleteHighlight,
        } as never)}
      />
    );

    const firstButton = await screen.findByRole("button", {
      name: /remove highlight: first highlight/i,
    });

    fireEvent.click(firstButton);

    expect(onDeleteHighlight).toHaveBeenCalledTimes(1);
    expect(onDeleteHighlight).toHaveBeenCalledWith("hl-1");
    expect(onDeleteHighlight).not.toHaveBeenCalledWith("hl-2");
  });

  test("renders highlights for the correct page and excludes highlights from other pages", async () => {
    const onDeleteHighlight = vi.fn().mockResolvedValue(undefined);
    // hl-page1 belongs to page 1 (rendered), hl-page2 belongs to page 2 (not rendered by mock)
    const highlights: PdfHighlight[] = [
      {
        id: "hl-page1",
        page_number: 1,
        color: "#FFEB3B",
        text_content: "Page one highlight",
        rects: [{ x: 0.1, y: 0.2, width: 0.4, height: 0.03 }],
      },
      {
        id: "hl-page2",
        page_number: 2,
        color: "#2196F3",
        text_content: "Page two highlight",
        rects: [{ x: 0.2, y: 0.3, width: 0.3, height: 0.03 }],
      },
    ];

    render(
      <PdfReader
        {...({
          url: "https://example.com/mock.pdf",
          highlights,
          highlightMode: false,
          onSaveHighlight: vi.fn(),
          onDeleteHighlight,
        } as never)}
      />
    );

    // Only page 1 is rendered by mock; page 1 button should be present
    const page1Button = await screen.findByRole("button", {
      name: /remove highlight: page one highlight/i,
    });

    // Page 2 highlight should not be visible since mock renders only 1 page
    expect(screen.queryByRole("button", { name: /remove highlight: page two highlight/i })).toBeNull();

    fireEvent.click(page1Button);
    expect(onDeleteHighlight).toHaveBeenCalledTimes(1);
    expect(onDeleteHighlight).toHaveBeenCalledWith("hl-page1");
  });

  test("renders multiple rects for a single highlight and calls onDeleteHighlight once per rect click", async () => {
    const onDeleteHighlight = vi.fn().mockResolvedValue(undefined);
    const highlights: PdfHighlight[] = [
      {
        id: "hl-multi",
        page_number: 1,
        color: "#E91E63",
        text_content: "Multi-rect highlight",
        rects: [
          { x: 0.1, y: 0.1, width: 0.3, height: 0.03 },
          { x: 0.1, y: 0.15, width: 0.25, height: 0.03 },
        ],
      },
    ];

    render(
      <PdfReader
        {...({
          url: "https://example.com/mock.pdf",
          highlights,
          highlightMode: false,
          onSaveHighlight: vi.fn(),
          onDeleteHighlight,
        } as never)}
      />
    );

    const buttons = await screen.findAllByRole("button", {
      name: /remove highlight: multi-rect highlight/i,
    });

    expect(buttons).toHaveLength(2);

    fireEvent.click(buttons[0]);
    expect(onDeleteHighlight).toHaveBeenCalledTimes(1);
    expect(onDeleteHighlight).toHaveBeenCalledWith("hl-multi");
  });
});
