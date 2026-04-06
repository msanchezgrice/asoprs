"use client";

import { Download, Eye, FileStack } from "lucide-react";
import type {
  SavedStudyPackSummary,
} from "@/lib/study-pack";

interface StudyPackHistoryProps {
  resources: SavedStudyPackSummary[];
  loading: boolean;
  authenticated: boolean;
  onPreview: (id: string) => void;
  onDownload: (id: string, format: "docx" | "pdf") => void;
}

function formatMode(mode: SavedStudyPackSummary["contentMode"]) {
  if (mode === "mcq") return "MCQs";
  if (mode === "flashcards") return "Flashcards";
  return "MCQs + Flashcards";
}

export function StudyPackHistory({
  resources,
  loading,
  authenticated,
  onPreview,
  onDownload,
}: StudyPackHistoryProps) {
  if (loading) {
    return (
      <div className="rounded-[28px] border border-ivory-dark bg-white p-6 shadow-sm">
        <p className="text-sm text-warm-gray">Loading saved study resources...</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="rounded-[28px] border border-amber-200 bg-amber-50 p-6 shadow-sm">
        <p className="text-sm font-semibold text-amber-900">
          Sign in to keep a saved library of generated study resources.
        </p>
        <p className="mt-2 text-sm leading-6 text-amber-800">
          You can still generate study packs, but saved history and re-downloads are
          only kept for authenticated accounts.
        </p>
      </div>
    );
  }

  if (resources.length === 0) {
    return (
      <div className="rounded-[28px] border border-ivory-dark bg-white p-6 shadow-sm">
        <p className="font-[DM_Serif_Display] text-2xl text-navy">
          No saved study resources yet
        </p>
        <p className="mt-2 text-sm leading-6 text-warm-gray">
          Generate a study pack and it will appear here with preview and download
          actions.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {resources.map((resource) => (
        <article
          key={resource.id}
          className="rounded-[28px] border border-ivory-dark bg-white p-5 shadow-sm"
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-coral/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-coral">
                  <FileStack className="h-3.5 w-3.5" />
                  {formatMode(resource.contentMode)}
                </span>
                <span className="rounded-full bg-ivory px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-warm-gray">
                  {resource.outputFormat}
                </span>
              </div>

              <h3 className="mt-3 font-[DM_Serif_Display] text-2xl leading-tight text-navy">
                {resource.title}
              </h3>
              <p className="mt-2 text-xs font-medium uppercase tracking-[0.16em] text-warm-gray">
                Generated {new Date(resource.createdAt).toLocaleString()}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {resource.sectionTitles.map((title) => (
                  <span
                    key={title}
                    className="rounded-full border border-ivory-dark bg-ivory/70 px-3 py-1.5 text-xs text-navy"
                  >
                    {title}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 md:justify-end">
              <button
                type="button"
                onClick={() => onPreview(resource.id)}
                className="inline-flex items-center gap-2 rounded-2xl border border-ivory-dark bg-white px-4 py-2.5 text-sm font-semibold text-navy transition hover:bg-ivory"
              >
                <Eye className="h-4 w-4" />
                Preview
              </button>
              <button
                type="button"
                onClick={() => onDownload(resource.id, "docx")}
                className="inline-flex items-center gap-2 rounded-2xl border border-coral/20 bg-coral/10 px-4 py-2.5 text-sm font-semibold text-coral transition hover:bg-coral/15"
              >
                <Download className="h-4 w-4" />
                Download Word
              </button>
              <button
                type="button"
                onClick={() => onDownload(resource.id, "pdf")}
                className="inline-flex items-center gap-2 rounded-2xl border border-ivory-dark bg-white px-4 py-2.5 text-sm font-semibold text-warm-gray transition hover:border-navy/15 hover:text-navy"
              >
                <Download className="h-4 w-4" />
                Download PDF
              </button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
