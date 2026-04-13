import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { HighlightContextMenu } from "./highlight-context-menu";

describe("HighlightContextMenu", () => {
  afterEach(() => cleanup());

  test("renders menu with Remove Highlight option", () => {
    render(
      <HighlightContextMenu
        x={100}
        y={200}
        highlightId="hl-1"
        onRemove={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /remove highlight/i })
    ).toBeInTheDocument();
  });

  test("calls onRemove with highlightId and onClose when Remove Highlight is clicked", () => {
    const onRemove = vi.fn();
    const onClose = vi.fn();

    render(
      <HighlightContextMenu
        x={100}
        y={200}
        highlightId="hl-42"
        onRemove={onRemove}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole("menuitem", { name: /remove highlight/i }));

    expect(onRemove).toHaveBeenCalledWith("hl-42");
    expect(onClose).toHaveBeenCalled();
  });

  test("calls onClose when Escape key is pressed", () => {
    const onClose = vi.fn();

    render(
      <HighlightContextMenu
        x={100}
        y={200}
        highlightId="hl-1"
        onRemove={vi.fn()}
        onClose={onClose}
      />
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalled();
  });

  test("calls onClose when clicking outside the menu", () => {
    const onClose = vi.fn();

    render(
      <HighlightContextMenu
        x={100}
        y={200}
        highlightId="hl-1"
        onRemove={vi.fn()}
        onClose={onClose}
      />
    );

    fireEvent.mouseDown(document.body);

    expect(onClose).toHaveBeenCalled();
  });

  test("does not call onClose when clicking inside the menu", () => {
    const onClose = vi.fn();

    render(
      <HighlightContextMenu
        x={100}
        y={200}
        highlightId="hl-1"
        onRemove={vi.fn()}
        onClose={onClose}
      />
    );

    const menu = screen.getByRole("menu");
    fireEvent.mouseDown(menu);

    expect(onClose).not.toHaveBeenCalled();
  });

  test("is positioned at the specified x and y coordinates", () => {
    render(
      <HighlightContextMenu
        x={150}
        y={250}
        highlightId="hl-1"
        onRemove={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const menu = screen.getByRole("menu");
    expect(menu.style.top).toBe("250px");
    expect(menu.style.left).toBe("150px");
  });
});
