"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BookmarkPlus,
  Check,
  CheckSquare2,
  ChevronDown,
  FileOutput,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import type { Document } from "@/data/sample-documents";
import {
  buildStudyPackInstructions,
  DEFAULT_STUDY_PACK_FLASHCARD_COUNT,
  DEFAULT_STUDY_PACK_MCQ_COUNT,
  groupDocumentsByCategory,
  MAX_STUDY_PACK_ITEM_COUNT,
  MIN_STUDY_PACK_ITEM_COUNT,
  sanitizeStudyPackCount,
  type StudyPack,
  type StudyPackRequest,
} from "@/lib/study-pack";

interface StudyPackGeneratorModalProps {
  open: boolean;
  documents: Document[];
  generating: boolean;
  errorMessage?: string | null;
  preview?: { pack: StudyPack; text: string; saved?: boolean } | null;
  onClose: () => void;
  onGenerate: (request: StudyPackRequest) => void;
  onClearPreview?: () => void;
  onSave?: () => void;
  saving?: boolean;
}

export function StudyPackGeneratorModal({
  open,
  documents,
  generating,
  errorMessage,
  preview,
  onClose,
  onGenerate,
  onClearPreview,
  onSave,
  saving,
}: StudyPackGeneratorModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [contentMode, setContentMode] =
    useState<StudyPackRequest["contentMode"]>("mcq");
  const [outputFormat, setOutputFormat] =
    useState<StudyPackRequest["outputFormat"]>("docx");
  const [mcqCountInput, setMcqCountInput] = useState(
    String(DEFAULT_STUDY_PACK_MCQ_COUNT)
  );
  const [flashcardCountInput, setFlashcardCountInput] = useState(
    String(DEFAULT_STUDY_PACK_FLASHCARD_COUNT)
  );
  const [instructionsMode, setInstructionsMode] = useState<"auto" | "custom">(
    "auto"
  );
  const [customInstructions, setCustomInstructions] = useState("");
  const [instructionsExpanded, setInstructionsExpanded] = useState(false);

  const groupedDocs = useMemo(() => groupDocumentsByCategory(documents), [documents]);
  const totalSelected = selectedIds.length;
  const mcqCount = useMemo(
    () => sanitizeStudyPackCount(mcqCountInput, DEFAULT_STUDY_PACK_MCQ_COUNT),
    [mcqCountInput]
  );
  const flashcardCount = useMemo(
    () =>
      sanitizeStudyPackCount(
        flashcardCountInput,
        DEFAULT_STUDY_PACK_FLASHCARD_COUNT
      ),
    [flashcardCountInput]
  );
  const autoInstructions = useMemo(
    () =>
      buildStudyPackInstructions({
        contentMode,
        mcqCount,
        flashcardCount,
      }),
    [contentMode, flashcardCount, mcqCount]
  );
  const effectiveInstructions =
    instructionsMode === "custom" && customInstructions.trim()
      ? customInstructions.trim()
      : autoInstructions;
  const countSummary =
    contentMode === "mcq"
      ? `${mcqCount} MCQs per selected section`
      : contentMode === "flashcards"
        ? `${flashcardCount} flashcards per selected section`
        : `${mcqCount} MCQs and ${flashcardCount} flashcards per selected section`;

  useEffect(() => {
    if (!open) {
      return;
    }

    const originalHtmlOverflow = document.documentElement.style.overflow;
    const originalBodyOverflow = document.body.style.overflow;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    return () => {
      document.documentElement.style.overflow = originalHtmlOverflow;
      document.body.style.overflow = originalBodyOverflow;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  function toggleDoc(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((docId) => docId !== id)
        : [...current, id]
    );
  }

  function selectCategory(ids: string[]) {
    setSelectedIds((current) => {
      const next = new Set(current);
      ids.forEach((id) => next.add(id));
      return Array.from(next);
    });
  }

  function clearCategory(ids: string[]) {
    setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
  }

  function handleCountInputChange(
    value: string,
    setter: (nextValue: string) => void
  ) {
    setter(value.replace(/[^\d]/g, ""));
  }

  function handleCountBlur(
    value: string,
    fallback: number,
    setter: (nextValue: string) => void
  ) {
    setter(String(sanitizeStudyPackCount(value, fallback)));
  }

  function handleInstructionsChange(value: string) {
    setInstructionsMode("custom");
    setCustomInstructions(value);
  }

  function resetInstructions() {
    setInstructionsMode("auto");
    setCustomInstructions("");
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden overscroll-contain bg-navy/60 px-4 py-4 backdrop-blur-sm md:py-6">
      <div className="mx-auto flex h-[calc(100dvh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-white/50 bg-[linear-gradient(180deg,rgba(255,251,245,0.98),rgba(255,255,255,0.98))] shadow-[0_32px_80px_rgba(8,25,47,0.22)] md:h-[92vh] md:max-h-[92vh]">
        <div className="grid min-h-0 flex-1 md:grid-cols-[1.15fr_0.85fr]">
        <section className="border-b border-ivory-dark/70 bg-white/55 md:flex md:min-h-0 md:flex-col md:border-b-0 md:border-r md:border-ivory-dark/70">
          <div className="flex items-start justify-between border-b border-ivory-dark/70 px-5 py-5 md:px-7">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-coral">
                Study Pack Builder
              </p>
              <h2 className="mt-2 font-[DM_Serif_Display] text-3xl leading-none text-navy">
                Select your sections
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-warm-gray">
                Pick the sections you want to bundle, then generate a board-style
                packet as MCQs, flashcards, or both.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-ivory-dark bg-white p-2 text-warm-gray transition hover:border-coral/30 hover:text-navy"
              aria-label="Close generator"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 overflow-y-auto overscroll-contain px-5 py-5 md:flex-1 md:px-7">
            <div className="mb-4 flex items-center justify-between rounded-2xl border border-ivory-dark bg-ivory/70 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-navy">
                  {totalSelected} section{totalSelected === 1 ? "" : "s"} selected
                </p>
                <p className="text-xs text-warm-gray">
                  {countSummary}
                </p>
              </div>
              <CheckSquare2 className="h-5 w-5 text-coral" />
            </div>

            <div className="space-y-5">
              {Object.entries(groupedDocs).map(([category, categoryDocs]) => {
                const ids = categoryDocs.map((doc) => doc.id);
                const selectedInCategory = ids.filter((id) =>
                  selectedIds.includes(id)
                ).length;

                return (
                  <div
                    key={category}
                    className="rounded-3xl border border-ivory-dark bg-white px-4 py-4 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ivory-dark/70 pb-3">
                      <div>
                        <h3 className="font-[DM_Serif_Display] text-xl text-navy">
                          {category}
                        </h3>
                        <p className="text-xs text-warm-gray">
                          {selectedInCategory} of {categoryDocs.length} selected
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => selectCategory(ids)}
                          className="rounded-full border border-coral/20 bg-coral/8 px-3 py-1.5 text-xs font-semibold text-coral transition hover:bg-coral/14"
                          aria-label={`Select ${category}`}
                        >
                          Select {category}
                        </button>
                        <button
                          type="button"
                          onClick={() => clearCategory(ids)}
                          className="rounded-full border border-ivory-dark bg-white px-3 py-1.5 text-xs font-semibold text-warm-gray transition hover:border-navy/15 hover:text-navy"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      {categoryDocs.map((doc) => (
                        <label
                          key={doc.id}
                          className="flex cursor-pointer items-start gap-3 rounded-2xl border border-transparent px-3 py-3 transition hover:border-coral/20 hover:bg-coral/5"
                        >
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 rounded border-ivory-dark text-coral focus:ring-coral"
                            checked={selectedIds.includes(doc.id)}
                            onChange={() => toggleDoc(doc.id)}
                            aria-label={doc.title}
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-navy">
                              {doc.title}
                            </span>
                            <span className="block text-xs text-warm-gray">
                              {doc.pageCount} pages
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="min-h-0 bg-[radial-gradient(circle_at_top,rgba(255,123,87,0.16),transparent_40%),linear-gradient(180deg,#fffaf3_0%,#fff 100%)] px-5 py-5 md:flex md:flex-col md:px-7">
          <div className="rounded-[28px] border border-white/60 bg-white/85 p-5 shadow-[0_18px_40px_rgba(8,25,47,0.08)] md:flex md:min-h-0 md:flex-1 md:flex-col">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-coral/10 text-coral">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-[DM_Serif_Display] text-2xl text-navy">
                  Output options
                </h3>
                <p className="text-sm text-warm-gray">
                  Choose the format, then generate a single bundled export.
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-6 overflow-y-auto overscroll-contain md:min-h-0 md:flex-1 md:pr-1">
              <fieldset>
                <legend className="text-xs font-semibold uppercase tracking-[0.18em] text-warm-gray">
                  Content
                </legend>
                <div className="mt-3 space-y-2">
                  <label className="flex items-center gap-3 rounded-2xl border border-ivory-dark bg-white px-4 py-3 text-sm text-navy">
                    <input
                      type="radio"
                      name="content-mode"
                      value="mcq"
                      checked={contentMode === "mcq"}
                      onChange={() => setContentMode("mcq")}
                    />
                    MCQs only
                  </label>
                  <label className="flex items-center gap-3 rounded-2xl border border-ivory-dark bg-white px-4 py-3 text-sm text-navy">
                    <input
                      type="radio"
                      name="content-mode"
                      value="flashcards"
                      checked={contentMode === "flashcards"}
                      onChange={() => setContentMode("flashcards")}
                    />
                    Flashcards only
                  </label>
                  <label className="flex items-center gap-3 rounded-2xl border border-ivory-dark bg-white px-4 py-3 text-sm text-navy">
                    <input
                      type="radio"
                      name="content-mode"
                      value="both"
                      checked={contentMode === "both"}
                      onChange={() => setContentMode("both")}
                    />
                    Both MCQs and flashcards
                  </label>
                </div>
              </fieldset>

              <fieldset>
                <legend className="text-xs font-semibold uppercase tracking-[0.18em] text-warm-gray">
                  Counts
                </legend>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {contentMode !== "flashcards" ? (
                    <label className="block rounded-2xl border border-ivory-dark bg-white px-4 py-3">
                      <span className="block text-sm font-semibold text-navy">
                        MCQs per section
                      </span>
                      <input
                        type="number"
                        min={MIN_STUDY_PACK_ITEM_COUNT}
                        max={MAX_STUDY_PACK_ITEM_COUNT}
                        inputMode="numeric"
                        value={mcqCountInput}
                        onChange={(event) =>
                          handleCountInputChange(
                            event.target.value,
                            setMcqCountInput
                          )
                        }
                        onBlur={() =>
                          handleCountBlur(
                            mcqCountInput,
                            DEFAULT_STUDY_PACK_MCQ_COUNT,
                            setMcqCountInput
                          )
                        }
                        className="mt-3 w-full rounded-2xl border border-ivory-dark bg-ivory px-3 py-2 text-sm font-semibold text-navy outline-none transition focus:border-coral focus:ring-2 focus:ring-coral/15"
                      />
                    </label>
                  ) : null}

                  {contentMode !== "mcq" ? (
                    <label className="block rounded-2xl border border-ivory-dark bg-white px-4 py-3">
                      <span className="block text-sm font-semibold text-navy">
                        Flashcards per section
                      </span>
                      <input
                        type="number"
                        min={MIN_STUDY_PACK_ITEM_COUNT}
                        max={MAX_STUDY_PACK_ITEM_COUNT}
                        inputMode="numeric"
                        value={flashcardCountInput}
                        onChange={(event) =>
                          handleCountInputChange(
                            event.target.value,
                            setFlashcardCountInput
                          )
                        }
                        onBlur={() =>
                          handleCountBlur(
                            flashcardCountInput,
                            DEFAULT_STUDY_PACK_FLASHCARD_COUNT,
                            setFlashcardCountInput
                          )
                        }
                        className="mt-3 w-full rounded-2xl border border-ivory-dark bg-ivory px-3 py-2 text-sm font-semibold text-navy outline-none transition focus:border-coral focus:ring-2 focus:ring-coral/15"
                      />
                    </label>
                  ) : null}
                </div>
                <p className="mt-2 text-xs leading-5 text-warm-gray">
                  Counts apply to each selected section. Supported range:{" "}
                  {MIN_STUDY_PACK_ITEM_COUNT}-{MAX_STUDY_PACK_ITEM_COUNT}.
                </p>
              </fieldset>

              <fieldset>
                <legend className="text-xs font-semibold uppercase tracking-[0.18em] text-warm-gray">
                  Output format
                </legend>
                <div className="mt-3 space-y-2">
                  <label className="flex items-center gap-3 rounded-2xl border border-ivory-dark bg-white px-4 py-3 text-sm text-navy">
                    <input
                      type="radio"
                      name="output-format"
                      value="docx"
                      checked={outputFormat === "docx"}
                      onChange={() => setOutputFormat("docx")}
                    />
                    Word document
                  </label>
                  <label className="flex items-center gap-3 rounded-2xl border border-ivory-dark bg-white px-4 py-3 text-sm text-navy">
                    <input
                      type="radio"
                      name="output-format"
                      value="pdf"
                      checked={outputFormat === "pdf"}
                      onChange={() => setOutputFormat("pdf")}
                    />
                    PDF export
                  </label>
                  <label className="flex items-center gap-3 rounded-2xl border border-ivory-dark bg-white px-4 py-3 text-sm text-navy">
                    <input
                      type="radio"
                      name="output-format"
                      value="in-app"
                      checked={outputFormat === "in-app"}
                      onChange={() => setOutputFormat("in-app")}
                    />
                    In-app preview
                  </label>
                </div>
              </fieldset>

              <div className="rounded-3xl border border-ivory-dark bg-white px-4 py-4">
                <button
                  type="button"
                  onClick={() => setInstructionsExpanded((value) => !value)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                  aria-expanded={instructionsExpanded}
                >
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-warm-gray">
                      Instructions
                    </p>
                    <p className="mt-1 text-sm font-semibold text-navy">
                      {instructionsMode === "auto"
                        ? "Prompt auto-generated from your content type and counts"
                        : "Custom prompt override"}
                    </p>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 text-warm-gray transition ${
                      instructionsExpanded ? "rotate-180" : ""
                    }`}
                  />
                </button>

                <p className="mt-3 max-h-20 overflow-hidden text-sm leading-6 text-warm-gray">
                  {effectiveInstructions}
                </p>

                {instructionsExpanded ? (
                  <div className="mt-4 border-t border-ivory-dark/70 pt-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs leading-5 text-warm-gray">
                        {instructionsMode === "auto"
                          ? "This prompt updates automatically when you change the resource type or counts."
                          : "Custom edits are active. Reset to restore the auto-generated prompt."}
                      </p>
                      {instructionsMode === "custom" ? (
                        <button
                          type="button"
                          onClick={resetInstructions}
                          className="inline-flex items-center gap-2 rounded-full border border-coral/20 bg-coral/8 px-3 py-1.5 text-xs font-semibold text-coral transition hover:bg-coral/14"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          Use auto prompt
                        </button>
                      ) : null}
                    </div>
                    <textarea
                      value={
                        instructionsMode === "auto"
                          ? autoInstructions
                          : customInstructions
                      }
                      onChange={(event) =>
                        handleInstructionsChange(event.target.value)
                      }
                      onBlur={() => {
                        if (
                          instructionsMode === "custom" &&
                          !customInstructions.trim()
                        ) {
                          resetInstructions();
                        }
                      }}
                      className="min-h-36 w-full rounded-3xl border border-ivory-dark bg-white px-4 py-3 text-sm leading-6 text-navy outline-none transition focus:border-coral focus:ring-2 focus:ring-coral/15"
                    />
                  </div>
                ) : null}
              </div>

              {preview ? (
                <div className="rounded-[28px] border border-ivory-dark bg-white/95 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-coral">
                        In-app Preview
                      </p>
                      <h4 className="mt-2 font-[DM_Serif_Display] text-2xl text-navy">
                        {preview.pack.title}
                      </h4>
                      <p className="mt-1 text-xs text-warm-gray">
                        {preview.pack.sections.length} section
                        {preview.pack.sections.length === 1 ? "" : "s"} generated
                      </p>
                    </div>
                    {onClearPreview ? (
                      <button
                        type="button"
                        onClick={onClearPreview}
                        className="rounded-full border border-ivory-dark bg-white px-3 py-1.5 text-xs font-semibold text-warm-gray transition hover:border-coral/20 hover:text-navy"
                      >
                        Clear preview
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-3">
                    {preview.saved ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                        <Check className="h-3.5 w-3.5" />
                        Saved to Library
                      </span>
                    ) : onSave ? (
                      <button
                        type="button"
                        onClick={onSave}
                        disabled={saving}
                        className="inline-flex items-center gap-2 rounded-full bg-coral px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-coral/90 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {saving ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <BookmarkPlus className="h-3.5 w-3.5" />
                        )}
                        {saving ? "Saving..." : "Save to Library"}
                      </button>
                    ) : null}
                  </div>

                  <pre className="mt-4 max-h-72 overflow-auto rounded-2xl bg-ivory px-4 py-4 text-xs leading-6 text-navy whitespace-pre-wrap">
                    {preview.text}
                  </pre>
                </div>
              ) : null}
            </div>

            <div className="mt-4 border-t border-ivory-dark/70 bg-white/90 pt-4 backdrop-blur-sm">
              {errorMessage ? (
                <div className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {errorMessage}
                </div>
              ) : null}

              <button
                type="button"
                disabled={selectedIds.length === 0 || generating}
                onClick={() =>
                  onGenerate({
                    selectedDocumentIds: [...selectedIds].sort(),
                    contentMode,
                    outputFormat,
                    mcqCount,
                    flashcardCount,
                    instructions: effectiveInstructions,
                  })
                }
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-navy px-4 py-4 text-sm font-semibold text-white transition hover:bg-navy/92 disabled:cursor-not-allowed disabled:bg-navy/35"
              >
                <FileOutput className="h-4 w-4" />
                {generating ? "Generating..." : "Generate Study Pack"}
              </button>
            </div>
          </div>
        </section>
        </div>
      </div>
    </div>
  );
}
