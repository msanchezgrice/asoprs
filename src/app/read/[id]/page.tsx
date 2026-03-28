"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  Layers,
  ClipboardList,
  MessageSquare,
  Loader2,
  Send,
  ExternalLink,
  FileText,
  BookOpen,
  AlignLeft,
  Highlighter,
  Trash2,
} from "lucide-react";
import { CATEGORY_META, type Category } from "@/data/sample-documents";
import { use } from "react";
import { useAuthSession } from "@/hooks/use-auth-session";
import {
  type PdfHighlightRect,
  isPdfHighlightRectArray,
} from "@/components/pdf/highlight-types";

const PdfReader = dynamic(
  () => import("@/components/pdf/pdf-reader").then((mod) => mod.PdfReader),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 overflow-auto bg-ivory-dark/50 p-4 md:p-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          <div className="rounded-xl border border-ivory-dark bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800 shadow-sm">
            PDF highlights now save directly on the document.
          </div>
          <div className="flex items-center justify-center rounded-xl border border-ivory-dark bg-white p-12 shadow-sm">
            <Loader2 className="h-6 w-6 animate-spin text-coral" />
            <span className="ml-3 text-sm text-warm-gray">Loading PDF…</span>
          </div>
        </div>
      </div>
    ),
  }
);

interface DocChunk {
  id: string;
  chunk_index: number;
  content: string;
  page_start: number | null;
  page_end: number | null;
}

interface DocData {
  id: string;
  title: string;
  category: Category;
  page_count: number;
  storage_path: string | null;
  chunks: DocChunk[];
}

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  sources?: { title: string }[];
}

interface Highlight {
  id: string;
  document_id: string;
  page_number: number;
  color: string;
  text_content: string | null;
  rects:
    | { chunkIndex: number; startOffset: number; endOffset: number }
    | PdfHighlightRect[];
  created_at: string;
}

const HIGHLIGHT_COLORS = ["#FFEB3B", "#FF9800", "#4CAF50", "#2196F3", "#E91E63"];

