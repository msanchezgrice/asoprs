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
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }

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
      className="fixed z-50 rounded-lg border border-ivory-dark bg-white py-1 shadow-lg"
      style={{ left: x, top: y }}
    >
      <button
        role="menuitem"
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-navy hover:bg-coral/5 hover:text-coral transition-colors"
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
