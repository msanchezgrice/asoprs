"use client";

import { useState, useEffect, useCallback } from "react";
import { X, ThumbsUp, Minus, ThumbsDown, Sparkles } from "lucide-react";
import { useAuthSession } from "@/hooks/use-auth-session";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

interface ShippedChange {
  id: string;
  title: string;
  description: string;
  origin_type: string;
  origin_trace: {
    evidence: string;
    confidence: string;
    delivery_strategy?: string;
    target_user_id?: string;
  } | null;
  feature_context: {
    delivery_strategy?: string;
    scope?: string;
    target_user_id?: string;
    [key: string]: unknown;
  } | null;
  shipped_at: string;
}

const ORIGIN_BADGES: Record<string, { label: string; className: string }> = {
  request: { label: "YOUR REQUEST", className: "bg-indigo-100 text-indigo-700" },
  bug: { label: "NOTICED BUG", className: "bg-red-100 text-red-700" },
  pattern: { label: "USAGE PATTERN", className: "bg-amber-100 text-amber-700" },
  annoyance: { label: "ANNOYANCE FIX", className: "bg-orange-100 text-orange-700" },
};

const SCOPE_BADGES: Record<string, { label: string; className: string }> = {
  global: { label: "GLOBAL", className: "bg-blue-100 text-blue-700" },
};

const DELIVERY_STRATEGY_BADGES: Record<string, { label: string; className: string }> = {
  global_fix: { label: "GLOBAL FIX", className: "bg-red-100 text-red-700" },
  config_change: { label: "CONFIG", className: "bg-sky-100 text-sky-700" },
  content_weight: { label: "CONTENT WEIGHT", className: "bg-violet-100 text-violet-700" },
  isolated_module: { label: "ISOLATED MODULE", className: "bg-teal-100 text-teal-700" },
};

/**
 * Generate a user-friendly description from the technical description and title.
 * Tries to reframe technical details into language a study-app user understands.
 */
function friendlyDescription(change: ShippedChange): { what: string; where: string } {
  const desc = change.description ?? "";
  const title = change.title ?? "";
  const combined = `${title} ${desc}`.toLowerCase();

  // Derive a "where to find it" hint based on keywords
  let where = "You'll notice this throughout the app";
  if (combined.includes("flashcard") || combined.includes("flash card")) {
    where = "Go to Flashcards to try this";
  } else if (combined.includes("quiz") || combined.includes("question")) {
    where = "Head to Quiz mode to see the difference";
  } else if (combined.includes("companion") || combined.includes("audio")) {
    where = "Open the Audio Companion to experience this";
  } else if (combined.includes("dashboard") || combined.includes("progress")) {
    where = "Check your Dashboard to see the update";
  } else if (combined.includes("search") || combined.includes("filter")) {
    where = "Try searching or filtering to see the improvement";
  } else if (combined.includes("pdf") || combined.includes("reader")) {
    where = "Open any PDF to see the change";
  } else if (combined.includes("config") || combined.includes("setting")) {
    where = "This applies automatically — no action needed";
  }

  // Rewrite the description to be user-facing
  let what = desc;
  // Strip obvious dev jargon patterns
  what = what.replace(/\b(refactor|component|module|endpoint|API|handler|middleware)\b/gi, (match) => {
    const map: Record<string, string> = {
      refactor: "improved",
      component: "section",
      module: "feature",
      endpoint: "service",
      api: "service",
      handler: "process",
      middleware: "system",
    };
    return map[match.toLowerCase()] ?? match;
  });

  // If description is very short or empty, derive from title
  if (what.length < 10) {
    what = `We ${title.toLowerCase().startsWith("add") ? "added" : title.toLowerCase().startsWith("fix") ? "fixed" : "updated"} ${title.toLowerCase().replace(/^(add|fix|update|improve|refactor)\s+/i, "")} to make your study experience better.`;
  }

  return { what, where };
}

function isOlderThan24Hours(dateStr: string): boolean {
  const shippedAt = new Date(dateStr).getTime();
  const now = Date.now();
  return now - shippedAt > 24 * 60 * 60 * 1000;
}

