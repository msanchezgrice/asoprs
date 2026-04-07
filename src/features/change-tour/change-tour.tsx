"use client";

import { useState, useEffect, useCallback } from "react";
import { X, ThumbsUp, Minus, ThumbsDown } from "lucide-react";
import { useAuthSession } from "@/hooks/use-auth-session";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

interface ShippedChange {
  id: string;
  title: string;
  description: string;
  origin_type: string;
  origin_trace: { evidence: string; confidence: string } | null;
  feature_context: Record<string, unknown> | null;
  shipped_at: string;
}

const ORIGIN_BADGES: Record<string, { label: string; className: string }> = {
  request: { label: "YOUR REQUEST", className: "bg-indigo-100 text-indigo-700" },
  bug: { label: "NOTICED BUG", className: "bg-red-100 text-red-700" },
  pattern: { label: "USAGE PATTERN", className: "bg-amber-100 text-amber-700" },
  annoyance: { label: "ANNOYANCE FIX", className: "bg-orange-100 text-orange-700" },
};

export function ChangeTour() {
  const { user } = useAuthSession();
  const [changes, setChanges] = useState<ShippedChange[]>([]);
  const [visible, setVisible] = useState(false);
  const [rated, setRated] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;

    const supabase = createBrowserSupabaseClient();
    const lastSeenKey = `oculoprep_last_seen_changes_${user.id}`;
    const lastSeen = localStorage.getItem(lastSeenKey);

    async function loadChanges() {
      let query = supabase
        .from("shipped_changes")
        .select("*")
        .eq("status", "active")
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

            return (
              <div key={change.id} className="px-6 py-4 border-b border-ivory-dark last:border-b-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${origin.className}`}>
                    {origin.label}
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-navy mb-1">{change.title}</h3>
                <p className="text-xs text-warm-gray mb-2">{change.description}</p>

                {change.origin_trace?.evidence && (
                  <div className="bg-ivory/50 rounded px-3 py-2 border-l-2 border-indigo-300 mb-3">
                    <span className="text-[10px] text-warm-gray block mb-0.5">WHY THIS SHIPPED:</span>
                    <span className="text-xs text-navy/80 italic">{change.origin_trace.evidence}</span>
                  </div>
                )}

                {isRated ? (
                  <p className="text-xs text-emerald-600 font-medium">Thanks for the feedback!</p>
                ) : (
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
