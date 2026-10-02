"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, ChevronRight, Eye, XCircle } from "lucide-react";
import {
  isMultipleChoice,
  optionLetter,
  presentQuestion,
  type PrivateQuestion,
  type QuizResult,
} from "@/features/private-question-sets/question-set";
import { ExplanationAndPearl } from "@/features/private-question-sets/answer-details";

interface QuizSessionProps {
  title: string;
  questions: PrivateQuestion[];
  seed: number;
  shuffleChoices: boolean;
  onRecord: (questionId: string, result: QuizResult) => void;
  onExit: () => void;
  onRestart: (questions: PrivateQuestion[]) => void;
}

interface Answer {
  selected: number | null;
  result: QuizResult;
}

export function QuizSession({
  title,
  questions,
  seed,
  shuffleChoices,
  onRecord,
  onExit,
  onRestart,
}: QuizSessionProps) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [revealed, setRevealed] = useState(false);
  const [finished, setFinished] = useState(false);

  const question = questions[index];
  const presented = useMemo(
    () => (question ? presentQuestion(question, { shuffle: shuffleChoices, seed }) : null),
    [question, seed, shuffleChoices],
  );
  const answer = question ? answers[question.id] : undefined;
  const answeredCount = Object.keys(answers).length;
  const correctCount = Object.values(answers).filter((a) => a.result === "correct").length;

  function record(result: QuizResult, selected: number | null) {
    if (!question || answers[question.id]) return;
    setAnswers((prev) => ({ ...prev, [question.id]: { selected, result } }));
    onRecord(question.id, result);
  }

  function next() {
    setRevealed(false);
    if (index < questions.length - 1) setIndex((i) => i + 1);
    else setFinished(true);
  }

  if (finished || !question || !presented) {
    const pct = Math.round((correctCount / (answeredCount || 1)) * 100);
    const missedQuestions = questions.filter((q) => answers[q.id]?.result === "incorrect");
    return (
      <div className="flex min-h-dvh flex-col items-center px-4 py-6 pb-24 md:justify-center md:pb-10">
        <div className="w-full max-w-lg animate-scale-in rounded-2xl border border-ivory-dark bg-white p-5 shadow-lg md:p-8">
          <h2 className="text-center font-[DM_Serif_Display] text-2xl text-navy md:text-3xl">
            {pct >= 80 ? "Excellent!" : pct >= 60 ? "Good Effort!" : "Keep Studying!"}
          </h2>
          <p className="mt-2 text-center text-sm text-warm-gray">{title}</p>
          <div className="mt-6 text-center">
            <p className="text-4xl font-bold text-navy">{pct}%</p>
            <p className="text-xs text-warm-gray">
              {correctCount} of {answeredCount} correct
            </p>
          </div>

          {missedQuestions.length > 0 && (
            <div className="mt-6 max-h-[40vh] space-y-2 overflow-auto md:max-h-72">
              {missedQuestions.map((q) => {
                const shown = presentQuestion(q, { shuffle: shuffleChoices, seed });
                return (
                  <div key={q.id} className="rounded-lg border border-coral/30 bg-coral/5 p-3">
                    <p className="text-xs font-medium text-navy">
                      Q{q.position}: {q.question}
                    </p>
                    <p className="mt-1 text-[11px] text-sage-dark">
                      Answer:{" "}
                      {isMultipleChoice(q) && shown.correctIndex !== null
                        ? `${optionLetter(shown.correctIndex)}. ${shown.options[shown.correctIndex]}`
                        : q.answer}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-6 flex flex-col gap-3">
            {missedQuestions.length > 0 && (
              <button
                onClick={() => onRestart(missedQuestions)}
                className="w-full rounded-lg border border-coral bg-coral/5 py-3.5 text-sm font-semibold text-coral transition-colors hover:bg-coral/10"
              >
                Retry the {missedQuestions.length} you missed
              </button>
            )}
            <button
              onClick={() => onRestart(questions)}
              className="w-full rounded-lg bg-navy py-3.5 text-sm font-semibold text-white transition-colors hover:bg-navy-light"
            >
              Retake these {questions.length}
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
  const showFeedback = Boolean(answer) || (!mcq && revealed);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-ivory-dark bg-white px-3 py-3 md:px-4">
        <div className="flex min-w-0 items-center gap-2 md:gap-3">
          <button
            onClick={onExit}
            aria-label="Back to question set"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-warm-gray transition-colors hover:bg-ivory hover:text-navy"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <h1 className="truncate font-[DM_Serif_Display] text-base text-navy">{title} &middot; Quiz</h1>
            <p className="text-[11px] text-warm-gray">
              Question {index + 1} of {questions.length}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs">
          <span className="flex items-center gap-1 text-sage">
            <CheckCircle2 size={14} /> {correctCount}
          </span>
          <span className="text-warm-gray-light">/</span>
          <span className="text-warm-gray">{answeredCount}</span>
        </div>
      </header>

      <div className="h-1 bg-ivory-dark">
        <div
          className="h-full bg-coral transition-all duration-300"
          style={{ width: `${((index + 1) / questions.length) * 100}%` }}
        />
      </div>

      <div className="flex flex-1 flex-col overflow-auto px-4 py-4 pb-2 md:items-center md:px-8 md:py-6">
        <div className="w-full max-w-2xl">
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

          <h2 className="mt-3 font-[DM_Serif_Display] text-lg leading-relaxed text-navy md:mt-4 md:text-2xl">
            {question.question}
          </h2>

          {mcq ? (
            <div className="mt-5 space-y-3 md:mt-7">
              {presented.options.map((option, optionIndex) => {
                const isSelected = answer?.selected === optionIndex;
                const isCorrect = optionIndex === presented.correctIndex;
                let style = "border-ivory-dark bg-white hover:border-coral/30 hover:bg-coral/5";
                if (answer) {
                  if (isCorrect) style = "border-sage bg-sage/10";
                  else if (isSelected) style = "border-coral bg-coral/10";
                  else style = "border-ivory-dark bg-white opacity-60";
                }

                return (
                  <button
                    key={optionIndex}
                    onClick={() => record(isCorrect ? "correct" : "incorrect", optionIndex)}
                    disabled={Boolean(answer)}
                    className={`flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-all active:scale-[0.98] md:gap-4 md:p-4 ${style}`}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                        answer && isCorrect
                          ? "bg-sage text-white"
                          : answer && isSelected
                            ? "bg-coral text-white"
                            : "bg-ivory text-navy"
                      }`}
                    >
                      {answer && isCorrect ? (
                        <CheckCircle2 size={16} />
                      ) : answer && isSelected ? (
                        <XCircle size={16} />
                      ) : (
                        optionLetter(optionIndex)
                      )}
                    </span>
                    <p className="pt-1 text-sm leading-relaxed text-navy md:text-base">{option}</p>
                  </button>
                );
              })}
            </div>
          ) : (
            !revealed && (
              <button
                onClick={() => setRevealed(true)}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-warm-gray-light bg-white px-4 py-6 text-sm font-semibold text-navy transition hover:border-coral/40 hover:bg-coral/5"
              >
                <Eye size={16} /> Say your answer, then reveal
              </button>
            )
          )}

          {showFeedback && (
            <div
              className={`mt-5 animate-fade-in-up rounded-xl border p-4 md:mt-6 ${
                answer?.result === "incorrect" ? "border-coral/30 bg-coral/5" : "border-sage/30 bg-sage/5"
              }`}
            >
              <p
                className={`text-xs font-semibold uppercase tracking-wider ${
                  answer?.result === "incorrect" ? "text-coral-dark" : "text-sage-dark"
                }`}
              >
                {mcq ? (answer?.result === "correct" ? "Correct" : "Not quite") : "Answer"}
              </p>
              <p className="mt-1.5 font-semibold text-navy">
                {mcq && presented.correctIndex !== null
                  ? `${optionLetter(presented.correctIndex)}. ${presented.options[presented.correctIndex]}`
                  : question.answer}
              </p>
              <div className="mt-3">
                <ExplanationAndPearl explanation={question.explanation} pearl={question.pearl} />
              </div>

              {!mcq && !answer && (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => record("incorrect", null)}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-coral bg-white py-2.5 text-sm font-semibold text-coral transition hover:bg-coral/10"
                  >
                    <XCircle size={15} /> I missed it
                  </button>
                  <button
                    onClick={() => record("correct", null)}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-sage bg-white py-2.5 text-sm font-semibold text-sage-dark transition hover:bg-sage/10"
                  >
                    <CheckCircle2 size={15} /> I knew it
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="sticky bottom-16 z-10 border-t border-ivory-dark bg-white px-4 py-3 md:bottom-0">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <span className="text-xs text-warm-gray">
            {index + 1} of {questions.length}
          </span>
          <button
            onClick={next}
            disabled={!answer}
            className="flex items-center gap-2 rounded-lg bg-coral px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-coral-dark active:scale-95 disabled:bg-ivory-dark disabled:text-warm-gray"
          >
            {index === questions.length - 1 ? "Finish" : "Next"}
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
