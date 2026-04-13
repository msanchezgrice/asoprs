"use client";

import { useEffect, useRef } from "react";
import { Trash2 } from "lucide-react";

interface HighlightContextMenuProps {
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
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Highlight options"
      data-testid="highlight-context-menu"
      className="fixed z-50 min-w-[160px] rounded-lg border border-ivory-dark bg-white py-1 shadow-lg"
      style={{ left: x, top: y }}
    >
      <button
        role="menuitem"
        type="button"
        className="flex w-full items-center gap-2 px-4 py-2 text-sm text-coral hover:bg-coral/5"
        onClick={() => {
          onRemove(highlightId);
          onClose();
        }}
      >
        <Trash2 size={14} />
        Remove Highlight
      </button>
    </div>
  );
}
