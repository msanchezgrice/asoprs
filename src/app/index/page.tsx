"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  FileText,
  ExternalLink,
  Layers,
  ClipboardList,
  ChevronDown,
  ChevronRight,
  Search,
  Loader2,
  BookOpen,
} from "lucide-react";
import { CATEGORY_META, type Category } from "@/data/sample-documents";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

interface Doc {
  id: string;
  title: string;
  category: Category;
  page_count: number;
  storage_path: string | null;
  flashcard_count: number;
  mcq_count: number;
}

function pdfUrl(storagePath: string | null): string | null {
  if (!storagePath) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/pdfs/${encodeURIComponent(storagePath).replace(/%2F/g, "/")}`;
}

export default function IndexPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode] = useState<"category" | "alpha">("category");

  useEffect(() => {
    fetch("/api/documents/all")
      .then((r) => r.json())
      .then((data) => {
        setDocs(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!search) return docs;
    const q = search.toLowerCase();
    return docs.filter((d) => d.title.toLowerCase().includes(q));
  }, [docs, search]);

  const grouped = useMemo(() => {
    const groups: Record<string, Doc[]> = {};
    if (viewMode === "category") {
      for (const d of filtered) {
        (groups[d.category] ??= []).push(d);
      }
      for (const cat of Object.keys(groups)) {
        groups[cat].sort((a, b) => a.title.localeCompare(b.title));
      }
    } else {
      const letter = (d: Doc) => d.title[0]?.toUpperCase() || "#";
      for (const d of filtered) {
        (groups[letter(d)] ??= []).push(d);
      }
      for (const k of Object.keys(groups)) {
        groups[k].sort((a, b) => a.title.localeCompare(b.title));
      }
    }
    return groups;
  }, [filtered, viewMode]);

  const sortedKeys = useMemo(() => {
    if (viewMode === "category") {
      const order: Category[] = [
        "Orbit",
        "Eyelid-Eyebrow",
        "Skin Conditions",
        "Face",
        "Lacrimal",
        "Other",
      ];
      return order.filter((c) => grouped[c]?.length);
    }
    return Object.keys(grouped).sort();
  }, [grouped, viewMode]);

  const toggle = (key: string) =>
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-coral" />
        <span className="ml-3 text-warm-gray">Loading document index...</span>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
      <header className="mb-8">
        <h1 className="font-[DM_Serif_Display] text-3xl text-navy md:text-4xl">
          Document Index
        </h1>
        <p className="mt-2 text-sm text-warm-gray">
          {docs.length} ASOPRS study documents &middot; Open original PDFs, flashcards, or quizzes
        </p>
      </header>

      {/* Controls */}
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-gray"
          />
          <input
            type="text"
            placeholder="Filter documents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-ivory-dark bg-white py-2.5 pl-10 pr-4 text-sm text-navy placeholder:text-warm-gray-light focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/20"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode("category")}
            className={`rounded-full px-4 py-1.5 text-xs font-medium transition-all ${
              viewMode === "category"
                ? "bg-navy text-white"
                : "bg-ivory text-warm-gray hover:bg-ivory-dark"
            }`}
          >
            By Category
          </button>
          <button
            onClick={() => setViewMode("alpha")}
            className={`rounded-full px-4 py-1.5 text-xs font-medium transition-all ${
              viewMode === "alpha"
                ? "bg-navy text-white"
                : "bg-ivory text-warm-gray hover:bg-ivory-dark"
            }`}
          >
            A-Z
          </button>
        </div>
      </div>

      {/* Document groups */}
      <div className="space-y-6">
        {sortedKeys.map((key) => {
          const items = grouped[key];
          const isCollapsed = collapsed[key];
          const meta =
            viewMode === "category"
              ? CATEGORY_META[key as Category]
              : null;

          return (
            <section key={key}>
              <button
                onClick={() => toggle(key)}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-ivory/50"
              >
                {isCollapsed ? (
                  <ChevronRight size={18} className="text-warm-gray shrink-0" />
                ) : (
                  <ChevronDown size={18} className="text-warm-gray shrink-0" />
                )}
                <div className="flex items-center gap-2">
                  {meta && (
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-semibold ${meta.bg} ${meta.color}`}
                    >
                      {meta.icon} {key}
                    </span>
                  )}
                  {!meta && (
                    <span className="text-sm font-bold text-navy">{key}</span>
                  )}
                  <span className="rounded-full bg-ivory px-2 py-0.5 text-[10px] font-semibold text-warm-gray">
                    {items.length}
                  </span>
                </div>
              </button>

              {!isCollapsed && (
                <div className="mt-1 ml-3 border-l-2 border-ivory-dark pl-4">
                  {items.map((doc) => {
                    const pdf = pdfUrl(doc.storage_path);
                    return (
                      <div
                        key={doc.id}
                        className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all hover:bg-ivory/50"
                      >
                        <FileText
                          size={16}
                          className="shrink-0 text-warm-gray group-hover:text-navy"
                        />
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/read/${doc.id}`}
                            className="block truncate text-sm font-medium text-navy hover:text-coral"
                          >
                            {doc.title}
                          </Link>
                          <p className="text-[11px] text-warm-gray">
                            {doc.page_count} pages
                          </p>
                        </div>

                        <div className="hidden items-center gap-1.5 sm:flex">
                          {pdf && (
                            <a
                              href={pdf}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 rounded-md bg-navy/5 px-2 py-1 text-[11px] font-medium text-navy transition-colors hover:bg-navy/10"
                              title="Open original PDF"
                            >
                              <ExternalLink size={12} /> PDF
                            </a>
                          )}
                          <Link
                            href={`/read/${doc.id}`}
                            className="flex items-center gap-1 rounded-md bg-ivory px-2 py-1 text-[11px] font-medium text-warm-gray transition-colors hover:bg-ivory-dark hover:text-navy"
                          >
                            <BookOpen size={12} /> Read
                          </Link>
                          <Link
                            href={`/flashcards/${doc.id}`}
                            className="flex items-center gap-1 rounded-md bg-coral/10 px-2 py-1 text-[11px] font-medium text-coral transition-colors hover:bg-coral/20"
                          >
                            <Layers size={12} /> Cards
                          </Link>
                          <Link
                            href={`/quiz/${doc.id}`}
                            className="flex items-center gap-1 rounded-md bg-sage/10 px-2 py-1 text-[11px] font-medium text-sage-dark transition-colors hover:bg-sage/20"
                          >
                            <ClipboardList size={12} /> Quiz
                          </Link>
                        </div>

                        {/* Mobile: just PDF + Read links */}
                        <div className="flex items-center gap-1.5 sm:hidden">
                          {pdf && (
                            <a
                              href={pdf}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-md bg-navy/5 p-1.5 text-navy"
                            >
                              <ExternalLink size={14} />
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="py-20 text-center">
          <p className="font-[DM_Serif_Display] text-xl text-warm-gray">
            No documents match &ldquo;{search}&rdquo;
          </p>
        </div>
      )}
    </div>
  );
}
