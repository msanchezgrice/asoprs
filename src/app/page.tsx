"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  Filter,
  BookOpen,
  Layers,
  ClipboardList,
  ExternalLink,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import {
  CATEGORY_META,
  type Category,
  type Document,
} from "@/data/sample-documents";
import { useAuthSession } from "@/hooks/use-auth-session";
import {
  getAsoprsSortIndex,
  LIBRARY_PREFS_KEY,
  type LayoutMode,
  type SortMode,
} from "@/lib/library-order";

const ALL_CATEGORIES: (Category | "All")[] = [
  "All",
  "Orbit",
  "Eyelid-Eyebrow",
  "Skin Conditions",
  "Face",
  "Lacrimal",
  "Other",
];

function getPdfUrl(storagePath: string | null | undefined): string | null {
  if (!storagePath) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/pdfs/${encodeURIComponent(storagePath).replace(/%2F/g, "/")}`;
}

function DocumentCard({
  doc,
  index,
}: {
  doc: Document;
  index: number;
}) {
  const cat = CATEGORY_META[doc.category];
  const pdfLink = getPdfUrl(doc.storagePath);

  return (
    <div
      className={`animate-fade-in-up stagger-${(index % 8) + 1} group relative flex flex-col rounded-xl border border-ivory-dark bg-white p-4 shadow-sm transition-all hover:border-coral/30 hover:shadow-md md:p-5`}
    >
      <div className="flex items-start justify-between">
        <span
          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${cat.bg} ${cat.color}`}
        >
          {doc.category}
        </span>
        {pdfLink && (
          <a
            href={pdfLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700 transition-colors hover:bg-amber-100"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink size={11} /> PDF
          </a>
        )}
      </div>

      <Link href={`/read/${doc.id}`}>
        <h3 className="mt-3 font-[DM_Serif_Display] text-lg leading-snug text-navy group-hover:text-coral-dark md:text-xl cursor-pointer">
          {doc.title}
        </h3>
      </Link>

      <div className="mt-auto pt-4">
        <div className="flex items-center gap-4 text-xs text-warm-gray">
          <span className="flex items-center gap-1">
            <BookOpen size={13} /> {doc.pageCount} pages
          </span>
          <span className="flex items-center gap-1">
            <Layers size={13} /> {doc.flashcardCount} cards
          </span>
          <span className="flex items-center gap-1">
            <ClipboardList size={13} /> {doc.mcqCount} MCQs
          </span>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Link
            href={`/read/${doc.id}`}
            className="rounded-md bg-ivory px-3 py-1.5 text-[11px] font-semibold text-navy transition-colors hover:bg-ivory-dark active:scale-95"
          >
            Read
          </Link>
          <Link
            href={`/flashcards/${doc.id}`}
            className="rounded-md bg-coral/10 px-3 py-1.5 text-[11px] font-semibold text-coral transition-colors hover:bg-coral/20 active:scale-95"
          >
            Cards
          </Link>
          <Link
            href={`/quiz/${doc.id}`}
            className="rounded-md bg-sage/10 px-3 py-1.5 text-[11px] font-semibold text-sage-dark transition-colors hover:bg-sage/20 active:scale-95"
          >
            Quiz
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LibraryPage() {
  const router = useRouter();
  const { user } = useAuthSession();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<Category | "All">("All");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "not_started" | "in_progress" | "reviewed"
  >("all");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchResults, setSearchResults] = useState<string[] | null>(null);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => {
    if (typeof window === "undefined") return "grouped";
    try {
      const raw = window.localStorage.getItem(LIBRARY_PREFS_KEY);
      if (!raw) return "grouped";
      const parsed = JSON.parse(raw) as Partial<{ layoutMode: LayoutMode }>;
      return parsed.layoutMode === "dense" ? "dense" : "grouped";
    } catch {
      return "grouped";
    }
  });
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    if (typeof window === "undefined") return "title";
    try {
      const raw = window.localStorage.getItem(LIBRARY_PREFS_KEY);
      if (!raw) return "title";
      const parsed = JSON.parse(raw) as Partial<{ sortMode: SortMode }>;
      if (
        parsed.sortMode === "title" ||
        parsed.sortMode === "category" ||
        parsed.sortMode === "pages" ||
        parsed.sortMode === "asoprs"
      ) {
        return parsed.sortMode;
      }
      return "title";
    } catch {
      return "title";
    }
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    if (!code) {
      return;
    }

    params.delete("code");
    params.delete("next");

    const nextPath = params.size > 0 ? `/?${params.toString()}` : "/";
    router.replace(
      `/auth/callback?code=${encodeURIComponent(code)}&next=${encodeURIComponent(nextPath)}`
    );
  }, [router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      LIBRARY_PREFS_KEY,
      JSON.stringify({ layoutMode, sortMode })
    );
  }, [layoutMode, sortMode]);

  useEffect(() => {
    fetch("/api/documents")
      .then((r) => r.json())
      .then((data) => {
        const docs: Document[] = data.map((d: Record<string, unknown>) => ({
          id: d.id as string,
          title: d.title as string,
          category: d.category as Category,
          pageCount: (d.page_count as number) || 0,
          flashcardCount: (d.flashcard_count as number) || 0,
          mcqCount: (d.mcq_count as number) || 0,
          status: (d.status as Document["status"]) || "not_started",
          progress: (d.progress as number) || 0,
          storagePath: (d.storage_path as string) || null,
        }));
        setDocuments(docs);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!search || search.length < 3) {
      return;
    }
    const timer = setTimeout(() => {
      fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: search, limit: 20 }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) {
            const docIds = [...new Set(data.map((d: { document_id: string }) => d.document_id))];
            setSearchResults(docIds as string[]);
          }
        })
        .catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const allDocs = documents;
  const effectiveSearchResults =
    search && search.length >= 3 ? searchResults : null;

  const filtered = allDocs.filter((doc) => {
    if (activeCategory !== "All" && doc.category !== activeCategory) return false;
    if (statusFilter !== "all" && doc.status !== statusFilter) return false;
    if (effectiveSearchResults) return effectiveSearchResults.includes(doc.id);
    if (search && !doc.title.toLowerCase().includes(search.toLowerCase()))
      return false;
    return true;
  });

  const denseDocs = [...filtered].sort((a, b) => {
    if (sortMode === "asoprs") {
      const aIndex = getAsoprsSortIndex(a.title);
      const bIndex = getAsoprsSortIndex(b.title);
      if (aIndex !== bIndex) return aIndex - bIndex;
      return a.title.localeCompare(b.title);
    }

    if (sortMode === "category") {
      const categoryCmp = a.category.localeCompare(b.category);
      if (categoryCmp !== 0) return categoryCmp;
      return a.title.localeCompare(b.title);
    }

    if (sortMode === "pages") {
      if (b.pageCount !== a.pageCount) return b.pageCount - a.pageCount;
      return a.title.localeCompare(b.title);
    }

    return a.title.localeCompare(b.title);
  });

  const totalCards = allDocs.reduce((s, d) => s + d.flashcardCount, 0);
  const totalMcqs = allDocs.reduce((s, d) => s + d.mcqCount, 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10">
      <section className="mb-8 overflow-hidden rounded-[2rem] border border-ivory-dark bg-[linear-gradient(135deg,rgba(11,20,38,0.98),rgba(19,32,64,0.92))] px-5 py-6 text-white shadow-xl shadow-navy/8 md:px-8 md:py-8">
        <div className="grid gap-6 md:grid-cols-[1.2fr_0.8fr] md:items-end">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/75">
              <Sparkles size={13} />
              {user ? "Signed in" : "Study portal"}
            </div>
            <h1 className="mt-4 max-w-2xl font-[DM_Serif_Display] text-3xl leading-tight md:text-5xl">
              {user
                ? "Welcome back. Your review queue is now tied to your account."
                : "Turn the ASOPRS library into a real study app with saved progress."}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-7 text-white/72">
              {user
                ? "Your flashcard outcomes, quiz history, and highlights can persist across sessions and devices."
                : "Sign in to save spaced repetition progress, keep highlights, and track board prep by topic instead of using a shared anonymous session."}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1">
            <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
              <p className="text-sm font-semibold text-white">Library size</p>
              <p className="mt-2 text-2xl font-bold text-white">{documents.length}</p>
              <p className="mt-1 text-xs text-white/65">documents currently loaded</p>
            </div>
            <Link
              href={user ? "/progress" : "/sign-in"}
              className="inline-flex items-center justify-between rounded-2xl bg-white px-4 py-4 text-sm font-semibold text-navy transition-transform hover:translate-x-0.5"
            >
              <span>{user ? "Open your progress" : "Sign in to save progress"}</span>
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* Header */}
      <header className="mb-8">
        <h1 className="font-[DM_Serif_Display] text-3xl text-navy md:text-4xl">
          Document Library
        </h1>
        <p className="mt-2 text-sm text-warm-gray md:text-base">
          {allDocs.length} ASOPRS documents &middot; {totalCards} flashcards &middot;{" "}
          {totalMcqs.toLocaleString()} board-style questions
        </p>
      </header>

      {/* Stats strip */}
      <div className="mb-6 grid grid-cols-3 gap-3 md:grid-cols-6">
        {(Object.entries(CATEGORY_META) as [Category, typeof CATEGORY_META[Category]][]).map(
          ([cat, meta]) => {
            const catDocCount = allDocs.filter((d) => d.category === cat).length;
            return (
              <button
                key={cat}
                onClick={() =>
                  setActiveCategory(activeCategory === cat ? "All" : cat)
                }
                className={`flex flex-col items-center rounded-lg border px-3 py-3 text-center transition-all ${
                  activeCategory === cat
                    ? "border-coral bg-coral/5 shadow-sm"
                    : "border-ivory-dark bg-white hover:border-warm-gray-light"
                }`}
              >
                <span className="text-lg">{meta.icon}</span>
                <span className="mt-1 text-[11px] font-semibold text-navy leading-tight">
                  {cat}
                </span>
                <span className="text-[10px] text-warm-gray">
                  {catDocCount} docs
                </span>
              </button>
            );
          }
        )}
      </div>

      {/* Search + Filters */}
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-gray"
          />
          <input
            type="text"
            placeholder="Search documents... (e.g. 'ptosis', 'orbital fracture')"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-ivory-dark bg-white py-2.5 pl-10 pr-4 text-sm text-navy placeholder:text-warm-gray-light focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/20"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar">
          <Filter size={16} className="shrink-0 text-warm-gray" />
          {(["all", "not_started", "in_progress", "reviewed"] as const).map(
            (s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-all active:scale-95 ${
                  statusFilter === s
                    ? "bg-navy text-white"
                    : "bg-ivory text-warm-gray hover:bg-ivory-dark"
                }`}
              >
                {s === "all"
                  ? "All"
                  : s.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              </button>
            )
          )}
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setLayoutMode("grouped")}
            className={`rounded-full px-4 py-1.5 text-xs font-medium transition-all ${
              layoutMode === "grouped"
                ? "bg-navy text-white"
                : "bg-ivory text-warm-gray hover:bg-ivory-dark"
            }`}
          >
            Card Grid
          </button>
          <button
            onClick={() => setLayoutMode("dense")}
            className={`rounded-full px-4 py-1.5 text-xs font-medium transition-all ${
              layoutMode === "dense"
                ? "bg-navy text-white"
                : "bg-ivory text-warm-gray hover:bg-ivory-dark"
            }`}
          >
            Dense List
          </button>
        </div>

        {layoutMode === "dense" && (
          <label className="flex items-center gap-2 text-xs font-medium text-warm-gray">
            Sort
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="rounded-full border border-ivory-dark bg-white px-3 py-1.5 text-xs text-navy outline-none transition focus:border-coral"
            >
              <option value="title">Alphabetical</option>
              <option value="asoprs">ASOPRS Index</option>
              <option value="category">Category</option>
              <option value="pages">Longest First</option>
            </select>
          </label>
        )}
      </div>

      {/* Category pills (mobile horizontal scroll) */}
      <div className="mb-4 flex gap-2 overflow-x-auto hide-scrollbar md:hidden">
        {ALL_CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-all ${
              activeCategory === cat
                ? "bg-navy text-white"
                : "bg-white text-warm-gray border border-ivory-dark"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Results count */}
      <p className="mb-4 text-xs font-medium text-warm-gray">
        {loading ? "Loading..." : `Showing ${filtered.length} of ${allDocs.length} documents`}
        {searchResults && <span className="text-coral ml-2">(semantic search results)</span>}
      </p>

      {layoutMode === "dense" ? (
        <div className="overflow-hidden rounded-2xl border border-ivory-dark bg-white">
          {denseDocs.map((doc, index) => {
            const pdfLink = getPdfUrl(doc.storagePath);
            const cat = CATEGORY_META[doc.category];

            return (
              <div
                key={doc.id}
                className={`grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-2.5 ${
                  index !== denseDocs.length - 1 ? "border-b border-ivory-dark" : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/read/${doc.id}`}
                      className="truncate text-sm font-medium text-navy hover:text-coral"
                    >
                      {doc.title}
                    </Link>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${cat.bg} ${cat.color}`}
                    >
                      {doc.category}
                    </span>
                    <span className="text-[11px] text-warm-gray">{doc.pageCount} pages</span>
                    <span className="text-[11px] text-warm-gray">{doc.flashcardCount} cards</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {pdfLink && (
                    <a
                      href={pdfLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md bg-navy/5 px-2 py-1 text-[11px] font-medium text-navy transition-colors hover:bg-navy/10"
                    >
                      PDF
                    </a>
                  )}
                  <Link
                    href={`/read/${doc.id}`}
                    className="rounded-md bg-ivory px-2 py-1 text-[11px] font-medium text-warm-gray transition-colors hover:bg-ivory-dark hover:text-navy"
                  >
                    Read
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((doc, i) => (
            <DocumentCard key={doc.id} doc={doc} index={i} />
          ))}
        </div>
      )}

      {filtered.length === 0 && (
        <div className="py-20 text-center">
          <p className="font-[DM_Serif_Display] text-xl text-warm-gray">
            No documents match your filters
          </p>
          <button
            onClick={() => {
              setSearch("");
              setActiveCategory("All");
              setStatusFilter("all");
            }}
            className="mt-4 text-sm font-medium text-coral hover:text-coral-dark"
          >
            Clear all filters
          </button>
        </div>
      )}
    </div>
  );
}
