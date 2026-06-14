"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Image as ImageIcon,
  Loader2,
  MessageSquareText,
  RotateCcw,
  Send,
  Stethoscope,
} from "lucide-react";
import cards from "@/data/image-flashcards.generated.json";
import { resolveOralExamPdfUrl } from "@/features/oral-exam/pdf-url";
import {
  ORAL_EXAM_CASES,
  buildOpeningExaminerMessage,
  getInitialOralExamState,
  getOralExamFigureLabel,
  getOralExamCaseLabel,
  handleOralExamTurn,
  type OralExamCase,
  type OralExamState,
} from "@/features/oral-exam/oral-exam";

const ImageFlashcardPreview = dynamic(
  () =>
    import("@/components/flashcards/image-flashcard-preview").then(
      (mod) => mod.ImageFlashcardPreview
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-64 items-center justify-center text-coral">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    ),
  }
);

type ImageFlashcard = (typeof cards)[number];

type ChatMessage = {
  id: string;
  role: "examiner" | "candidate";
  text: string;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

function findFigure(figureId: string) {
  return (cards as ImageFlashcard[]).find((card) => card.id === figureId);
}

function buildInitialMessages(oralCase: OralExamCase): ChatMessage[] {
  return [
    {
      id: `${oralCase.id}-opening`,
      role: "examiner",
      text: buildOpeningExaminerMessage(),
    },
  ];
}

function FigurePanel({
  figure,
  label,
  width,
}: {
  figure: ImageFlashcard;
  label: string;
  width: number;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-[0.18em] text-warm-gray">
            {figure.figureLabel}
          </p>
          <p className="truncate text-sm font-medium text-navy">
            {label}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-ivory px-2.5 py-1 text-[11px] font-semibold text-warm-gray">
          p{figure.pageNumber}
        </span>
      </div>
      <ImageFlashcardPreview
        file={resolveOralExamPdfUrl(figure.storagePath, SUPABASE_URL)}
        pageNumber={figure.pageNumber}
        width={width}
        pageWidth={figure.pageWidth}
        pageHeight={figure.pageHeight}
        crop={figure.crop}
      />
    </div>
  );
}

export default function OralExamPage() {
  const [selectedCaseId, setSelectedCaseId] = useState(ORAL_EXAM_CASES[0].id);
  const selectedCase = useMemo(
    () => ORAL_EXAM_CASES.find((item) => item.id === selectedCaseId)!,
    [selectedCaseId]
  );
  const selectedCaseIndex = useMemo(
    () => ORAL_EXAM_CASES.findIndex((item) => item.id === selectedCaseId),
    [selectedCaseId]
  );
  const [state, setState] = useState<OralExamState>(() =>
    getInitialOralExamState(selectedCaseId)
  );
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    buildInitialMessages(selectedCase)
  );
  const [input, setInput] = useState("");
  const [score, setScore] = useState(0);
  const imageWrapRef = useRef<HTMLDivElement | null>(null);
  const [imageWidth, setImageWidth] = useState(520);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!imageWrapRef.current) return;
    const node = imageWrapRef.current;
    const resize = () => {
      setImageWidth(Math.max(260, Math.min(560, node.clientWidth - 32)));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  function resetCase(nextCaseId = selectedCaseId) {
    const nextCase =
      ORAL_EXAM_CASES.find((item) => item.id === nextCaseId) ??
      ORAL_EXAM_CASES[0];
    setSelectedCaseId(nextCase.id);
    setState(getInitialOralExamState(nextCase.id));
    setMessages(buildInitialMessages(nextCase));
    setInput("");
    setScore(0);
  }

  function submitTurn(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;

    const result = handleOralExamTurn({
      oralCaseId: selectedCase.id,
      state,
      userText: trimmed,
    });

    setState(result.state);
    setScore((current) => Math.max(current, result.score.total));
    setMessages((current) => [
      ...current,
      {
        id: `${selectedCase.id}-${state.turnCount + 1}-candidate`,
        role: "candidate",
        text: trimmed,
      },
      {
        id: `${selectedCase.id}-${state.turnCount + 1}-examiner`,
        role: "examiner",
        text: result.examinerMessage,
      },
    ]);
    setInput("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitTurn(input);
  }

  const revealedFigures = state.revealedFigureIds
    .map(findFigure)
    .filter((figure): figure is ImageFlashcard => Boolean(figure));
  const primaryFigure = revealedFigures[0];
  const supportingFigures = revealedFigures.slice(1);
  const isComplete = state.stage === "complete";

  return (
    <div className="min-h-dvh bg-parchment">
      <header className="border-b border-ivory-dark bg-white px-4 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-warm-gray transition-colors hover:bg-ivory hover:text-navy"
              aria-label="Back to library"
            >
              <ArrowLeft size={20} />
            </Link>
            <div className="min-w-0">
              <h1 className="truncate font-[DM_Serif_Display] text-xl text-navy">
                Oral Exam Simulator
              </h1>
              <p className="text-xs text-warm-gray">
                Image-first ASOPRS cases with serial reveal and final source labeling
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => resetCase()}
            className="inline-flex items-center gap-2 rounded-lg border border-ivory-dark px-3 py-2 text-xs font-semibold text-warm-gray transition hover:bg-ivory hover:text-navy"
          >
            <RotateCcw size={14} />
            Restart
          </button>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-4 px-4 py-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(380px,0.72fr)]">
        <section className="min-w-0 overflow-hidden rounded-xl border border-ivory-dark bg-white shadow-sm">
          <div className="border-b border-ivory-dark px-4 py-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-coral">
                  <Stethoscope size={14} />
                  Case
                </p>
                <h2 className="mt-1 truncate font-[DM_Serif_Display] text-2xl text-navy">
                  {getOralExamCaseLabel(selectedCaseIndex)}
                </h2>
              </div>
              <label className="min-w-0 text-xs font-medium text-warm-gray md:w-80">
                Pick a case
                <select
                  value={selectedCaseId}
                  onChange={(event) => resetCase(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-ivory-dark bg-ivory/30 px-3 py-2 text-sm text-navy outline-none transition focus:border-coral"
                >
                  {ORAL_EXAM_CASES.map((oralCase, index) => (
                    <option key={oralCase.id} value={oralCase.id}>
                      {getOralExamCaseLabel(index)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div ref={imageWrapRef} className="p-4">
            {primaryFigure ? (
              <FigurePanel
                figure={primaryFigure}
                label={getOralExamFigureLabel(0)}
                width={imageWidth}
              />
            ) : (
              <div className="flex min-h-80 items-center justify-center text-sm text-warm-gray">
                No starting image found for this case.
              </div>
            )}

            {supportingFigures.length > 0 && (
              <div className="mt-5 border-t border-ivory-dark pt-4">
                <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-warm-gray">
                  <ImageIcon size={14} />
                  Revealed Images
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  {supportingFigures.map((figure, index) => (
                    <FigurePanel
                      key={figure.id}
                      figure={figure}
                      label={getOralExamFigureLabel(index + 1)}
                      width={Math.min(320, imageWidth)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="flex min-h-[calc(100dvh-116px)] min-w-0 flex-col overflow-hidden rounded-xl border border-ivory-dark bg-white shadow-sm">
          <div className="border-b border-ivory-dark px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-sage">
                  <MessageSquareText size={14} />
                  Examiner
                </p>
                <p className="mt-1 text-sm text-warm-gray">
                  Stage: <span className="font-semibold text-navy">{state.stage}</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-warm-gray">
                  Score signals
                </p>
                <p className="mt-1 text-lg font-bold text-navy">{score}</p>
              </div>
            </div>
          </div>

          {isComplete && (
            <div className="border-b border-sage/20 bg-sage/10 px-4 py-3 text-sm text-sage-dark">
              <div className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{selectedCase.sourceDisclosure}</p>
              </div>
            </div>
          )}

          <div
            ref={transcriptRef}
            className="flex-1 space-y-3 overflow-y-auto bg-ivory/25 px-4 py-4"
          >
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "candidate" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[88%] whitespace-pre-line rounded-xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                    message.role === "candidate"
                      ? "bg-coral text-white"
                      : "border border-ivory-dark bg-white text-navy"
                  }`}
                >
                  {message.text}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-ivory-dark bg-white px-4 py-3">
            <div className="mb-3 grid gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => submitTurn("What is the relevant history and examination?")}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-ivory-dark px-3 py-2 text-xs font-semibold text-navy transition hover:bg-ivory"
              >
                <ClipboardCheck size={14} />
                History
              </button>
              <button
                type="button"
                onClick={() => submitTurn("I would get imaging and biopsy. What does the workup show?")}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-ivory-dark px-3 py-2 text-xs font-semibold text-navy transition hover:bg-ivory"
              >
                <ImageIcon size={14} />
                Workup
              </button>
              <button
                type="button"
                onClick={() =>
                  submitTurn(
                    "I will give my final diagnosis, management, counseling, and surveillance plan."
                  )
                }
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-ivory-dark px-3 py-2 text-xs font-semibold text-navy transition hover:bg-ivory"
              >
                <CheckCircle2 size={14} />
                Finish
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex gap-2">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                rows={2}
                placeholder="Answer the examiner or ask for the next part of the case..."
                className="min-h-12 flex-1 resize-none rounded-lg border border-ivory-dark bg-ivory/40 px-3 py-2 text-sm text-navy outline-none transition focus:border-coral focus:ring-2 focus:ring-coral/15"
              />
              <button
                type="submit"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-coral text-white transition hover:bg-coral-dark disabled:opacity-50"
                disabled={!input.trim()}
                aria-label="Send answer"
              >
                <Send size={18} />
              </button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
