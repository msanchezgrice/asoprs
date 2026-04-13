"use client";

import { useEffect, useRef } from "react";

interface HighlightContextMenuProps {
  x: number;
  y: number;
  onRemove: () => void;
  onClose: () => void;
}

export function HighlightContextMenu({
  x,
  y,
  onRemove,
  onClose,
}: HighlightContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      role="menu"
      data-testid="highlight-context-menu"
      style={{ position: "fixed", top: y, left: x, zIndex: 9999 }}
      className="min-w-[160px] rounded-lg border border-ivory-dark bg-white py-1 shadow-lg"
    >
      <button
        role="menuitem"
        type="button"
        className="w-full px-4 py-2 text-left text-sm text-coral transition-colors hover:bg-coral/5"
        onClick={() => {
          onRemove();
          onClose();
        }}
      >
        Remove Highlight
      </button>
    </div>
  );
}
