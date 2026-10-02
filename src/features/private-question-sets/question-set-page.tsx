"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronDown,
  ClipboardList,
  Layers,
  Loader2,
  Lock,
  Sparkles,
} from "lucide-react";
import { useAuthSession } from "@/hooks/use-auth-session";
import {
  applyProgressUpdate,
  filterQuestions,
  listSections,
  seededShuffle,
  summarizeProgress,
  type CardResult,
  type PrivateQuestion,
  type PrivateQuestionSetDetail,
  type QuestionFilter,
  type QuestionKind,
  type QuizResult,
} from "@/features/private-question-sets/question-set";
import { CardSession } from "@/features/private-question-sets/card-session";
import { QuizSession } from "@/features/private-question-sets/quiz-session";

type SessionMode = "cards" | "quiz";

interface ActiveSession {
  mode: SessionMode;
  questions: PrivateQuestion[];
  seed: number;
  key: number;
}

type LoadState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "unavailable" }
  | { status: "error" }
  | { status: "ready"; detail: PrivateQuestionSetDetail };

const KIND_OPTIONS: { value: QuestionKind; label: string }[] = [
  { value: "all", label: "All" },
  { value: "mcq", label: "Multiple choice" },
  { value: "recall", label: "Rapid recall" },
];

function newSeed() {
  return Math.floor(Math.random() * 2 ** 31);
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-2">
      <span>
        <span className="block text-sm font-medium text-navy">{label}</span>
        {hint && <span className="block text-xs text-warm-gray">{hint}</span>}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="peer sr-only"
        />
        <span className="h-6 w-10 rounded-full bg-ivory-dark transition peer-checked:bg-coral peer-focus-visible:ring-2 peer-focus-visible:ring-coral/30" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
      </span>
    </label>
  );
}

