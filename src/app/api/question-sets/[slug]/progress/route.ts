import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { enforceRateLimit, rejectOversizedBody, requireSameOrigin } from "@/lib/api-security";
import {
  applyProgressUpdate,
  SLUG_RE,
  UUID_RE,
  type CardResult,
  type QuizResult,
} from "@/features/private-question-sets/question-set";
import {
  mapProgressRows,
  PRIVATE_NO_STORE,
  type PrivateQuestionProgressRow,
} from "@/features/private-question-sets/server";

const CARD_RESULTS: CardResult[] = ["got_it", "missed"];
const QUIZ_RESULTS: QuizResult[] = ["correct", "incorrect"];

// Records the caller's latest card/quiz outcome for one question.
// Every read and write goes through the user-scoped client, so RLS guarantees
// the caller can only touch their own rows on sets they were granted.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const requestError = requireSameOrigin(req) ?? rejectOversizedBody(req, 2_000);
  if (requestError) return requestError;

  const { slug } = await params;
  if (!SLUG_RE.test(slug) || slug.length > 80) {
    return NextResponse.json({ error: "Question set not found" }, { status: 404 });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    questionId?: unknown;
    cardResult?: unknown;
    quizResult?: unknown;
  } | null;

  const questionId = body?.questionId;
  const cardResult = body?.cardResult;
  const quizResult = body?.quizResult;

  const validCard = cardResult === undefined || CARD_RESULTS.includes(cardResult as CardResult);
  const validQuiz = quizResult === undefined || QUIZ_RESULTS.includes(quizResult as QuizResult);
  const exactlyOne = (cardResult === undefined) !== (quizResult === undefined);

  if (typeof questionId !== "string" || !UUID_RE.test(questionId) || !validCard || !validQuiz || !exactlyOne) {
    return NextResponse.json({ error: "Invalid progress update" }, { status: 400 });
  }

  const rateLimit = await enforceRateLimit(user.id, "private_question_progress_write", 2_000, 3_600);
  if (rateLimit) return rateLimit;

  const { data: set, error: setError } = await supabase
    .from("private_question_sets")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (setError) {
    return NextResponse.json({ error: "Unable to save progress" }, { status: 503 });
  }

  if (!set) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  const { data: question, error: questionError } = await supabase
    .from("private_questions")
    .select("id, set_id")
    .eq("id", questionId)
    .eq("set_id", set.id)
    .maybeSingle();

  if (questionError) {
    return NextResponse.json({ error: "Unable to save progress" }, { status: 503 });
  }

  if (!question) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  const { data: existing, error: existingError } = await supabase
    .from("private_question_progress")
    .select("question_id, card_result, quiz_result, quiz_attempts, quiz_correct")
    .eq("user_id", user.id)
    .eq("question_id", questionId)
    .maybeSingle<PrivateQuestionProgressRow>();

  if (existingError) {
    return NextResponse.json({ error: "Unable to save progress" }, { status: 503 });
  }

  const current = existing ? mapProgressRows([existing])[questionId] : undefined;
  const next = applyProgressUpdate(current, {
    cardResult: cardResult as CardResult | undefined,
    quizResult: quizResult as QuizResult | undefined,
  });

  const { error: writeError } = await supabase.from("private_question_progress").upsert(
    {
      user_id: user.id,
      question_id: questionId,
      set_id: question.set_id,
      card_result: next.cardResult,
      quiz_result: next.quizResult,
      quiz_attempts: next.quizAttempts,
      quiz_correct: next.quizCorrect,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,question_id" },
  );

  if (writeError) {
    return NextResponse.json({ error: "Unable to save progress" }, { status: 503 });
  }

  return NextResponse.json({ progress: next }, { headers: PRIVATE_NO_STORE });
}
