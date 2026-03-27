"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  BookOpen,
  Layers,
  ClipboardList,
  TrendingUp,
  Flame,
  Target,
  ArrowUpRight,
  Loader2,
  Trophy,
} from "lucide-react";
import { CATEGORY_META, type Category } from "@/data/sample-documents";

interface ProgressData {
  authenticated: boolean;
  docsReviewed: number;
  cardsMastered: number;
  totalFlashcards: number;
  mcqsCompleted: number;
  avgScore: number;
  streak: number;
  categoryProgress: Record<string, number>;
  categoryDocCounts: Record<string, number>;
  dueToday: { docId: string; title: string; cards: number }[];
  weakAreas: { docId: string; title: string; category: string; score: number }[];
  recentQuizzes: { docId: string; title: string; score: number; date: string }[];
  totalDocs: number;
  highlightsSaved?: number;
}

function StatCard({
  icon: Icon,
  label,
  value,
  subtext,
  color,
  index,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  subtext: string;
  color: string;
  index: number;
}) {
  return (
    <div
      className={`animate-fade-in-up stagger-${index + 1} rounded-xl border border-ivory-dark bg-white p-4 shadow-sm`}
    >
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${color}`}>
          <Icon size={20} />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold text-navy">{value}</p>
          <p className="text-xs text-warm-gray">{label}</p>
        </div>
      </div>
      <p className="mt-2 flex items-center gap-1 text-[11px] font-medium text-sage">
        <ArrowUpRight size={12} /> {subtext}
      </p>
    </div>
  );
}

function CategoryRing({
  category,
  progress,
  docCount,
  index,
}: {
  category: Category;
  progress: number;
  docCount: number;
  index: number;
}) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const offset = circ - (progress / 100) * circ;
  const meta = CATEGORY_META[category];

  return (
    <div
      className={`animate-fade-in-up stagger-${index + 1} flex flex-col items-center gap-2 rounded-xl border border-ivory-dark bg-white p-4`}
    >
      <div className="relative">
        <svg width="68" height="68" className="-rotate-90">
          <circle
            cx="34" cy="34" r={r}
            fill="none" stroke="#E8E2D6" strokeWidth="5"
          />
          <circle
            cx="34" cy="34" r={r}
            fill="none"
            stroke={progress >= 80 ? "#7A9E7E" : "#E8654A"}
            strokeWidth="5" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold text-navy">{progress}%</span>
        </div>
      </div>
      <span className={`text-[11px] font-semibold text-center leading-tight ${meta.color}`}>
        {category}
      </span>
      <span className="text-[10px] text-warm-gray">
        {docCount} docs
      </span>
    </div>
  );
}

export default function ProgressPage() {
  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/progress")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-coral" />
        <span className="ml-3 text-warm-gray">Loading progress...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
        <p className="font-[DM_Serif_Display] text-xl text-navy">Could not load progress</p>
        <p className="mt-2 text-sm text-warm-gray">Please try refreshing the page.</p>
      </div>
    );
  }

  if (!data.authenticated) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 md:px-8">
        <div className="rounded-[2rem] border border-ivory-dark bg-white p-8 shadow-lg shadow-navy/5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-warm-gray">
            Personal analytics
          </p>
          <h1 className="mt-3 font-[DM_Serif_Display] text-3xl text-navy md:text-4xl">
            Sign in to unlock persistent study progress.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-7 text-warm-gray">
            The progress dashboard now tracks your own flashcard review, quiz history, streak, and saved highlights. Without an account, the library still works, but nothing is attached to you.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/sign-in?next=/progress"
              className="inline-flex items-center justify-center rounded-2xl bg-navy px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-navy-light"
            >
              Sign in
            </Link>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-2xl border border-ivory-dark px-5 py-3 text-sm font-semibold text-navy transition-colors hover:bg-ivory"
            >
              Back to library
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const categories = Object.keys(CATEGORY_META) as Category[];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10">
      <header className="mb-8">
        <h1 className="font-[DM_Serif_Display] text-3xl text-navy md:text-4xl">
          Study Progress
        </h1>
        <p className="mt-2 text-sm text-warm-gray">
          Track your board review journey &middot; {data.totalDocs} documents
        </p>
      </header>

      {/* Stat cards */}
      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          icon={BookOpen}
          label="Docs Reviewed"
          value={String(data.docsReviewed)}
          subtext={`of ${data.totalDocs} total`}
          color="bg-navy/5 text-navy"
          index={0}
        />
        <StatCard
          icon={Layers}
          label="Cards Mastered"
          value={String(data.cardsMastered)}
          subtext={`of ${data.totalFlashcards} total`}
          color="bg-coral/10 text-coral"
          index={1}
        />
        <StatCard
          icon={ClipboardList}
          label="MCQs Completed"
          value={String(data.mcqsCompleted)}
          subtext={data.avgScore > 0 ? `${data.avgScore}% avg score` : "no quizzes yet"}
          color="bg-sage/15 text-sage-dark"
          index={2}
        />
        <StatCard
          icon={Flame}
          label="Study Streak"
          value={String(data.streak)}
          subtext={data.streak === 1 ? "day" : "days in a row"}
          color="bg-amber-50 text-amber-600"
          index={3}
        />
      </div>

      <div className="mb-8 rounded-2xl border border-ivory-dark bg-white px-5 py-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-warm-gray">
          Saved state
        </p>
        <p className="mt-2 text-sm text-navy">
          {data.highlightsSaved || 0} highlight{data.highlightsSaved === 1 ? "" : "s"} saved to your account across the library.
        </p>
      </div>

      {/* Category progress rings */}
      <section className="mb-8">
        <h2 className="mb-4 font-[DM_Serif_Display] text-xl text-navy">
          Category Mastery
        </h2>
        <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
          {categories.map((cat, i) => (
            <CategoryRing
              key={cat}
              category={cat}
              progress={data.categoryProgress[cat] || 0}
              docCount={data.categoryDocCounts?.[cat] || 0}
              index={i}
            />
          ))}
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Due Today */}
        <section className="rounded-xl border border-ivory-dark bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Target size={18} className="text-coral" />
            <h2 className="font-[DM_Serif_Display] text-lg text-navy">
              Due for Review
            </h2>
          </div>
          {data.dueToday.length > 0 ? (
            <div className="space-y-3">
              {data.dueToday.map((item) => (
                <div
                  key={item.docId}
                  className="flex items-center justify-between rounded-lg border border-ivory-dark px-3 py-2.5 transition-all hover:border-coral/30"
                >
                  <div className="min-w-0 mr-3">
                    <p className="truncate text-sm font-medium text-navy">{item.title}</p>
                    <p className="text-[11px] text-warm-gray">
                      {item.cards} card{item.cards !== 1 ? "s" : ""} due
                    </p>
                  </div>
                  <Link
                    href={`/flashcards/${item.docId}`}
                    className="shrink-0 rounded-lg bg-coral px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-coral-dark active:scale-95"
                  >
                    Study
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center py-6 text-center">
              <Trophy size={28} className="text-sage" />
              <p className="mt-2 text-sm font-medium text-navy">All caught up!</p>
              <p className="text-xs text-warm-gray">No flashcards due for review right now.</p>
            </div>
          )}
        </section>

        {/* Weak Areas */}
        <section className="rounded-xl border border-ivory-dark bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp size={18} className="text-amber-500" />
            <h2 className="font-[DM_Serif_Display] text-lg text-navy">
              Needs Improvement
            </h2>
          </div>
          {data.weakAreas.length > 0 ? (
            <div className="space-y-3">
              {data.weakAreas.map((area) => (
                <Link
                  key={area.docId}
                  href={`/quiz/${area.docId}`}
                  className="block rounded-lg border border-ivory-dark px-3 py-2.5 transition-all hover:border-amber-300 hover:shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <p className="truncate text-sm font-medium text-navy mr-2">{area.title}</p>
                    <span className="shrink-0 text-xs font-bold text-coral">
                      {area.score}%
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-ivory-dark">
                    <div
                      className="h-full rounded-full bg-coral transition-all"
                      style={{ width: `${area.score}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[10px] text-warm-gray">
                    {area.category}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center py-6 text-center">
              <ClipboardList size={28} className="text-warm-gray" />
              <p className="mt-2 text-sm font-medium text-navy">No quiz data yet</p>
              <p className="text-xs text-warm-gray">Take some quizzes to see areas to improve.</p>
            </div>
          )}
        </section>

        {/* Recent Quiz Scores */}
        <section className="rounded-xl border border-ivory-dark bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <ClipboardList size={18} className="text-sage" />
            <h2 className="font-[DM_Serif_Display] text-lg text-navy">
              Recent Quizzes
            </h2>
          </div>
          {data.recentQuizzes.length > 0 ? (
            <div className="space-y-2">
              {data.recentQuizzes.map((quiz, i) => (
                <Link
                  key={`${quiz.docId}-${i}`}
                  href={`/quiz/${quiz.docId}`}
                  className="flex items-center justify-between rounded-lg px-3 py-2 transition-all hover:bg-ivory/50"
                >
                  <div className="min-w-0 mr-3">
                    <p className="truncate text-sm font-medium text-navy">{quiz.title}</p>
                    <p className="text-[10px] text-warm-gray">{quiz.date}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${
                      quiz.score >= 80
                        ? "bg-sage/15 text-sage-dark"
                        : quiz.score >= 60
                          ? "bg-amber-50 text-amber-600"
                          : "bg-coral/10 text-coral"
                    }`}
                  >
                    {quiz.score}%
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center py-6 text-center">
              <ClipboardList size={28} className="text-warm-gray" />
              <p className="mt-2 text-sm font-medium text-navy">No quizzes taken yet</p>
              <p className="text-xs text-warm-gray">Start a quiz from any document to track scores here.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
