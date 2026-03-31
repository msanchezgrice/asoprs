"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft, ChevronLeft, ChevronRight, Image as ImageIcon, Loader2 } from "lucide-react";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ImageFlashcardPreview = dynamic(
  () =>
    import("@/components/flashcards/image-flashcard-preview").then(
      (mod) => mod.ImageFlashcardPreview
    ),
  { ssr: false }
);

type ImageFlashcard = {
  id: string;
  documentTitle: string;
  documentSlug: string;
  category: string;
  storagePath: string;
  figureLabel: string;
  pageNumber: number;
  caption: string;
  references: string[];
};

function pdfUrl(storagePath: string) {
  return `${SUPABASE_URL}/storage/v1/object/public/pdfs/${encodeURIComponent(storagePath).replace(/%2F/g, "/")}`;
}

export default function ImageFlashcardsPage() {
  const [cards, setCards] = useState<ImageFlashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState(() => {
    if (typeof window === "undefined") return "all";
    return new URLSearchParams(window.location.search).get("category") ?? "all";
  });
  const [docSlug, setDocSlug] = useState(() => {
    if (typeof window === "undefined") return "all";
    return new URLSearchParams(window.location.search).get("doc") ?? "all";
  });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [pageWidth, setPageWidth] = useState(560);

  useEffect(() => {
    if (!previewRef.current) return;
    const node = previewRef.current;
    const resize = () => {
      setPageWidth(Math.max(260, Math.min(560, node.clientWidth - 24)));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    fetch("/api/image-flashcards")
      .then((res) => res.json())
      .then((data) => {
        setCards(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const categories = useMemo(
    () => ["all", ...Array.from(new Set(cards.map((card) => card.category)))],
    [cards]
  );

  const docs = useMemo(() => {
    const scoped = category === "all" ? cards : cards.filter((card) => card.category === category);
    return [
      { value: "all", label: "All topics" },
      ...Array.from(
        new Map(scoped.map((card) => [card.documentSlug, card.documentTitle])).entries()
      ).map(([value, label]) => ({ value, label })),
    ];
  }, [cards, category]);

  const effectiveDocSlug =
    docSlug !== "all" && docs.some((doc) => doc.value === docSlug) ? docSlug : "all";

  const filteredCards = useMemo(() => {
    return cards.filter((card) => {
      if (category !== "all" && card.category !== category) return false;
      if (effectiveDocSlug !== "all" && card.documentSlug !== effectiveDocSlug) return false;
      return true;
    });
  }, [cards, category, effectiveDocSlug]);

  const safeIndex = filteredCards.length === 0 ? 0 : Math.min(currentIndex, filteredCards.length - 1);
  const card = filteredCards[safeIndex];

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-coral" />
        <span className="ml-3 text-warm-gray">Loading image flashcards...</span>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-4">
        <p className="font-[DM_Serif_Display] text-2xl text-navy">No image flashcards yet</p>
        <p className="mt-2 text-sm text-warm-gray">Run the image flashcard generator to populate this deck.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-ivory-dark bg-white px-4 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-warm-gray transition-colors hover:bg-ivory hover:text-navy"
            >
              <ArrowLeft size={20} />
            </Link>
            <div className="min-w-0">
              <h1 className="truncate font-[DM_Serif_Display] text-xl text-navy">
                Image Flashcards
              </h1>
              <p className="text-xs text-warm-gray">
                Figures and image references across the ASOPRS library
              </p>
            </div>
          </div>

          <Link
            href="/"
            className="hidden rounded-lg border border-ivory-dark px-3 py-2 text-xs font-medium text-warm-gray transition-colors hover:bg-ivory hover:text-navy md:inline-flex"
          >
            Back to Library
          </Link>
        </div>
      </header>

      <div className="border-b border-ivory-dark bg-white px-4 py-3">
        <div className="mx-auto grid max-w-6xl gap-3 md:grid-cols-2">
              <label className="text-xs font-medium text-warm-gray">
            Category
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setDocSlug("all");
                setCurrentIndex(0);
                setIsFlipped(false);
              }}
              className="mt-1 w-full rounded-xl border border-ivory-dark bg-ivory/30 px-3 py-2 text-sm text-navy outline-none transition focus:border-coral"
            >
              {categories.map((value) => (
                <option key={value} value={value}>
                  {value === "all" ? "All categories" : value}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-medium text-warm-gray">
            Topic
            <select
              value={effectiveDocSlug}
              onChange={(e) => {
                setDocSlug(e.target.value);
                setCurrentIndex(0);
                setIsFlipped(false);
              }}
              className="mt-1 w-full rounded-xl border border-ivory-dark bg-ivory/30 px-3 py-2 text-sm text-navy outline-none transition focus:border-coral"
            >
              {docs.map((doc) => (
                <option key={doc.value} value={doc.value}>
                  {doc.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {filteredCards.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4">
          <p className="text-sm text-warm-gray">No image flashcards match the current filters.</p>
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-5">
          <div className="mb-3 flex items-center justify-between text-sm text-warm-gray">
            <span>
              {safeIndex + 1} / {filteredCards.length}
            </span>
            <span>{card.category}</span>
          </div>

          <div
            className="grid flex-1 gap-5 md:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]"
            onClick={() => setIsFlipped((value) => !value)}
          >
            <div className="overflow-hidden rounded-2xl border border-ivory-dark bg-white shadow-sm">
              {!isFlipped ? (
                <div className="flex h-full flex-col">
                  <div className="flex items-center justify-between border-b border-ivory-dark px-4 py-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-warm-gray">
                        {card.figureLabel}
                      </p>
                      <p className="mt-1 text-sm font-medium text-navy">{card.documentTitle}</p>
                    </div>
                    <div className="rounded-full bg-coral/10 px-3 py-1 text-xs font-semibold text-coral">
                      Page {card.pageNumber}
                    </div>
                  </div>
                  <div ref={previewRef} className="flex flex-1 items-center justify-center bg-ivory/40 p-4">
                    <ImageFlashcardPreview
                      file={pdfUrl(card.storagePath)}
                      pageNumber={card.pageNumber}
                      width={pageWidth}
                    />
                  </div>
                  <div className="border-t border-ivory-dark px-4 py-3 text-xs text-warm-gray">
                    Tap to flip. Front shows the source page image for this figure reference.
                  </div>
                </div>
              ) : (
                <div className="flex h-full flex-col">
                  <div className="border-b border-ivory-dark px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sage">
                      Back of Card
                    </p>
                    <p className="mt-1 text-sm font-medium text-navy">
                      {card.figureLabel} · {card.documentTitle}
                    </p>
                  </div>
                  <div className="flex-1 space-y-5 overflow-auto p-5">
                    <section>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-warm-gray">
                        Figure Text
                      </p>
                      <p className="mt-2 text-sm leading-relaxed text-navy whitespace-pre-line">
                        {card.caption}
                      </p>
                    </section>

                    <section>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-warm-gray">
                        Related References
                      </p>
                      {card.references.length > 0 ? (
                        <div className="mt-2 space-y-2">
                          {card.references.map((reference) => (
                            <div
                              key={reference}
                              className="rounded-xl border border-ivory-dark bg-ivory/35 px-3 py-2 text-sm leading-relaxed text-navy"
                            >
                              {reference}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-warm-gray">
                          No additional same-document reference lines were detected for this figure.
                        </p>
                      )}
                    </section>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col rounded-2xl border border-ivory-dark bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-coral">
                <ImageIcon size={18} />
                <p className="text-sm font-semibold">Image Deck</p>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-warm-gray">
                This deck is organized by figure references extracted from the PDFs. The front shows the source page image. The back shows the figure caption plus same-document lines that reference that figure.
              </p>

              <div className="mt-5 space-y-3">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsFlipped(false);
                    setCurrentIndex((index) => Math.max(0, Math.min(index, filteredCards.length - 1) - 1));
                  }}
                  disabled={safeIndex === 0}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-ivory-dark px-4 py-3 text-sm font-medium text-navy transition-colors hover:bg-ivory disabled:opacity-40"
                >
                  <ChevronLeft size={16} /> Previous
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsFlipped(false);
                    setCurrentIndex((index) => Math.min(filteredCards.length - 1, Math.min(index, filteredCards.length - 1) + 1));
                  }}
                  disabled={safeIndex === filteredCards.length - 1}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-navy px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-navy-light disabled:opacity-40"
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
