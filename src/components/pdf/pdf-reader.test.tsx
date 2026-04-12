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

  test("renders saved PDF highlights as interactive buttons when onDeleteHighlight is provided", async () => {
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
        highlightMode={false}
        onSaveHighlight={vi.fn()}
        onDeleteHighlight={onDeleteHighlight}
      />
    );

    // Highlight is rendered as an accessible button
    const hlBtn = await screen.findByRole("button", {
      name: /remove highlight: saved highlight/i,
    });
    expect(hlBtn).toBeInTheDocument();

    // Clicking selects the highlight — does NOT immediately delete
    fireEvent.click(hlBtn);
    expect(onDeleteHighlight).not.toHaveBeenCalled();
  });

  test("right-clicking a highlight shows the context menu with Remove Highlight option", async () => {
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
        highlightMode={false}
        onSaveHighlight={vi.fn()}
        onDeleteHighlight={onDeleteHighlight}
      />
    );

    const hlBtn = await screen.findByRole("button", {
      name: /remove highlight: saved highlight/i,
    });

    fireEvent.contextMenu(hlBtn);

    expect(screen.getByTestId("highlight-context-menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /remove highlight/i })).toBeInTheDocument();
  });

  test("clicking Remove Highlight in the context menu calls onDeleteHighlight", async () => {
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
        highlightMode={false}
        onSaveHighlight={vi.fn()}
        onDeleteHighlight={onDeleteHighlight}
      />
    );

    const hlBtn = await screen.findByRole("button", {
      name: /remove highlight: saved highlight/i,
    });

    fireEvent.contextMenu(hlBtn);
    fireEvent.click(screen.getByRole("menuitem", { name: /remove highlight/i }));

    expect(onDeleteHighlight).toHaveBeenCalledWith("hl-1");
  });

  test("pressing Delete key on a focused highlight calls onDeleteHighlight", async () => {
    const onDeleteHighlight = vi.fn().mockResolvedValue(undefined);
    const highlights: PdfHighlight[] = [
      {
        id: "hl-4",
        page_number: 1,
        color: "#E91E63",
        text_content: "Keyboard delete highlight",
        rects: [{ x: 0.3, y: 0.3, width: 0.3, height: 0.02 }],
      },
    ];

    render(
      <PdfReader
        url="https://example.com/mock.pdf"
        highlights={highlights}
        highlightMode={false}
        onSaveHighlight={vi.fn()}
        onDeleteHighlight={onDeleteHighlight}
      />
    );

    const highlightButton = await screen.findByRole("button", {
      name: /remove highlight: keyboard delete highlight/i,
    });

    // Delete key pressed directly on the focused highlight button
    fireEvent.keyDown(highlightButton, { key: "Delete" });

    expect(onDeleteHighlight).toHaveBeenCalledWith("hl-4");
  });

  test("pressing Delete key removes the click-selected highlight", async () => {
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
        highlightMode={false}
        onSaveHighlight={vi.fn()}
        onDeleteHighlight={onDeleteHighlight}
      />
    );

    const hlBtn = await screen.findByRole("button", {
      name: /remove highlight: saved highlight/i,
    });

    // Click to select the highlight, then press Delete at the document level
    fireEvent.click(hlBtn);
    fireEvent.keyDown(document, { key: "Delete" });

    expect(onDeleteHighlight).toHaveBeenCalledWith("hl-1");
  });

  test("context menu does not appear when right-clicking in highlight mode", async () => {
    const onDeleteHighlight = vi.fn().mockResolvedValue(undefined);
    const highlights: PdfHighlight[] = [
      {
        id: "hl-5",
        page_number: 1,
        color: "#FFEB3B",
        text_content: "Highlight mode test",
        rects: [{ x: 0.1, y: 0.1, width: 0.3, height: 0.02 }],
      },
    ];

    render(
      <PdfReader
        url="https://example.com/mock.pdf"
        highlights={highlights}
        highlightMode={true}
        onSaveHighlight={vi.fn()}
        onDeleteHighlight={onDeleteHighlight}
      />
    );

    await screen.findByTestId("mock-page-1");

    const highlightButtons = screen.queryAllByRole("button", {
      name: /remove highlight/i,
    });

    if (highlightButtons.length > 0) {
      fireEvent.contextMenu(highlightButtons[0]);
    }

    expect(screen.queryByTestId("highlight-context-menu")).not.toBeInTheDocument();
  });

  test("context menu does not appear when right-clicking outside highlights", async () => {
    render(
      <PdfReader
        url="https://example.com/mock.pdf"
        highlights={[]}
        highlightMode={false}
        onSaveHighlight={vi.fn()}
        onDeleteHighlight={vi.fn()}
      />
    );

    await screen.findByTestId("mock-page-1");

    fireEvent.contextMenu(document.body);

    expect(screen.queryByTestId("highlight-context-menu")).not.toBeInTheDocument();
  });

  test("highlight buttons have hover and focus feedback classes when removable", async () => {
    const onDeleteHighlight = vi.fn().mockResolvedValue(undefined);
    const highlights: PdfHighlight[] = [
      {
        id: "hl-6",
        page_number: 1,
        color: "#FFEB3B",
        text_content: "Hover feedback",
        rects: [{ x: 0.1, y: 0.1, width: 0.3, height: 0.02 }],
      },
    ];

    render(
      <PdfReader
        url="https://example.com/mock.pdf"
        highlights={highlights}
        highlightMode={false}
        onSaveHighlight={vi.fn()}
        onDeleteHighlight={onDeleteHighlight}
      />
    );

    const highlightButton = await screen.findByRole("button", {
      name: /remove highlight: hover feedback/i,
    });

    expect(highlightButton.className).toContain("hover:ring-1");
    expect(highlightButton.className).toContain("hover:ring-coral");
    expect(highlightButton.className).toContain("cursor-pointer");
  });

  test("context menu closes when Escape is pressed", async () => {
    const onDeleteHighlight = vi.fn().mockResolvedValue(undefined);
    const highlights: PdfHighlight[] = [
      {
        id: "hl-7",
        page_number: 1,
        color: "#FFEB3B",
        text_content: "Escape test",
        rects: [{ x: 0.1, y: 0.1, width: 0.3, height: 0.02 }],
      },
    ];

    render(
      <PdfReader
        url="https://example.com/mock.pdf"
        highlights={highlights}
        highlightMode={false}
        onSaveHighlight={vi.fn()}
        onDeleteHighlight={onDeleteHighlight}
      />
    );

    const highlightButton = await screen.findByRole("button", {
      name: /remove highlight: escape test/i,
    });

    fireEvent.contextMenu(highlightButton);
    expect(screen.getByTestId("highlight-context-menu")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() =>
      expect(screen.queryByTestId("highlight-context-menu")).not.toBeInTheDocument()
    );
  });

  test("Delete key does not fire when no highlight is selected", async () => {
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
        highlightMode={false}
        onSaveHighlight={vi.fn()}
        onDeleteHighlight={onDeleteHighlight}
      />
    );

    await screen.findByRole("button", { name: /remove highlight/i });

    // Press Delete on document without selecting a highlight first
    fireEvent.keyDown(document, { key: "Delete" });

    expect(onDeleteHighlight).not.toHaveBeenCalled();
  });
});
