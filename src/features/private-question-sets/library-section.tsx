"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, Layers, Lock, ListChecks } from "lucide-react";
import { useAuthSession } from "@/hooks/use-auth-session";
import type { PrivateQuestionSetSummary } from "@/features/private-question-sets/question-set";

/**
 * Library-page section for private question sets. Renders nothing unless the
 * signed-in user has been granted at least one set (enforced server-side).
 */
export function PrivateQuestionSetsSection() {
  const { user } = useAuthSession();
  const userId = user?.id ?? null;
  const [loaded, setLoaded] = useState<{ userId: string; sets: PrivateQuestionSetSummary[] } | null>(
    null,
  );

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;
    fetch("/api/question-sets", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((data: unknown) => {
        if (!cancelled) {
          setLoaded({ userId, sets: Array.isArray(data) ? (data as PrivateQuestionSetSummary[]) : [] });
        }
      })
      .catch(() => {
        if (!cancelled) setLoaded({ userId, sets: [] });
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const sets = userId && loaded?.userId === userId ? loaded.sets : [];
  if (sets.length === 0) return null;

  return (
    <section aria-label="Added Questions" className="mb-8 space-y-4">
      {sets.map((set) => {
        const reviewedPct = set.questionCount
          ? Math.round((set.reviewedCount / set.questionCount) * 100)
          : 0;

        return (
          <div
            key={set.slug}
            className="animate-fade-in-up overflow-hidden rounded-2xl border border-coral/25 bg-white shadow-sm"
          >
            <div className="flex flex-col gap-5 p-5 md:flex-row md:items-center md:justify-between md:p-6">
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-coral/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-coral-dark">
                  <Lock size={11} /> Only visible to you
                </span>
                <Link href={`/question-sets/${set.slug}`}>
                  <h2 className="mt-3 font-[DM_Serif_Display] text-2xl leading-snug text-navy hover:text-coral-dark md:text-3xl">
                    {set.title}
                  </h2>
                </Link>
                {set.description && (
                  <p className="mt-1.5 max-w-2xl text-sm leading-6 text-warm-gray">{set.description}</p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-warm-gray">
                  <span className="flex items-center gap-1">
                    <ListChecks size={13} /> {set.questionCount} questions
                  </span>
                  <span className="flex items-center gap-1">
                    <ClipboardList size={13} /> {set.multipleChoiceCount} MCQs
                  </span>
                  <span className="flex items-center gap-1">
                    <Layers size={13} /> {set.recallCount} rapid recall
                  </span>
                  {set.reviewedCount > 0 && (
                    <span className="font-medium text-navy">
                      {reviewedPct}% reviewed
                      {set.missedCount > 0 ? ` · ${set.missedCount} to revisit` : ""}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Link
                  href={`/question-sets/${set.slug}`}
                  className="rounded-md bg-ivory px-3.5 py-2 text-xs font-semibold text-navy transition-colors hover:bg-ivory-dark active:scale-95"
                >
                  Browse
                </Link>
                <Link
                  href={`/question-sets/${set.slug}?mode=cards`}
                  className="rounded-md bg-coral/10 px-3.5 py-2 text-xs font-semibold text-coral transition-colors hover:bg-coral/20 active:scale-95"
                >
                  Cards
                </Link>
                <Link
                  href={`/question-sets/${set.slug}?mode=quiz`}
                  className="rounded-md bg-sage/10 px-3.5 py-2 text-xs font-semibold text-sage-dark transition-colors hover:bg-sage/20 active:scale-95"
                >
                  Quiz
                </Link>
              </div>
            </div>
            {set.reviewedCount > 0 && (
              <div className="h-1 bg-ivory-dark">
                <div className="h-full bg-coral" style={{ width: `${reviewedPct}%` }} />
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