export function ChangeTour() {
  const { user } = useAuthSession();
  const [changes, setChanges] = useState<ShippedChange[]>([]);
  const [visible, setVisible] = useState(false);
  const [rated, setRated] = useState<Set<string>>(new Set());
  const [triedIt, setTriedIt] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;

    const supabase = createBrowserSupabaseClient();
    const lastSeenKey = `oculoprep_last_seen_changes_${user.id}`;
    const lastSeen = localStorage.getItem(lastSeenKey);

    // Load "tried it" state from localStorage
    const triedKey = `oculoprep_tried_changes_${user.id}`;
    const storedTried = localStorage.getItem(triedKey);
    if (storedTried) {
      try {
        setTriedIt(new Set(JSON.parse(storedTried)));
      } catch { /* ignore parse errors */ }
    }

    async function loadChanges() {
      let query = supabase
        .from("shipped_changes")
        .select("*")
        .eq("status", "active")
        .or("feature_context->>build_status.eq.completed,feature_context->>build_status.eq.config_applied")
        .order("shipped_at", { ascending: false })
        .limit(5);

      if (lastSeen) {
        query = query.gt("shipped_at", lastSeen);
      }

      const { data } = await query;
      if (data && data.length > 0) {
        setChanges(data);
        setVisible(true);
      }
    }

    void loadChanges();
  }, [user]);

  const dismiss = useCallback(() => {
    if (!user) return;
    const lastSeenKey = `oculoprep_last_seen_changes_${user.id}`;
    localStorage.setItem(lastSeenKey, new Date().toISOString());
    setVisible(false);
  }, [user]);

  const markTriedIt = useCallback((changeId: string) => {
    if (!user) return;
    setTriedIt((prev) => {
      const next = new Set(prev).add(changeId);
      const triedKey = `oculoprep_tried_changes_${user.id}`;
      localStorage.setItem(triedKey, JSON.stringify([...next]));
      return next;
    });
  }, [user]);

  const submitRating = useCallback(async (changeId: string, rating: "better" | "same" | "worse") => {
    if (!user) return;
    const supabase = createBrowserSupabaseClient();

    await supabase.from("change_feedback").insert({
      change_id: changeId,
      user_id: user.id,
      rating,
    });

    setRated((prev) => new Set(prev).add(changeId));
  }, [user]);

  if (!visible || changes.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-navy/5 to-indigo-500/5 px-6 py-4 border-b border-ivory-dark">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-[DM_Serif_Display] text-lg text-navy">What&apos;s new</h2>
              <p className="text-xs text-warm-gray mt-0.5">
                {changes.length} improvement{changes.length > 1 ? "s" : ""} shipped based on your feedback
              </p>
            </div>
            <button onClick={dismiss} className="text-warm-gray hover:text-navy">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Changes list */}
        <div className="overflow-y-auto max-h-[60vh]">
          {changes.map((change) => {
            const origin = ORIGIN_BADGES[change.origin_type] ?? ORIGIN_BADGES.pattern;
            const isRated = rated.has(change.id);
            const hasTried = triedIt.has(change.id);
            const canRate = isOlderThan24Hours(change.shipped_at) || hasTried;

            // Scope and strategy badges
            const targetUserId = change.origin_trace?.target_user_id ?? change.feature_context?.target_user_id;
            const isPersonal = targetUserId && user && targetUserId === user.id;
            const deliveryStrategy = change.feature_context?.delivery_strategy ?? change.origin_trace?.delivery_strategy;
            const strategyBadge = deliveryStrategy ? DELIVERY_STRATEGY_BADGES[deliveryStrategy] : null;

            const { what, where } = friendlyDescription(change);

            return (
              <div key={change.id} className="px-6 py-4 border-b border-ivory-dark last:border-b-0">
                {/* Badges row */}
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${origin.className}`}>
                    {origin.label}
                  </span>
                  {isPersonal ? (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-gradient-to-r from-purple-100 to-indigo-100 text-purple-700 flex items-center gap-0.5">
                      <Sparkles size={8} />
                      JUST FOR YOU
                    </span>
                  ) : (
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${SCOPE_BADGES.global.className}`}>
                      {SCOPE_BADGES.global.label}
                    </span>
                  )}
                  {strategyBadge && (
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${strategyBadge.className}`}>
                      {strategyBadge.label}
                    </span>
                  )}
                </div>

                <h3 className="text-sm font-semibold text-navy mb-1">{change.title}</h3>
                <p className="text-xs text-navy/80 mb-1">{what}</p>
                <p className="text-[10px] text-warm-gray italic mb-2">{where}</p>

                {change.origin_trace?.evidence && (
                  <div className="bg-ivory/50 rounded px-3 py-2 border-l-2 border-indigo-300 mb-3">
                    <span className="text-[10px] text-warm-gray block mb-0.5">WHY THIS SHIPPED:</span>
                    <span className="text-xs text-navy/80 italic">{change.origin_trace.evidence}</span>
                  </div>
                )}

                {isRated ? (
                  <p className="text-xs text-emerald-600 font-medium">Thanks for the feedback!</p>
                ) : canRate ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => submitRating(change.id, "better")}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border border-emerald-300 text-emerald-600 text-xs font-medium hover:bg-emerald-50"
                    >
                      <ThumbsUp size={12} /> Better
                    </button>
                    <button
                      onClick={() => submitRating(change.id, "same")}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border border-slate-300 text-slate-500 text-xs font-medium hover:bg-slate-50"
                    >
                      <Minus size={12} /> Same
                    </button>
                    <button
                      onClick={() => submitRating(change.id, "worse")}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border border-red-300 text-red-500 text-xs font-medium hover:bg-red-50"
                    >
                      <ThumbsDown size={12} /> Worse
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[10px] text-warm-gray font-medium">Leave feedback after you&apos;ve tried it</p>
                    <div className="flex gap-2">
                      <div className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border border-slate-200 text-slate-300 text-xs font-medium cursor-not-allowed">
                        <ThumbsUp size={12} /> Better
                      </div>
                      <div className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border border-slate-200 text-slate-300 text-xs font-medium cursor-not-allowed">
                        <Minus size={12} /> Same
                      </div>
                      <div className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border border-slate-200 text-slate-300 text-xs font-medium cursor-not-allowed">
                        <ThumbsDown size={12} /> Worse
                      </div>
                    </div>
                    <button
                      onClick={() => markTriedIt(change.id)}
                      className="w-full text-center text-[11px] text-navy font-medium py-1 rounded border border-navy/20 hover:bg-navy/5 transition-colors"
                    >
                      I&apos;ve tried it &mdash; let me rate
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-ivory-dark text-center">
          <button
            onClick={dismiss}
            className="bg-navy text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-navy/90"
          >
            Got it &mdash; start studying
          </button>
        </div>
      </div>
    </div>
  );
}
