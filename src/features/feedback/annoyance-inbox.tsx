"use client";

import { useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { MessageSquareWarning, X, Send } from "lucide-react";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useBuilderRole } from "@/hooks/use-builder-role";
import { getPageCategory, getFeedbackType } from "@/lib/page-categories";

const STUDY_TAGS = [
  { id: "too_easy", label: "Too easy" },
  { id: "too_long", label: "Too long" },
  { id: "bad_coverage", label: "Bad coverage" },
  { id: "need_images", label: "Need images" },
  { id: "wrong_answer", label: "Wrong answer" },
] as const;

const BUILDER_TAGS = [
  { id: "ui_issue", label: "UI issue" },
  { id: "missing_feature", label: "Missing feature" },
  { id: "workflow_broken", label: "Workflow broken" },
  { id: "performance", label: "Performance" },
  { id: "ux_friction", label: "UX friction" },
] as const;

type StudyTag = (typeof STUDY_TAGS)[number]["id"];
type BuilderTag = (typeof BUILDER_TAGS)[number]["id"];
type Tag = StudyTag | BuilderTag;

interface AnnoyanceInboxProps {
  screen: string;
  context?: Record<string, unknown>;
}

export function AnnoyanceInbox({ screen, context }: AnnoyanceInboxProps) {
  const { user } = useAuthSession();
  const { builderRole, isBuilder } = useBuilderRole();
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);
  const [selectedTag, setSelectedTag] = useState<Tag | null>(null);
  const [freeText, setFreeText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const pageCategory = getPageCategory(pathname);
  const feedbackType = getFeedbackType(builderRole.role, pageCategory);
  const tags = isBuilder && pageCategory === "admin"
    ? [...STUDY_TAGS, ...BUILDER_TAGS]
    : isBuilder
      ? [...STUDY_TAGS, ...BUILDER_TAGS]
      : STUDY_TAGS;

  const submit = useCallback(async () => {
    if (!selectedTag && !freeText.trim()) return;
    if (!user) return;

    setSubmitting(true);
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          screen,
          tag: selectedTag ?? "other",
          free_text: freeText.trim() || null,
          context_json: context ?? null,
          page_category: pageCategory,
          feedback_type: feedbackType,
          user_role: builderRole.role,
        }),
      });

      setSubmitted(true);
      setSelectedTag(null);
      setFreeText("");
      setTimeout(() => {
        setSubmitted(false);
        setExpanded(false);
      }, 2000);
    } catch {
      // silent fail for feedback
    } finally {
      setSubmitting(false);
    }
  }, [selectedTag, freeText, screen, context, user, pageCategory, feedbackType, builderRole.role]);

  if (!user) return null;

  if (submitted) {
    return (
      <div className="fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-40 bg-emerald-900/90 text-emerald-200 px-4 py-2 rounded-full text-sm font-medium backdrop-blur-sm">
        Thanks for the feedback!
      </div>
    );
  }

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="fixed bottom-20 md:bottom-4 right-4 z-40 flex items-center gap-2 bg-slate-800/90 hover:bg-slate-700/90 text-slate-400 hover:text-amber-400 px-3 py-2 rounded-full text-xs font-medium backdrop-blur-sm border border-slate-700/50 transition-colors"
      >
        <MessageSquareWarning size={14} />
        Something off?
      </button>
    );
  }

  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-40 bg-slate-900/95 border border-slate-700/50 rounded-xl p-4 backdrop-blur-sm shadow-2xl">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-amber-400">
          Something off?
        </span>
        {isBuilder && (
          <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full">
            {feedbackType} feedback
          </span>
        )}
        <button
          onClick={() => setExpanded(false)}
          className="text-slate-500 hover:text-slate-300"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {tags.map((tag) => (
          <button
            key={tag.id}
            onClick={() =>
              setSelectedTag(selectedTag === tag.id ? null : tag.id)
            }
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              selectedTag === tag.id
                ? "bg-indigo-500/20 border-indigo-500 text-indigo-300"
                : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500"
            }`}
          >
            {tag.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Or tell us in your own words..."
          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
        />
        <button
          onClick={submit}
          disabled={submitting || (!selectedTag && !freeText.trim())}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-2 rounded-lg transition-colors"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
