"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Library,
  List,
  MessageSquare,
  BarChart3,
  GitFork,
  Image,
  FileOutput,
} from "lucide-react";
import { AccountPanel } from "@/components/auth/account-panel";

const NAV_ITEMS = [
  { href: "/", label: "Library", icon: Library },
  { href: "/index", label: "Index", icon: List },
  { href: "/mindmap", label: "Mind Map", icon: GitFork },
  { href: "/study-resources", label: "Resources", icon: FileOutput },
  { href: "/flashcards/images", label: "Images", icon: Image },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/progress", label: "Progress", icon: BarChart3 },
];

const MIN_SIDEBAR = 200;
const MAX_SIDEBAR = 400;
const DEFAULT_SIDEBAR = 256;

export function BottomNav() {
  const pathname = usePathname();
  const [docCount, setDocCount] = useState<number | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_SIDEBAR;
    const saved = window.localStorage.getItem("sidebar-width");
    if (!saved) return DEFAULT_SIDEBAR;
    const parsed = Number.parseInt(saved, 10);
    return parsed >= MIN_SIDEBAR && parsed <= MAX_SIDEBAR
      ? parsed
      : DEFAULT_SIDEBAR;
  });
  const isDragging = useRef(false);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) => setDocCount(d.documents || 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--sidebar-width", `${sidebarWidth}px`);
  }, [sidebarWidth]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const w = Math.min(MAX_SIDEBAR, Math.max(MIN_SIDEBAR, ev.clientX));
      setSidebarWidth(w);
    };

    const onMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      localStorage.setItem("sidebar-width", String(sidebarWidth));
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [sidebarWidth]);

  return (
    <>
      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-ivory-dark bg-white/95 backdrop-blur-lg md:hidden pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around px-2 py-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/"
                ? pathname === "/"
                : pathname.startsWith(href.split("/").slice(0, 2).join("/"));
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center gap-0.5 px-3 py-2 text-[11px] font-medium transition-colors active:scale-95 ${
                  active
                    ? "text-coral"
                    : "text-warm-gray hover:text-navy"
                }`}
              >
                <Icon
                  size={22}
                  strokeWidth={active ? 2.5 : 1.8}
                />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Desktop sidebar */}
      <aside
        className="fixed left-0 top-0 z-50 hidden h-dvh flex-col border-r border-ivory-dark bg-white md:flex"
        style={{ width: sidebarWidth }}
      >
        <div className="px-6 py-6">
          <h1 className="text-2xl font-bold tracking-wide text-navy">
            ASOPRS
          </h1>
          <p className="mt-1 text-xs font-medium tracking-wide text-warm-gray uppercase">
            Board Review Portal
          </p>
        </div>

        <div className="h-px bg-ivory-dark" />

        <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/"
                ? pathname === "/"
                : pathname.startsWith(href.split("/").slice(0, 2).join("/"));
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                  active
                    ? "bg-coral/10 text-coral"
                    : "text-warm-gray hover:bg-ivory hover:text-navy"
                }`}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-ivory-dark px-6 py-4">
          <div className="mb-4 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-warm-gray">
              Workspace
            </p>
            <p className="mt-1 text-sm text-navy">
              {docCount !== null ? `${docCount} documents ready for review` : "Loading library…"}
            </p>
          </div>
          <AccountPanel />
        </div>

        {/* Resize handle */}
        <div
          onMouseDown={onMouseDown}
          className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-coral/20 active:bg-coral/30 transition-colors"
        />
      </aside>
    </>
  );
}