export function QuestionSetPage({
  slug,
  initialMode,
}: {
  slug: string;
  initialMode: SessionMode | null;
}) {
  const { user, loading: authLoading } = useAuthSession();
  const userId = user?.id ?? null;
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [filter, setFilter] = useState<QuestionFilter>({ section: "all", kind: "all", onlyMissed: false });
  const [shuffleOrder, setShuffleOrder] = useState(false);
  const [shuffleChoices, setShuffleChoices] = useState(true);
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    let cancelled = false;
    fetch(`/api/question-sets/${encodeURIComponent(slug)}`, { cache: "no-store" })
      .then(async (response) => {
        if (cancelled) return;
        if (response.status === 401) return setLoad({ status: "signed-out" });
        if (response.status === 404) return setLoad({ status: "unavailable" });
        if (!response.ok) return setLoad({ status: "error" });
        const detail = (await response.json()) as PrivateQuestionSetDetail;
        if (cancelled) return;
        setLoad({ status: "ready", detail });
        if (initialMode && detail.questions.length > 0) {
          setSession({ mode: initialMode, questions: detail.questions, seed: newSeed(), key: Date.now() });
        }
      })
      .catch(() => {
        if (!cancelled) setLoad({ status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, initialMode, slug, userId]);

  const detail = load.status === "ready" ? load.detail : null;

  const sections = useMemo(() => (detail ? listSections(detail.questions) : []), [detail]);
  const selected = useMemo(
    () => (detail ? filterQuestions(detail.questions, filter, detail.progress) : []),
    [detail, filter],
  );
  const summary = useMemo(
    () => (detail ? summarizeProgress(detail.questions, detail.progress) : { reviewed: 0, missed: 0 }),
    [detail],
  );
  const counts = useMemo(() => {
    const questions = detail?.questions ?? [];
    const mcq = questions.filter((q) => q.correctIndex !== null).length;
    return { total: questions.length, mcq, recall: questions.length - mcq };
  }, [detail]);

  const recordProgress = useCallback(
    (questionId: string, update: { cardResult?: CardResult; quizResult?: QuizResult }) => {
      setLoad((current) => {
        if (current.status !== "ready") return current;
        const progress = {
          ...current.detail.progress,
          [questionId]: applyProgressUpdate(current.detail.progress[questionId], update),
        };
        return { status: "ready", detail: { ...current.detail, progress } };
      });

      fetch(`/api/question-sets/${encodeURIComponent(slug)}/progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, ...update }),
      })
        .then((response) => {
          if (!response.ok) {
            setSaveNotice(
              response.status === 401
                ? "You were signed out — progress from this session isn't being saved."
                : "Some progress couldn't be saved. Your answers still count for this session.",
            );
          }
        })
        .catch(() => setSaveNotice("Offline — progress from this session isn't being saved."));
    },
    [slug],
  );

  function start(mode: SessionMode, questions: PrivateQuestion[]) {
    if (questions.length === 0) return;
    const seed = newSeed();
    setSession({
      mode,
      questions: shuffleOrder ? seededShuffle(questions, seed) : questions,
      seed,
      key: Date.now(),
    });
    window.scrollTo({ top: 0 });
  }

  if (load.status === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-coral" />
        <span className="ml-3 text-warm-gray">Loading questions...</span>
      </div>
    );
  }

  if (load.status !== "ready" || !detail) {
    const message =
      load.status === "signed-out"
        ? { title: "Sign in to continue", body: "This question set is private. Sign in with the account it was shared with." }
        : load.status === "unavailable"
          ? { title: "Not available", body: "This question set isn't shared with your account." }
          : { title: "Couldn't load questions", body: "Something went wrong loading this set. Try again in a moment." };

    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
        <Lock className="h-8 w-8 text-warm-gray-light" />
        <p className="mt-4 font-[DM_Serif_Display] text-2xl text-navy">{message.title}</p>
        <p className="mt-2 max-w-sm text-sm text-warm-gray">{message.body}</p>
        <Link
          href={load.status === "signed-out" ? `/sign-in?next=${encodeURIComponent(`/question-sets/${slug}`)}` : "/"}
          className="mt-6 rounded-lg bg-navy px-6 py-3 text-sm font-semibold text-white"
        >
          {load.status === "signed-out" ? "Sign in" : "Back to Library"}
        </Link>
      </div>
    );
  }

  if (session) {
    const common = {
      title: detail.title,
      questions: session.questions,
      seed: session.seed,
      shuffleChoices,
      onExit: () => setSession(null),
      onRestart: (questions: PrivateQuestion[]) => start(session.mode, questions),
    };

    return (
      <>
        {saveNotice && (
          <div className="border-b border-ivory-dark bg-coral/8 px-4 py-2 text-xs font-medium text-coral-dark">
            {saveNotice}
          </div>
        )}
        {session.mode === "cards" ? (
          <CardSession
            key={session.key}
            {...common}
            onRecord={(id, result) => recordProgress(id, { cardResult: result })}
          />
        ) : (
          <QuizSession
            key={session.key}
            {...common}
            onRecord={(id, result) => recordProgress(id, { quizResult: result })}
          />
        )}
      </>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-8 md:py-10">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-warm-gray hover:text-navy">
        <ArrowLeft size={16} /> Library
      </Link>

      <header className="mt-5">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-coral/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-coral-dark">
          <Lock size={11} /> Only visible to you
        </span>
        <h1 className="mt-3 font-[DM_Serif_Display] text-3xl text-navy md:text-4xl">{detail.title}</h1>
        {detail.description && (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-warm-gray md:text-base">{detail.description}</p>
        )}
      </header>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Questions", value: counts.total },
          { label: "Multiple choice", value: counts.mcq },
          { label: "Reviewed", value: summary.reviewed },
          { label: "To revisit", value: summary.missed },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-ivory-dark bg-white px-4 py-3">
            <p className="text-2xl font-bold text-navy">{stat.value}</p>
            <p className="text-xs text-warm-gray">{stat.label}</p>
          </div>
        ))}
      </div>

      <section className="mt-6 rounded-2xl border border-ivory-dark bg-white p-5 shadow-sm md:p-6">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-warm-gray">Build a session</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-navy">Section</span>
            <select
              value={filter.section}
              onChange={(event) => setFilter((f) => ({ ...f, section: event.target.value }))}
              className="mt-1.5 w-full rounded-lg border border-ivory-dark bg-white px-3 py-2.5 text-sm text-navy outline-none focus:border-coral focus:ring-2 focus:ring-coral/20"
            >
              <option value="all">All sections ({counts.total})</option>
              {sections.map((section) => (
                <option key={section.name} value={section.name}>
                  {section.name} ({section.count})
                </option>
              ))}
            </select>
          </label>

          <div>
            <span className="text-sm font-medium text-navy">Question type</span>
            <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-lg border border-ivory-dark bg-ivory p-1">
              {KIND_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFilter((f) => ({ ...f, kind: option.value }))}
                  className={`rounded-md px-2 py-1.5 text-xs font-semibold transition ${
                    filter.kind === option.value ? "bg-white text-navy shadow-sm" : "text-warm-gray hover:text-navy"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 divide-y divide-ivory-dark border-t border-ivory-dark">
          <Toggle
            checked={filter.onlyMissed}
            onChange={(value) => setFilter((f) => ({ ...f, onlyMissed: value }))}
            label="Only questions to revisit"
            hint={`Ones you last missed in Cards or Quiz (${summary.missed})`}
          />
          <Toggle checked={shuffleOrder} onChange={setShuffleOrder} label="Shuffle question order" />
          <Toggle
            checked={shuffleChoices}
            onChange={setShuffleChoices}
            label="Shuffle answer choices"
            hint="So you learn the answer, not the letter"
          />
        </div>

        <p className="mt-4 text-xs text-warm-gray">
          {selected.length} question{selected.length === 1 ? "" : "s"} selected
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <button
            onClick={() => start("cards", selected)}
            disabled={selected.length === 0}
            className="flex items-center gap-4 rounded-xl border border-ivory-dark bg-white p-4 text-left transition-all hover:border-coral/30 hover:shadow-sm active:scale-[0.98] disabled:opacity-50"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-coral/10">
              <Layers size={22} className="text-coral" />
            </span>
            <span>
              <span className="block font-semibold text-navy">Study cards</span>
              <span className="block text-xs text-warm-gray">Flip to the answer, mark got it or missed</span>
            </span>
          </button>
          <button
            onClick={() => start("quiz", selected)}
            disabled={selected.length === 0}
            className="flex items-center gap-4 rounded-xl border border-ivory-dark bg-white p-4 text-left transition-all hover:border-sage/40 hover:shadow-sm active:scale-[0.98] disabled:opacity-50"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-sage/10">
              <ClipboardList size={22} className="text-sage-dark" />
            </span>
            <span>
              <span className="block font-semibold text-navy">Take quiz</span>
              <span className="block text-xs text-warm-gray">Answer each, see the explanation right away</span>
            </span>
          </button>
        </div>
      </section>

      {detail.memorizeFirst.length > 0 && (
        <details className="group mt-6 rounded-2xl border border-ivory-dark bg-white p-5 shadow-sm md:p-6">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
            <span className="flex items-center gap-2 font-[DM_Serif_Display] text-xl text-navy">
              <Sparkles size={18} className="text-coral" />
              {detail.memorizeFirst.length} facts to memorize first
            </span>
            <ChevronDown size={18} className="text-warm-gray transition group-open:rotate-180" />
          </summary>
          <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-navy marker:text-warm-gray">
            {detail.memorizeFirst.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
