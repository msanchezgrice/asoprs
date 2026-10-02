"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, RotateCcw, X } from "lucide-react";
import {
  isMultipleChoice,
  optionLetter,
  presentQuestion,
  type CardResult,
  type PrivateQuestion,
} from "@/features/private-question-sets/question-set";
import { ExplanationAndPearl } from "@/features/private-question-sets/answer-details";

interface CardSessionProps {
  title: string;
  questions: PrivateQuestion[];
  seed: number;
  shuffleChoices: boolean;
  onRecord: (questionId: string, result: CardResult) => void;
  onExit: () => void;
  onRestart: (questions: PrivateQuestion[]) => void;
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(target.tagName) || target.isContentEditable;
}

export function CardSession({
  title,
  questions,
  seed,
  shuffleChoices,
  onRecord,
  onExit,
  onRestart,
}: CardSessionProps) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [results, setResults] = useState<Record<string, CardResult>>({});
  const [finished, setFinished] = useState(false);

  const question = questions[index];
  const presented = useMemo(
    () => (question ? presentQuestion(question, { shuffle: shuffleChoices, seed }) : null),
    [question, seed, shuffleChoices],
  );

  const gotIt = Object.values(results).filter((r) => r === "got_it").length;
  const missed = Object.values(results).filter((r) => r === "missed").length;

  const goTo = useCallback(
    (next: number) => {
      setFlipped(false);
      setIndex(Math.max(0, Math.min(questions.length - 1, next)));
    },
    [questions.length],
  );

  const handleResult = useCallback(
    (result: CardResult) => {
      if (!question) return;
      setResults((prev) => ({ ...prev, [question.id]: result }));
      onRecord(question.id, result);
      setFlipped(false);
      if (index < questions.length - 1) {
        setTimeout(() => setIndex((i) => i + 1), 180);
      } else {
        setTimeout(() => setFinished(true), 180);
      }
    },
    [index, onRecord, question, questions.length],
  );

  useEffect(() => {
    if (finished) return;
    function onKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        setFlipped((value) => !value);
      } else if (event.key === "ArrowRight") {
        goTo(index + 1);
      } else if (event.key === "ArrowLeft") {
        goTo(index - 1);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [finished, goTo, index]);

  if (finished || !question || !presented) {
    const missedQuestions = questions.filter((q) => results[q.id] === "missed");
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-6 pb-24 md:pb-10">
        <div className="w-full max-w-md animate-scale-in rounded-2xl border border-ivory-dark bg-white p-6 text-center shadow-lg md:p-8">
          <h2 className="font-[DM_Serif_Display] text-2xl text-navy md:text-3xl">Session Complete</h2>
          <p className="mt-2 text-sm text-warm-gray">{title}</p>
          <div className="mt-6 flex items-center justify-center gap-10">
            <div>
              <p className="text-3xl font-bold text-sage">{gotIt}</p>
              <p className="text-xs text-warm-gray">Got it</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-coral">{missed}</p>
              <p className="text-xs text-warm-gray">Missed</p>
            </div>
          </div>
          <p className="mt-3 text-sm font-semibold text-navy">
            {Math.round((gotIt / (gotIt + missed || 1)) * 100)}% recalled
          </p>
          <div className="mt-6 flex flex-col gap-3">
            {missedQuestions.length > 0 && (
              <button
                onClick={() => onRestart(missedQuestions)}
                className="w-full rounded-lg border border-coral bg-coral/5 py-3.5 text-sm font-semibold text-coral transition-colors hover:bg-coral/10"
              >
                Review the {missedQuestions.length} you missed
              </button>
            )}
            <button
              onClick={() => onRestart(questions)}
              className="w-full rounded-lg bg-navy py-3.5 text-sm font-semibold text-white transition-colors hover:bg-navy-light"
            >
              Go through these {questions.length} again
            </button>
            <button
              onClick={onExit}
              className="w-full rounded-lg border border-ivory-dark py-3.5 text-sm font-semibold text-warm-gray transition-colors hover:bg-ivory"
            >
              Back to {title}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const mcq = isMultipleChoice(question);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-ivory-dark bg-white px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={onExit}
            aria-label="Back to question set"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-warm-gray transition-colors hover:bg-ivory hover:text-navy"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <h1 className="truncate font-[DM_Serif_Display] text-base text-navy md:text-lg">{title}</h1>
            <p className="text-[11px] text-warm-gray">Cards &middot; {questions.length} in this session</p>
          </div>
        </div>
        <button
          onClick={() => {
            setResults({});
            goTo(0);
          }}
          className="rounded p-2 text-warm-gray hover:bg-ivory hover:text-navy"
          title="Restart"
          aria-label="Restart session"
        >
          <RotateCcw size={16} />
        </button>
      </header>

      <div className="h-1 bg-ivory-dark">
        <div
          className="h-full bg-coral transition-all duration-300"
          style={{ width: `${((index + 1) / questions.length) * 100}%` }}
        />
      </div>

      <div className="flex flex-1 flex-col items-center px-4 py-4 pb-6 md:justify-center md:py-8">
        <p className="mb-3 text-sm font-medium text-warm-gray md:mb-4">
          {index + 1} <span className="text-warm-gray-light">/ {questions.length}</span>
        </p>

        <div
          role="button"
          tabIndex={0}
          aria-label={flipped ? "Show question" : "Reveal answer"}
          className="card-flip w-full max-w-xl cursor-pointer select-none outline-none"
          onClick={() => setFlipped((value) => !value)}
        >
          <div className={`card-flip-inner grid ${flipped ? "flipped" : ""}`}>
            {/* Front */}
            <div className="card-front col-start-1 row-start-1 flex min-h-[300px] flex-col rounded-2xl border border-ivory-dark bg-white p-5 shadow-lg md:min-h-[360px] md:p-7">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-navy/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-navy">
                  Q{question.position}
                </span>
                <span className="rounded-md bg-violet-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-700">
                  {question.section}
                </span>
                {!mcq && (
                  <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                    Rapid recall
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col justify-center py-4">
                <p className="font-[DM_Serif_Display] text-lg leading-relaxed text-navy md:text-xl">
                  {question.question}
                </p>
                {mcq && (
                  <ol className="mt-4 space-y-1.5">
                    {presented.options.map((option, optionIndex) => (
                      <li key={optionIndex} className="flex gap-2.5 text-sm leading-relaxed text-navy md:text-[15px]">
                        <span className="font-semibold text-warm-gray">{optionLetter(optionIndex)}.</span>
                        <span>{option}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
              <p className="text-center text-xs text-warm-gray-light">Tap or press space to reveal</p>
            </div>

            {/* Back */}
            <div className="card-back col-start-1 row-start-1 flex min-h-[300px] flex-col rounded-2xl border border-sage/30 bg-[#F4F7F3] p-5 shadow-lg md:min-h-[360px] md:p-7">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-sage-dark">
                Answer &middot; Q{question.position}
              </span>
              <div className="flex flex-1 flex-col justify-center gap-4 py-4">
                <p className="font-[DM_Serif_Display] text-lg leading-relaxed text-navy md:text-xl">
                  {mcq && presented.correctIndex !== null
                    ? `${optionLetter(presented.correctIndex)}. ${presented.options[presented.correctIndex]}`
                    : question.answer}
                </p>
                <ExplanationAndPearl explanation={question.explanation} pearl={question.pearl} />
              </div>
              <p className="text-center text-xs text-warm-gray-light">Tap to see the question</p>
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-4 md:mt-8">
          <button
            onClick={() => handleResult("missed")}
            aria-label="Missed it"
            className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-coral bg-white text-coral shadow-sm transition-all hover:bg-coral hover:text-white active:scale-95 md:h-16 md:w-16"
          >
            <X size={24} />
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={() => goTo(index - 1)}
              disabled={index === 0}
              aria-label="Previous card"
              className="rounded-full p-2.5 text-warm-gray hover:bg-ivory disabled:opacity-30"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              onClick={() => goTo(index + 1)}
              disabled={index === questions.length - 1}
              aria-label="Next card"
              className="rounded-full p-2.5 text-warm-gray hover:bg-ivory disabled:opacity-30"
            >
              <ChevronRight size={20} />
            </button>
          </div>
          <button
            onClick={() => handleResult("got_it")}
            aria-label="Got it"
            className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-sage bg-white text-sage shadow-sm transition-all hover:bg-sage hover:text-white active:scale-95 md:h-16 md:w-16"
          >
            <Check size={24} />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-6 text-xs text-warm-gray md:mt-6">
          <span className="flex items-center gap-1">
            <Check size={14} className="text-sage" /> {gotIt} got it
          </span>
          <span className="flex items-center gap-1">
            <X size={14} className="text-coral" /> {missed} missed
          </span>
        </div>
      </div>
    </div>
  );
}