function getPdfUrl(storagePath: string | null): string | null {
  if (!storagePath) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${base}/storage/v1/object/public/pdfs/${encodeURIComponent(storagePath).replace(/%2F/g, "/")}`;
}

function HighlightedText({
  content,
  chunkIndex,
  highlights,
}: {
  content: string;
  chunkIndex: number;
  highlights: Highlight[];
}) {
  const chunkHighlights = highlights
    .filter(
      (h): h is Highlight & { rects: { chunkIndex: number; startOffset: number; endOffset: number } } =>
        !isPdfHighlightRectArray(h.rects) && h.rects.chunkIndex === chunkIndex
    )
    .sort((a, b) => a.rects.startOffset - b.rects.startOffset);

  if (chunkHighlights.length === 0) {
    return <>{content}</>;
  }

  const parts: React.ReactNode[] = [];
  let lastEnd = 0;

  for (const hl of chunkHighlights) {
    const start = Math.max(hl.rects.startOffset, lastEnd);
    const end = Math.min(hl.rects.endOffset, content.length);
    if (start >= end) continue;

    if (start > lastEnd) {
      parts.push(content.slice(lastEnd, start));
    }
    parts.push(
      <mark
        key={hl.id}
        style={{ backgroundColor: hl.color + "66", borderRadius: "2px" }}
        title="Highlighted"
      >
        {content.slice(start, end)}
      </mark>
    );
    lastEnd = end;
  }

  if (lastEnd < content.length) {
    parts.push(content.slice(lastEnd));
  }

  return <>{parts}</>;
}

function formatTextContent(
  raw: string,
  chunkIndex: number,
  highlights: Highlight[]
): React.ReactNode[] {
  const cleaned = raw
    .replace(/\r\n/g, "\n")
    .replace(/Page \d+ of \d+/gi, "")
    .replace(/ASOPRS Education Center/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const blocks = cleaned.split(/\n\n+/);
  const elements: React.ReactNode[] = [];

  let charOffset = 0;
  const rawCleaned = cleaned;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i].trim();
    if (!block || block.length < 3) continue;

    const blockStart = rawCleaned.indexOf(block, charOffset);
    charOffset = blockStart + block.length;

    const isHeading =
      (block.length < 80 && !block.endsWith(".") && !block.endsWith(",") && /^[A-Z]/.test(block)) ||
      /^(Introduction|Etiology|Epidemiology|Clinical [Ff]eatures|Diagnosis|Differential|Management|Treatment|Surgical|Prognosis|Complications|References|Summary|Pathogenesis|Histopathology|Classification|Anatomy|Evaluation|Imaging|Indications|Technique|Outcomes|Follow-up|Prevention|Workup)/i.test(block);

    const isBullet = /^[•\-–\*]|\d+[.)]\s/.test(block);

    if (isHeading) {
      elements.push(
        <h3 key={i} className="mt-6 mb-2 font-[DM_Serif_Display] text-lg text-navy first:mt-0">
          {block}
        </h3>
      );
    } else if (isBullet) {
      const items = block.split(/\n/).filter(Boolean);
      elements.push(
        <ul key={i} className="mb-3 ml-4 list-disc space-y-1 text-navy/80">
          {items.map((item, j) => (
            <li key={j} className="pl-1">
              {item.replace(/^[•\-–\*]\s*|\d+[.)]\s*/, "")}
            </li>
          ))}
        </ul>
      );
    } else {
      elements.push(
        <p key={i} className="mb-3 text-navy/85 leading-[1.85]" data-chunk={chunkIndex} data-offset={blockStart}>
          <HighlightedText content={block} chunkIndex={chunkIndex} highlights={highlights} />
        </p>
      );
    }
  }

  return elements;
}

export default function ReaderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { user } = useAuthSession();
  const [doc, setDoc] = useState<DocData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [viewMode, setViewMode] = useState<"pdf" | "text">("pdf");
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [highlightColor, setHighlightColor] = useState(HIGHLIGHT_COLORS[0]);
  const [highlightMode, setHighlightMode] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const [chatPanelWidth, setChatPanelWidth] = useState(384);
  const chatDragging = useRef(false);

  useEffect(() => {
    fetch(`/api/documents/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setDoc(data);
        if (!data.storage_path) setViewMode("text");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!user) {
      setHighlights([]);
      return;
    }

    fetch(`/api/highlights?docId=${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setHighlights(data);
      })
      .catch(() => {});
  }, [id, user?.id]);

  const saveHighlight = useCallback(
    async (chunkIndex: number, startOffset: number, endOffset: number, text: string) => {
      if (!user) {
        setSaveNotice("Sign in to save highlights to your account.");
        return;
      }

      const res = await fetch("/api/highlights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_id: id,
          page_number: chunkIndex,
          color: highlightColor,
          text_content: text,
          rects: { chunkIndex, startOffset, endOffset },
        }),
      });
      if (res.status === 401) {
        setSaveNotice("Sign in to save highlights to your account.");
        return;
      }
      const hl = await res.json();
      if (hl.id) {
        setHighlights((prev) => [...prev, hl]);
      }
    },
    [id, highlightColor, user]
  );

  const savePdfHighlight = useCallback(
    async (pageNumber: number, text: string, rects: PdfHighlightRect[]) => {
      if (!user) {
        setSaveNotice("Sign in to save highlights to your account.");
        return;
      }

      const res = await fetch("/api/highlights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_id: id,
          page_number: pageNumber,
          color: highlightColor,
          text_content: text,
          rects,
        }),
      });

      if (res.status === 401) {
        setSaveNotice("Sign in to save highlights to your account.");
        return;
      }

      const highlight = await res.json();
      if (highlight.id) {
        setHighlights((prev) => [...prev, highlight]);
      }
    },
    [highlightColor, id, user]
  );

  const deleteHighlight = useCallback(async (hlId: string) => {
    if (!user) {
      setSaveNotice("Sign in to manage saved highlights.");
      return;
    }
    await fetch(`/api/highlights?id=${hlId}`, { method: "DELETE" });
    setHighlights((prev) => prev.filter((h) => h.id !== hlId));
  }, [user]);

  const handleTextSelection = useCallback(() => {
    if (!highlightMode || !contentRef.current) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    const container = range.startContainer.parentElement?.closest("[data-chunk]");
    if (!container) return;

    const chunkIndex = parseInt(container.getAttribute("data-chunk") || "0", 10);
    const baseOffset = parseInt(container.getAttribute("data-offset") || "0", 10);

    const fullText = container.textContent || "";
    const selectedText = selection.toString();
    if (!selectedText.trim()) return;

    const startInNode = fullText.indexOf(selectedText);
    if (startInNode < 0) return;

    const startOffset = baseOffset + startInNode;
    const endOffset = startOffset + selectedText.length;

    saveHighlight(chunkIndex, startOffset, endOffset, selectedText);
    selection.removeAllRanges();
  }, [highlightMode, saveHighlight]);

  useEffect(() => {
    document.addEventListener("mouseup", handleTextSelection);
    return () => document.removeEventListener("mouseup", handleTextSelection);
  }, [handleTextSelection]);

  const onChatResizeDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    chatDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
      if (!chatDragging.current) return;
      const w = Math.min(600, Math.max(280, window.innerWidth - ev.clientX));
      setChatPanelWidth(w);
    };
    const onUp = () => {
      chatDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  const handleChat = async (msg?: string) => {
    const message = msg || chatInput;
    if (!message.trim() || chatLoading) return;
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", content: message }]);
    setChatLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, documentId: id }),
      });
      const data = await res.json();
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.answer || "Sorry, couldn't generate a response.",
          sources: data.sources,
        },
      ]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "An error occurred. Please try again." },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  if (loading || !doc) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-coral" />
        <span className="ml-3 text-warm-gray">Loading document...</span>
      </div>
    );
  }

  const cat = CATEGORY_META[doc.category] || CATEGORY_META["Orbit"];
  const chunks = doc.chunks || [];
  const pdfSrc = getPdfUrl(doc.storage_path);

  return (
    <div className="flex h-dvh flex-col md:h-screen">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-ivory-dark bg-white px-4 py-3 md:px-6">
        <Link
          href="/"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-warm-gray hover:bg-ivory hover:text-navy transition-colors"
        >
          <ArrowLeft size={20} />
        </Link>

        <div className="min-w-0 flex-1">
          <h1 className="truncate font-[DM_Serif_Display] text-lg text-navy">
            {doc.title}
          </h1>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${cat.bg} ${cat.color}`}
            >
              {doc.category}
            </span>
            <span className="text-xs text-warm-gray">
              {doc.page_count} pages
            </span>
          </div>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <Link
            href={`/flashcards/${doc.id}`}
            className="flex items-center gap-1.5 rounded-lg bg-coral/10 px-3 py-2 text-xs font-semibold text-coral transition-colors hover:bg-coral/20"
          >
            <Layers size={14} /> Flashcards
          </Link>
          <Link
            href={`/quiz/${doc.id}`}
            className="flex items-center gap-1.5 rounded-lg bg-navy/5 px-3 py-2 text-xs font-semibold text-navy transition-colors hover:bg-navy/10"
          >
            <ClipboardList size={14} /> Quiz
          </Link>
          {pdfSrc && (
            <a
              href={pdfSrc}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100"
            >
              <ExternalLink size={14} /> Open PDF
            </a>
          )}
          <button
            onClick={() => setShowAiPanel(!showAiPanel)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
              showAiPanel
                ? "bg-sage/15 text-sage-dark"
                : "bg-ivory text-warm-gray hover:text-navy"
            }`}
          >
            <MessageSquare size={14} /> AI Chat
          </button>
        </div>
      </header>

      {/* View mode toggle + highlight tools */}
      <div className="flex items-center justify-center gap-2 border-b border-ivory-dark bg-white px-4 py-2">
        {pdfSrc && (
          <button
            onClick={() => setViewMode("pdf")}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium transition-all ${
              viewMode === "pdf"
                ? "bg-navy text-white"
                : "bg-ivory text-warm-gray hover:bg-ivory-dark"
            }`}
          >
            <FileText size={13} /> PDF View
          </button>
        )}
        <button
          onClick={() => setViewMode("text")}
          className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium transition-all ${
            viewMode === "text"
              ? "bg-navy text-white"
              : "bg-ivory text-warm-gray hover:bg-ivory-dark"
          }`}
        >
          <AlignLeft size={13} /> Text View
        </button>

        <div className="mx-2 h-5 w-px bg-ivory-dark" />

        <button
          onClick={() => {
            if (!user) {
              setSaveNotice("Sign in before highlighting. Anonymous highlights are not saved to your account.");
              return;
            }

            setSaveNotice(null);
            setHighlightMode(!highlightMode);
          }}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
            highlightMode
              ? "bg-yellow-100 text-yellow-800 ring-1 ring-yellow-300"
              : "bg-ivory text-warm-gray hover:bg-ivory-dark"
          }`}
          title={highlightMode ? "Disable highlighting" : "Enable highlighting (Text View)"}
        >
          <Highlighter size={13} /> Highlight
        </button>

        {highlightMode && (
          <div className="flex items-center gap-1">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setHighlightColor(c)}
                className={`h-5 w-5 rounded-full border-2 transition-all ${
                  highlightColor === c ? "border-navy scale-110" : "border-transparent"
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        )}

        {highlights.length > 0 && (
          <span className="ml-1 rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-semibold text-yellow-800">
            {highlights.length}
          </span>
        )}
      </div>

      {saveNotice && (
        <div className="border-b border-ivory-dark bg-amber-50 px-4 py-2 text-xs font-medium text-amber-800">
          {saveNotice}
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col min-w-0">
          {viewMode === "pdf" && pdfSrc ? (
            <PdfReader
              url={pdfSrc}
              highlights={highlights
                .filter(
                  (highlight): highlight is Highlight & { rects: PdfHighlightRect[] } =>
                    isPdfHighlightRectArray(highlight.rects)
                )
                .map((highlight) => ({
                  id: highlight.id,
                  page_number: highlight.page_number,
                  color: highlight.color,
                  text_content: highlight.text_content,
                  rects: highlight.rects,
                }))}
              highlightMode={highlightMode}
              onSaveHighlight={savePdfHighlight}
            />
          ) : (
            <div className="flex-1 overflow-auto bg-ivory-dark/50 p-4 md:p-8" ref={contentRef}>
              <div className={`mx-auto max-w-3xl space-y-6 ${highlightMode ? "cursor-text select-text" : ""}`}>
                {/* Document title card */}
                <div className="rounded-xl border border-ivory-dark bg-white p-6 shadow-sm">
                  <h2 className="font-[DM_Serif_Display] text-2xl text-navy">
                    {doc.title}
                  </h2>
                  <div className="mt-2 flex items-center gap-3 text-sm text-warm-gray">
                    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${cat.bg} ${cat.color}`}>
                      {doc.category}
                    </span>
                    <span>{doc.page_count} pages</span>
                    <span>{chunks.length} sections</span>
                  </div>
                  {pdfSrc && (
                    <a
                      href={pdfSrc}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                    >
                      <ExternalLink size={13} /> View original PDF with images &amp; figures
                    </a>
                  )}
                </div>

                {/* Highlights summary */}
                {highlights.length > 0 && (
                  <div className="rounded-xl border border-yellow-200 bg-yellow-50/50 p-4 shadow-sm">
                    <div className="mb-2 flex items-center gap-2">
                      <Highlighter size={14} className="text-yellow-700" />
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-yellow-800">
                        Your Highlights ({highlights.length})
                      </h3>
                    </div>
                    <div className="space-y-2 max-h-48 overflow-auto">
                      {highlights.map((hl) => (
                        <div
                          key={hl.id}
                          className="flex items-start gap-2 rounded-lg bg-white px-3 py-2 border border-yellow-100"
                        >
                          <div
                            className="mt-1 h-3 w-3 shrink-0 rounded-full"
                            style={{ backgroundColor: hl.color }}
                          />
                          <p className="flex-1 text-xs text-navy/80 line-clamp-2">
                            {hl.text_content || "Highlight"}
                          </p>
                          <button
                            onClick={() => deleteHighlight(hl.id)}
                            className="shrink-0 rounded p-1 text-warm-gray hover:text-coral transition-colors"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Formatted text sections */}
                {chunks.map((chunk, i) => (
                  <section
                    key={chunk.id}
                    className="rounded-xl border border-ivory-dark bg-white p-6 shadow-sm"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-coral/10 text-[11px] font-bold text-coral">
                          {i + 1}
                        </span>
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-warm-gray">
                          Section {i + 1}
                        </span>
                      </div>
                      {chunk.page_start && (
                        <span className="rounded bg-ivory px-2 py-0.5 text-[10px] font-medium text-warm-gray">
                          Pages {chunk.page_start}
                          {chunk.page_end && chunk.page_end !== chunk.page_start
                            ? `–${chunk.page_end}`
                            : ""}
                        </span>
                      )}
                    </div>
                    <div className="text-sm leading-[1.8]">
                      {formatTextContent(chunk.content, i, highlights)}
                    </div>
                  </section>
                ))}

                {chunks.length === 0 && (
                  <div className="rounded-xl border border-ivory-dark bg-white p-8 text-center shadow-sm">
                    <BookOpen size={32} className="mx-auto text-warm-gray" />
                    <p className="mt-3 text-sm text-warm-gray">
                      No text content available.
                    </p>
                    {pdfSrc && (
                      <a
                        href={pdfSrc}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-coral hover:text-coral-dark"
                      >
                        <ExternalLink size={14} /> Open the original PDF instead
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* AI Chat panel — full-screen overlay on mobile, resizable sidebar on desktop */}
        {showAiPanel && (
          <div
            className="fixed inset-0 z-50 flex flex-col bg-white animate-scale-in md:static md:inset-auto md:z-auto md:border-l md:border-ivory-dark"
            style={{ width: typeof window !== "undefined" && window.innerWidth >= 768 ? chatPanelWidth : undefined }}
          >
            {/* Resize handle (desktop only) */}
            <div
              onMouseDown={onChatResizeDown}
              className="absolute left-0 top-0 hidden h-full w-1 cursor-col-resize hover:bg-coral/20 active:bg-coral/30 transition-colors md:block"
            />

            <div className="flex items-center justify-between border-b border-ivory-dark px-4 py-3">
              <div>
                <h2 className="font-[DM_Serif_Display] text-base text-navy">
                  AI Assistant
                </h2>
                <p className="text-[11px] text-warm-gray line-clamp-1">
                  Ask questions about {doc.title}
                </p>
              </div>
              <button
                onClick={() => setShowAiPanel(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-warm-gray hover:bg-ivory hover:text-navy"
              >
                <ArrowLeft size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4">
              <div className="space-y-4">
                {chatMessages.length === 0 && (
                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-warm-gray">
                      Suggested Questions
                    </p>
                    <div className="space-y-2">
                      {[
                        "Summarize the key points",
                        "What are the diagnostic criteria?",
                        "Explain the surgical approach",
                        "What are common complications?",
                      ].map((q) => (
                        <button
                          key={q}
                          onClick={() => handleChat(q)}
                          className="w-full rounded-lg border border-ivory-dark px-3 py-2.5 text-left text-xs text-navy transition-all hover:border-coral/30 hover:bg-coral/5 active:scale-[0.98]"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {chatMessages.map((m, i) => (
                  <div
                    key={i}
                    className={`rounded-lg px-3 py-2.5 ${
                      m.role === "user"
                        ? "bg-ivory/70"
                        : "border border-sage/20 bg-sage/5"
                    }`}
                  >
                    <p
                      className={`text-xs leading-relaxed text-navy ${
                        m.role === "user" ? "font-medium" : ""
                      }`}
                    >
                      {m.content}
                    </p>
                    {m.sources && m.sources.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {m.sources.map((s, j) => (
                          <span
                            key={j}
                            className="rounded bg-ivory px-1.5 py-0.5 text-[10px] text-warm-gray"
                          >
                            {s.title}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {chatLoading && (
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    <Loader2 className="h-4 w-4 animate-spin text-sage" />
                    <span className="text-xs text-warm-gray">Thinking...</span>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-ivory-dark p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleChat();
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask about this document..."
                  className="flex-1 rounded-lg border border-ivory-dark bg-ivory/50 px-3 py-2.5 text-sm text-navy placeholder:text-warm-gray-light focus:border-coral focus:outline-none focus:ring-1 focus:ring-coral/20 md:text-xs md:py-2"
                />
                <button
                  type="submit"
                  disabled={chatLoading}
                  className="rounded-lg bg-coral p-2.5 text-white transition-colors hover:bg-coral-dark disabled:opacity-50 md:p-2"
                >
                  <Send size={16} className="md:hidden" />
                  <Send size={14} className="hidden md:block" />
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Mobile bottom bar */}
      <div className="flex items-center justify-around border-t border-ivory-dark bg-white px-2 py-2 md:hidden">
        {pdfSrc && (
          <a
            href={pdfSrc}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] font-medium text-amber-700"
          >
            <ExternalLink size={20} />
            PDF
          </a>
        )}
        <Link
          href={`/flashcards/${doc.id}`}
          className="flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] font-medium text-coral"
        >
          <Layers size={20} />
          Cards
        </Link>
        <Link
          href={`/quiz/${doc.id}`}
          className="flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] font-medium text-navy"
        >
          <ClipboardList size={20} />
          Quiz
        </Link>
        <button
          onClick={() => setShowAiPanel(!showAiPanel)}
          className="flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] font-medium text-sage-dark"
        >
          <MessageSquare size={20} />
          Chat
        </button>
      </div>
    </div>
  );
}
