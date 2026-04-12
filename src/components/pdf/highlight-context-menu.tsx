"use client";

export interface HighlightContextMenuProps {
  x: number;
  y: number;
  highlightId: string;
  onRemove: (id: string) => void;
  onClose: () => void;
}

export function HighlightContextMenu({
  x,
  y,
  highlightId,
  onRemove,
  onClose,
}: HighlightContextMenuProps) {
  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        className="fixed z-50 min-w-[160px] overflow-hidden rounded-lg border border-ivory-dark bg-white py-1 shadow-lg"
        style={{ left: x, top: y }}
        role="menu"
        aria-label="Highlight options"
      >
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-coral hover:bg-ivory transition-colors"
          onClick={() => {
            onRemove(highlightId);
            onClose();
          }}
        >
          Remove Highlight
        </button>
      </div>
    </>
  );
}
