import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

  test("right-click on highlight shows context menu with Remove Highlight option", async () => {
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

    const [hlButton] = await screen.findAllByRole("button", {
      name: /remove highlight: saved highlight/i,
    });

    fireEvent.contextMenu(hlButton);

    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: /remove highlight/i })).toBeInTheDocument();
  });

  test("clicking Remove Highlight in context menu calls onDeleteHighlight", async () => {
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

    const [hlButton] = await screen.findAllByRole("button", {
      name: /remove highlight: saved highlight/i,
    });

    fireEvent.contextMenu(hlButton);

    const menuItem = await screen.findByRole("menuitem", { name: /remove highlight/i });
    fireEvent.click(menuItem);

    expect(onDeleteHighlight).toHaveBeenCalledWith("hl-1");
  });

  test("context menu does not appear when right-clicking non-highlight areas", async () => {
    const onDeleteHighlight = vi.fn().mockResolvedValue(undefined);

    render(
      <PdfReader
        url="https://example.com/mock.pdf"
        highlights={[]}
        highlightMode={false}
        onSaveHighlight={vi.fn()}
        onDeleteHighlight={onDeleteHighlight}
      />
    );

    await screen.findByTestId("mock-page-1");

    const pageNode = getPageNode();
    fireEvent.contextMenu(pageNode);

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  test("Delete key removes the selected highlight", async () => {
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

    const [hlButton] = await screen.findAllByRole("button", {
      name: /remove highlight: saved highlight/i,
    });

    // Right-click to select the highlight (opens context menu)
    fireEvent.contextMenu(hlButton);
    await screen.findByRole("menu");

    // Press Delete key — should remove the selected highlight
    fireEvent.keyDown(document, { key: "Delete" });

    await waitFor(() => expect(onDeleteHighlight).toHaveBeenCalledWith("hl-1"));
    // Context menu should be dismissed
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  test("highlights show visual hover feedback when onDeleteHighlight is provided", async () => {
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

    const [hlButton] = await screen.findAllByRole("button", {
      name: /remove highlight: saved highlight/i,
    });

    expect(hlButton.className).toContain("hover:ring-1");
    expect(hlButton.className).toContain("hover:ring-coral/50");
  });

  test("error handling: component does not crash when onDeleteHighlight rejects", async () => {
    const onDeleteHighlight = vi.fn().mockRejectedValue(new Error("Network error"));
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

    const [hlButton] = await screen.findAllByRole("button", {
      name: /remove highlight: saved highlight/i,
    });

    // Right-click and use context menu — should not throw
    fireEvent.contextMenu(hlButton);
    const menuItem = await screen.findByRole("menuitem", { name: /remove highlight/i });
    fireEvent.click(menuItem);

    await waitFor(() => expect(onDeleteHighlight).toHaveBeenCalledWith("hl-1"));
    // Component should still be in the DOM
    expect(screen.getByTestId("mock-document")).toBeInTheDocument();
  });
});
