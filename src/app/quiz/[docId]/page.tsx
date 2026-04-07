"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
  XCircle,
  Lightbulb,
  RotateCcw,
  Loader2,
} from "lucide-react";
import { use } from "react";
import { useAuthSession } from "@/hooks/use-auth-session";
import { UserFeatureSlot } from "@/components/user-feature-slot";

type ExamMode = "practice" | "timed";
type QuizState = "setup" | "active" | "review";

interface MCQ {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
}

export default function QuizPage({
  params,
}: {
  params: Promise<{ docId: string }>;
}) {
  const { docId } = use(params);
  const { user } = useAuthSession();
  const [doc, setDoc] = useState<{ title: string } | null>(null);
  const [questions, setQuestions] = useState<MCQ[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/documents/${docId}`).then((r) => r.json()),
      fetch(`/api/mcqs?docId=${docId}`).then((r) => r.json()),
    ])
      .then(([docData, mcqData]) => {
        setDoc({ title: docData.title || "Quiz" });
        const mapped = (Array.isArray(mcqData) ? mcqData : []).map(
          (q: {
            id: string;
            question: string;
            option_a: string;
            option_b: string;
            option_c: string;
            correct_index: number;
            explanation: string;
            difficulty: string;
          }) => ({
            id: q.id,
            question: q.question,
            options: [q.option_a, q.option_b, q.option_c],
            correctIndex: q.correct_index,
            explanation: q.explanation || "",
            difficulty: (q.difficulty || "medium") as MCQ["difficulty"],
          })
        );
        setQuestions(mapped);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [docId]);

  const [quizState, setQuizState] = useState<QuizState>("setup");
  const [mode, setMode] = useState<ExamMode>("practice");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<
    Record<string, number>
  >({});
  const [showExplanation, setShowExplanation] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const question = questions[currentIndex];
  const selected = question ? selectedAnswers[question.id] : undefined;
  const isAnswered = selected !== undefined;

  const correctCount = Object.entries(selectedAnswers).filter(
    ([qId, ans]) => questions.find((q) => q.id === qId)?.correctIndex === ans
  ).length;

  const handleSelect = useCallback(
    (optionIndex: number) => {
      if (!question) return;
      if (mode === "practice" && isAnswered) return;
      setSelectedAnswers((prev) => ({ ...prev, [question.id]: optionIndex }));
      if (mode === "practice") {
        setShowExplanation(true);
      }
    },
    [question, mode, isAnswered]
  );

  const saveSession = useCallback(
    (answers: Record<string, number>) => {
      const total = Object.keys(answers).length;
      const correct = Object.entries(answers).filter(
        ([qId, ans]) => questions.find((q) => q.id === qId)?.correctIndex === ans
      ).length;

      fetch("/api/quiz-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_id: docId,
          total_questions: total,
          correct_count: correct,
          mode,
        }),
      })
        .then((response) => {
          if (response.status === 401) {
            setSaveNotice("Sign in to save quiz history and scores to your account.");
          }
        })
        .catch(() => {});
    },
    [docId, mode, questions]
  );

  const handleNext = () => {
    setShowExplanation(false);
    setShowHint(false);
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      saveSession(selectedAnswers);
      setQuizState("review");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-coral" />
        <span className="ml-3 text-warm-gray">Loading quiz questions...</span>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-4">
        <p className="font-[DM_Serif_Display] text-2xl text-navy">
          No questions yet
        </p>
        <p className="mt-2 text-sm text-warm-gray">
          MCQs for this document are being generated. Check back soon!
        </p>
        <Link
          href="/"
          className="mt-6 rounded-lg bg-navy px-6 py-3 text-sm font-semibold text-white"
        >
          Back to Library
        </Link>
      </div>
    );
  }

  if (quizState === "setup") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-md animate-fade-in-up">
          <div className="rounded-2xl border border-ivory-dark bg-white p-8 shadow-lg">
            <h1 className="font-[DM_Serif_Display] text-2xl text-navy md:text-3xl">
              Board-Style Quiz
            </h1>
            <p className="mt-2 text-sm text-warm-gray">{doc?.title}</p>
            <p className="mt-1 text-xs text-warm-gray-light">
              {questions.length} questions &middot; 3 options each
            </p>

            {!user && (
              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">
                Take the quiz freely, but sign in if you want your scores and streak to persist.
              </div>
            )}

            {saveNotice && (
              <div className="mt-5 rounded-2xl border border-coral/20 bg-coral/8 px-4 py-3 text-xs font-medium text-coral-dark">
                {saveNotice}
              </div>
            )}

            <div className="mt-8 space-y-3">
              <button
                onClick={() => {
                  setMode("practice");
                  setQuizState("active");
                }}
                className="flex w-full items-center gap-4 rounded-xl border border-ivory-dark bg-white p-4 text-left transition-all hover:border-coral/30 hover:shadow-sm active:scale-[0.98]"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-coral/10">
                  <Lightbulb size={22} className="text-coral" />
                </div>
                <div>
                  <p className="font-semibold text-navy">Practice Mode</p>
                  <p className="text-xs text-warm-gray">
                    See answers &amp; explanations after each question
                  </p>
                </div>
              </button>

              <button
                onClick={() => {
                  setMode("timed");
                  setQuizState("active");
                }}
                className="flex w-full items-center gap-4 rounded-xl border border-ivory-dark bg-white p-4 text-left transition-all hover:border-coral/30 hover:shadow-sm active:scale-[0.98]"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-navy/5">
                  <Clock size={22} className="text-navy" />
                </div>
                <div>
                  <p className="font-semibold text-navy">Timed Exam</p>
                  <p className="text-xs text-warm-gray">
                    All questions, then review results at the end
                  </p>
                </div>
              </button>
            </div>

            <Link
              href="/"
              className="mt-6 block text-center text-sm font-medium text-warm-gray hover:text-navy"
            >
              Back to Library
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (quizState === "review") {
    const total = Object.keys(selectedAnswers).length;
    const pct = Math.round((correctCount / (total || 1)) * 100);
    return (
      <div className="flex min-h-dvh flex-col items-center px-4 py-6 pb-24 md:justify-center md:pb-10">
        <div className="w-full max-w-lg animate-scale-in">
          <div className="rounded-2xl border border-ivory-dark bg-white p-5 shadow-lg md:p-8">
            <h2 className="text-center font-[DM_Serif_Display] text-2xl text-navy md:text-3xl">
              {pct >= 80
                ? "Excellent!"
                : pct >= 60
                  ? "Good Effort!"
                  : "Keep Studying!"}
            </h2>
            <p className="mt-2 text-center text-sm text-warm-gray line-clamp-2">
              {doc?.title}
            </p>

            <div className="mt-6 flex justify-center md:mt-8">
              <div className="relative flex h-28 w-28 items-center justify-center md:h-32 md:w-32">
                <svg
                  className="absolute inset-0 -rotate-90"
                  viewBox="0 0 100 100"
                >
                  <circle
                    cx="50"
                    cy="50"
                    r="44"
                    fill="none"
                    stroke="#E8E2D6"
                    strokeWidth="6"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="44"
                    fill="none"
                    stroke={
                      pct >= 80
                        ? "#7A9E7E"
                        : pct >= 60
                          ? "#E8654A"
                          : "#C94E34"
                    }
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={`${pct * 2.76} ${276 - pct * 2.76}`}
                  />
                </svg>
                <div className="text-center">
                  <p className="text-2xl font-bold text-navy md:text-3xl">{pct}%</p>
                  <p className="text-xs text-warm-gray">
                    {correctCount}/{total}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 max-h-[40vh] space-y-2 overflow-auto md:mt-8 md:max-h-64">
              {questions.map((q, i) => {
                const ans = selectedAnswers[q.id];
                const correct = ans === q.correctIndex;
                return (
                  <div
                    key={q.id}
                    className={`flex items-start gap-3 rounded-lg border p-3 ${
                      correct
                        ? "border-sage/30 bg-sage/5"
                        : "border-coral/30 bg-coral/5"
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {correct ? (
                        <CheckCircle2 size={16} className="text-sage" />
                      ) : (
                        <XCircle size={16} className="text-coral" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-navy line-clamp-2">
                        Q{i + 1}: {q.question}
                      </p>
                      {!correct && (
                        <p className="mt-1 text-[11px] text-sage-dark">
                          Correct:{" "}
                          {String.fromCharCode(65 + q.correctIndex)}.{" "}
                          {q.options[q.correctIndex]}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex flex-col gap-3 md:mt-8">
              <button
                onClick={() => {
                  setQuizState("active");
                  setCurrentIndex(0);
                  setSelectedAnswers({});
                  setShowExplanation(false);
                }}
                className="w-full rounded-lg bg-navy py-3.5 text-sm font-semibold text-white transition-colors hover:bg-navy-light active:scale-[0.98]"
              >
                <RotateCcw size={14} className="mr-2 inline" />
                Retake Quiz
              </button>
              <Link
                href="/"
                className="w-full rounded-lg border border-ivory-dark py-3.5 text-center text-sm font-semibold text-warm-gray transition-colors hover:bg-ivory active:scale-[0.98]"
              >
                Back to Library
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-ivory-dark bg-white px-3 py-3 md:px-4">
        <div className="flex items-center gap-2 md:gap-3">
          <button
            onClick={() => setQuizState("setup")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-warm-gray hover:bg-ivory hover:text-navy transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <h1 className="truncate font-[DM_Serif_Display] text-base text-navy">
              {mode === "practice" ? "Practice" : "Timed Exam"}
            </h1>
            <p className="text-[11px] text-warm-gray">
              Question {currentIndex + 1} of {questions.length}
            </p>
          </div>
        </div>

        {mode === "timed" && (
          <div className="flex shrink-0 items-center gap-1.5 rounded-lg bg-navy/5 px-3 py-1.5 text-xs font-medium text-navy">
            <Clock size={14} />
            <span>--:--</span>
          </div>
        )}

        <div className="flex shrink-0 items-center gap-2 text-xs">
          <span className="flex items-center gap-1 text-sage">
            <CheckCircle2 size={14} /> {correctCount}
          </span>
          <span className="text-warm-gray-light">/</span>
          <span className="text-warm-gray">
            {Object.keys(selectedAnswers).length}
          </span>
        </div>
      </header>

      <div className="h-1 bg-ivory-dark">
        <div
          className="h-full bg-coral transition-all duration-300"
          style={{
            width: `${((currentIndex + 1) / questions.length) * 100}%`,
          }}
        />
      </div>

      <div className="flex flex-1 flex-col overflow-auto px-4 py-4 pb-2 md:items-center md:px-8 md:py-6">
        <div className="w-full max-w-2xl">
          <UserFeatureSlot name="quiz-controls" />
          {question && (
            <>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                  question.difficulty === "easy"
                    ? "bg-sage/15 text-sage-dark"
                    : question.difficulty === "medium"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-coral/10 text-coral"
                }`}
              >
                {question.difficulty}
              </span>

              <h2 className="mt-3 font-[DM_Serif_Display] text-lg leading-relaxed text-navy md:mt-4 md:text-2xl">
                {question.question}
              </h2>

              <div className="mt-5 space-y-3 md:mt-8">
                {question.options.map((option, i) => {
                  const letter = String.fromCharCode(65 + i);
                  const isSelected = selected === i;
                  const isCorrect = i === question.correctIndex;
                  const showCorrectness = mode === "practice" && isAnswered;

                  let optionStyle =
                    "border-ivory-dark bg-white hover:border-coral/30 hover:bg-coral/5";
                  if (showCorrectness) {
                    if (isCorrect) {
                      optionStyle = "border-sage bg-sage/10";
                    } else if (isSelected && !isCorrect) {
                      optionStyle = "border-coral bg-coral/10";
                    } else {
                      optionStyle = "border-ivory-dark bg-white opacity-60";
                    }
                  } else if (isSelected) {
                    optionStyle =
                      "border-coral bg-coral/5 ring-2 ring-coral/20";
                  }

                  return (
                    <button
                      key={i}
                      onClick={() => handleSelect(i)}
                      disabled={mode === "practice" && isAnswered}
                      className={`flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-all active:scale-[0.98] md:gap-4 md:p-4 ${optionStyle}`}
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                          showCorrectness && isCorrect
                            ? "bg-sage text-white"
                            : showCorrectness && isSelected && !isCorrect
                              ? "bg-coral text-white"
                              : isSelected
                                ? "bg-coral text-white"
                                : "bg-ivory text-navy"
                        }`}
                      >
                        {showCorrectness && isCorrect ? (
                          <CheckCircle2 size={16} />
                        ) : showCorrectness && isSelected && !isCorrect ? (
                          <XCircle size={16} />
                        ) : (
                          letter
                        )}
                      </span>
                      <p className="pt-1 text-sm leading-relaxed text-navy md:text-base">
                        {option}
                      </p>
                    </button>
                  );
                })}
              </div>

              {showExplanation && mode === "practice" && (
                <div className="mt-4 animate-fade-in-up rounded-xl border border-sage/30 bg-sage/5 p-4 md:mt-6">
                  <p className="text-xs font-semibold uppercase tracking-wider text-sage-dark">
                    Explanation
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-navy">
                    {question.explanation}
                  </p>
                </div>
              )}

              {!isAnswered && !showHint && (
                <button
                  onClick={() => setShowHint(true)}
                  className="mt-4 flex items-center gap-1.5 py-1 text-xs font-medium text-warm-gray hover:text-coral"
                >
                  <Lightbulb size={14} /> Need a hint?
                </button>
              )}
              {showHint && !isAnswered && (
                <div className="mt-4 animate-fade-in-up rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-xs text-amber-800">
                    Think about the anatomical relationships and clinical
                    presentation described. Consider the urgency based on the
                    signs and symptoms.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="sticky bottom-0 z-10 border-t border-ivory-dark bg-white px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <span className="text-xs text-warm-gray">
            {currentIndex + 1} of {questions.length}
          </span>
          <button
            onClick={handleNext}
            disabled={!isAnswered && mode === "practice"}
            className="flex items-center gap-2 rounded-lg bg-coral px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-coral-dark disabled:bg-ivory-dark disabled:text-warm-gray active:scale-95"
          >
            {currentIndex === questions.length - 1 ? "Finish" : "Next"}
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
