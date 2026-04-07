"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Shuffle,
  RotateCcw,
  Download,
  Maximize2,
  Trash2,
  Loader2,
  Image as ImageIcon,
} from "lucide-react";
import { use } from "react";
import { useAuthSession } from "@/hooks/use-auth-session";
import { UserFeatureSlot } from "@/components/user-feature-slot";

type StudyResult = "got_it" | "missed" | null;

interface Flashcard {
  id: string;
  front: string;
  back: string;
  difficulty: "easy" | "medium" | "hard";
  docId: string;
}

export default function FlashcardPage({
  params,
}: {
  params: Promise<{ docId: string }>;
}) {
  const { docId } = use(params);
  const { user } = useAuthSession();
  const [doc, setDoc] = useState<{ title: string; category: string } | null>(null);
  const [allCards, setAllCards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/documents/${docId}`).then((r) => r.json()),
      fetch(`/api/flashcards?docId=${docId}`).then((r) => r.json()),
    ]).then(([docData, fcData]) => {
      setDoc({ title: docData.title, category: docData.category });
      const mapped = (Array.isArray(fcData) ? fcData : []).map(
        (f: { id: string; front: string; back: string; difficulty: string; document_id: string }) => ({
          id: f.id,
          front: f.front,
          back: f.back,
          difficulty: (f.difficulty || "medium") as Flashcard["difficulty"],
          docId: f.document_id,
        })
      );
      setAllCards(mapped);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [docId]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [results, setResults] = useState<Record<string, StudyResult>>({});
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [difficulty, setDifficulty] = useState<"all" | "easy" | "medium" | "hard">("all");
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const imageDeckHref = doc?.title
    ? `/flashcards/images?doc=${encodeURIComponent(
        doc.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
      )}`
    : "/flashcards/images";

  const filteredCards = difficulty === "all" ? allCards : allCards.filter(c => c.difficulty === difficulty);
  const card = filteredCards[currentIndex];

  const gotIt = Object.values(results).filter((r) => r === "got_it").length;
  const missed = Object.values(results).filter((r) => r === "missed").length;

  const persistResult = useCallback(
    (cardId: string, result: "got_it" | "missed") => {
      const now = new Date().toISOString();
      const status = result === "got_it" ? "mastered" : "learning";
      const interval_days = result === "got_it" ? 3 : 1;
      const nextReview = new Date();
      nextReview.setDate(nextReview.getDate() + interval_days);

      fetch("/api/flashcards", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: cardId,
          document_id: docId,
          status,
          interval_days,
          ease_factor: result === "got_it" ? 2.5 : 1.8,
          next_review: nextReview.toISOString(),
          last_reviewed: now,
        }),
      })
        .then((response) => {
          if (response.status === 401) {
            setSaveNotice("Sign in to save flashcard progress to your account.");
          }
        })
        .catch(() => {});
    },
    [docId]
  );

  const handleResult = useCallback(
    (result: "got_it" | "missed") => {
      if (!card) return;
      setResults((prev) => ({ ...prev, [card.id]: result }));
      persistResult(card.id, result);
      setIsFlipped(false);
      if (currentIndex < filteredCards.length - 1) {
        setTimeout(() => setCurrentIndex((i) => i + 1), 200);
      } else {
        setTimeout(() => setShowResults(true), 200);
      }
    },
    [card, currentIndex, filteredCards.length, persistResult]
  );

  const restart = (mode: "all" | "missed") => {
    if (mode === "missed") {
      const missedIds = Object.entries(results)
        .filter(([, r]) => r === "missed")
        .map(([id]) => id);
      if (missedIds.length === 0) return;
    }
    setCurrentIndex(0);
    setIsFlipped(false);
    setShowResults(false);
    if (mode === "all") setResults({});
  };

  const shuffleCards = () => {
    setCurrentIndex(0);
    setIsFlipped(false);
    setResults({});
  };

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-coral" />
        <span className="ml-3 text-warm-gray">Loading flashcards...</span>
      </div>
    );
  }

  if (allCards.length === 0) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-4">
        <p className="font-[DM_Serif_Display] text-2xl text-navy">No flashcards yet</p>
        <p className="mt-2 text-sm text-warm-gray">Flashcards for this document are being generated. Check back soon!</p>
        <Link href="/" className="mt-6 rounded-lg bg-navy px-6 py-3 text-sm font-semibold text-white">
          Back to Library
        </Link>
      </div>
    );
  }

  if (showResults) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-6 pb-24 md:pb-10">
        <div className="w-full max-w-md animate-scale-in">
          <div className="rounded-2xl border border-ivory-dark bg-white p-6 text-center shadow-lg md:p-8">
            <h2 className="font-[DM_Serif_Display] text-2xl text-navy md:text-3xl">
              Session Complete
            </h2>
            <p className="mt-2 text-sm text-warm-gray line-clamp-2">{doc?.title}</p>

            <div className="mt-6 flex items-center justify-center gap-8 md:mt-8">
              <div className="text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-sage/15 mx-auto md:h-16 md:w-16">
                  <Check size={24} className="text-sage md:hidden" />
                  <Check size={28} className="text-sage hidden md:block" />
                </div>
                <p className="mt-2 text-2xl font-bold text-sage">{gotIt}</p>
                <p className="text-xs text-warm-gray">Got it</p>
              </div>
              <div className="text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-coral/10 mx-auto md:h-16 md:w-16">
                  <X size={24} className="text-coral md:hidden" />
                  <X size={28} className="text-coral hidden md:block" />
                </div>
                <p className="mt-2 text-2xl font-bold text-coral">{missed}</p>
                <p className="text-xs text-warm-gray">Missed</p>
              </div>
            </div>

            <div className="mt-2 text-sm font-semibold text-navy">
              {Math.round((gotIt / (gotIt + missed || 1)) * 100)}% accuracy
            </div>

            <div className="mt-6 flex flex-col gap-3 md:mt-8">
              <button
                onClick={() => restart("all")}
                className="w-full rounded-lg bg-navy py-3.5 text-sm font-semibold text-white transition-colors hover:bg-navy-light active:scale-[0.98]"
              >
                Practice All Cards
              </button>
              {missed > 0 && (
                <button
                  onClick={() => restart("missed")}
                  className="w-full rounded-lg border border-coral bg-coral/5 py-3.5 text-sm font-semibold text-coral transition-colors hover:bg-coral/10 active:scale-[0.98]"
                >
                  Only Cards You Missed ({missed})
                </button>
              )}
              <Link
                href="/"
                className="w-full rounded-lg border border-ivory-dark py-3.5 text-center text-sm font-semibold text-warm-gray transition-colors hover:bg-ivory active:scale-[0.98]"
              >
                Back to Library
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col ${isFullscreen ? "fixed inset-0 z-100 bg-parchment" : "min-h-dvh"}`}
    >
      {/* Header */}
      <header className="flex items-center justify-between border-b border-ivory-dark bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-warm-gray hover:bg-ivory hover:text-navy transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate font-[DM_Serif_Display] text-base text-navy md:text-lg">
              {doc?.title ?? "Flashcards"}
            </h1>
            <p className="text-[11px] text-warm-gray">
              Flashcards &middot; {filteredCards.length} cards
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Link
            href={imageDeckHref}
            className="rounded px-2 py-2 text-warm-gray hover:bg-ivory hover:text-navy"
            title="Open image deck"
          >
            <ImageIcon size={16} />
          </Link>
          <button
            onClick={shuffleCards}
            className="rounded p-2 text-warm-gray hover:bg-ivory hover:text-navy"
            title="Shuffle"
          >
            <Shuffle size={16} />
          </button>
          <button
            onClick={() => restart("all")}
            className="rounded p-2 text-warm-gray hover:bg-ivory hover:text-navy"
            title="Restart"
          >
            <RotateCcw size={16} />
          </button>
          <button
            className="rounded p-2 text-warm-gray hover:bg-ivory hover:text-navy"
            title="Download CSV"
          >
            <Download size={16} />
          </button>
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="rounded p-2 text-warm-gray hover:bg-ivory hover:text-navy"
            title="Fullscreen"
          >
            <Maximize2 size={16} />
          </button>
        </div>
      </header>

      {!user && (
        <div className="border-b border-ivory-dark bg-amber-50 px-4 py-2 text-xs font-medium text-amber-800">
          Practice works without signing in, but your spaced-repetition progress will not be saved.
        </div>
      )}

      {saveNotice && (
        <div className="border-b border-ivory-dark bg-coral/8 px-4 py-2 text-xs font-medium text-coral-dark">
          {saveNotice}
        </div>
      )}

      {/* Difficulty filter */}
      <div className="flex items-center justify-center gap-2 overflow-x-auto bg-white px-4 py-2 border-b border-ivory-dark hide-scrollbar">
        {(["all", "easy", "medium", "hard"] as const).map((d) => (
          <button
            key={d}
            onClick={() => { setDifficulty(d); setCurrentIndex(0); setIsFlipped(false); }}
            className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition-all active:scale-95 ${
              difficulty === d
                ? d === "easy" ? "bg-sage/15 text-sage-dark"
                  : d === "medium" ? "bg-amber-100 text-amber-700"
                  : d === "hard" ? "bg-coral/10 text-coral"
                  : "bg-navy text-white"
                : "bg-ivory text-warm-gray hover:bg-ivory-dark"
            }`}
          >
            {d === "all" ? `All (${allCards.length})` : `${d.charAt(0).toUpperCase() + d.slice(1)}`}
          </button>
        ))}
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-ivory-dark">
        <div
          className="h-full bg-coral transition-all duration-300"
          style={{
            width: `${((currentIndex + 1) / filteredCards.length) * 100}%`,
          }}
        />
      </div>

      {/* Card area */}
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-4 pb-6 md:py-8">
        {card && (
          <>
            {/* Card counter */}
            <p className="mb-3 text-sm font-medium text-warm-gray md:mb-4">
              {currentIndex + 1}{" "}
              <span className="text-warm-gray-light">/ {filteredCards.length}</span>
            </p>

            {/* Flashcard */}
            <div
              className="card-flip w-full max-w-lg cursor-pointer select-none"
              onClick={() => setIsFlipped(!isFlipped)}
            >
              <div
                className={`card-flip-inner relative min-h-[240px] md:min-h-[320px] ${isFlipped ? "flipped" : ""}`}
              >
                {/* Front */}
                <div className="card-front absolute inset-0 flex flex-col rounded-2xl border border-ivory-dark bg-white p-5 shadow-lg md:p-8">
                  <div className="flex items-center justify-between">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                        card.difficulty === "easy"
                          ? "bg-sage/15 text-sage-dark"
                          : card.difficulty === "medium"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-coral/10 text-coral"
                      }`}
                    >
                      {card.difficulty}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                      className="rounded p-1.5 text-warm-gray-light hover:text-coral"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div className="flex flex-1 items-center justify-center overflow-auto py-2">
                    <p className="text-center font-[DM_Serif_Display] text-base leading-relaxed text-navy md:text-xl">
                      {card.front}
                    </p>
                  </div>

                  <p className="text-center text-xs text-warm-gray-light">
                    Tap to reveal answer
                  </p>
                </div>

                {/* Back */}
                <div className="card-back absolute inset-0 flex flex-col rounded-2xl border border-sage/30 bg-sage/5 p-5 shadow-lg md:p-8">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-sage">
                      Answer
                    </span>
                  </div>

                  <div className="flex flex-1 items-center justify-center overflow-auto py-2">
                    <p className="text-center text-sm leading-relaxed text-navy whitespace-pre-line md:text-base">
                      {card.back}
                    </p>
                  </div>

                  <p className="text-center text-xs text-warm-gray-light">
                    Tap to see question
                  </p>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="mt-5 flex items-center gap-4 md:mt-8">
              <button
                onClick={() => handleResult("missed")}
                className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-coral bg-white text-coral shadow-sm transition-all hover:bg-coral hover:text-white active:scale-95 md:h-16 md:w-16"
              >
                <X size={24} />
              </button>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setIsFlipped(false);
                    setCurrentIndex(Math.max(0, currentIndex - 1));
                  }}
                  disabled={currentIndex === 0}
                  className="rounded-full p-2.5 text-warm-gray hover:bg-ivory disabled:opacity-30"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  onClick={() => {
                    setIsFlipped(false);
                    setCurrentIndex(
                      Math.min(filteredCards.length - 1, currentIndex + 1)
                    );
                  }}
                  disabled={currentIndex === filteredCards.length - 1}
                  className="rounded-full p-2.5 text-warm-gray hover:bg-ivory disabled:opacity-30"
                >
                  <ChevronRight size={20} />
                </button>
              </div>

              <button
                onClick={() => handleResult("got_it")}
                className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-sage bg-white text-sage shadow-sm transition-all hover:bg-sage hover:text-white active:scale-95 md:h-16 md:w-16"
              >
                <Check size={24} />
              </button>
            </div>

            {/* Session stats */}
            <div className="mt-4 flex items-center gap-6 text-xs text-warm-gray md:mt-6">
              <span className="flex items-center gap-1">
                <Check size={14} className="text-sage" /> {gotIt} got it
              </span>
              <span className="flex items-center gap-1">
                <X size={14} className="text-coral" /> {missed} missed
              </span>
            </div>

            <UserFeatureSlot name="flashcard-tools" />
          </>
        )}
      </div>
    </div>
  );
}
