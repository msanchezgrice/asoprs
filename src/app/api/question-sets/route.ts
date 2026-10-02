import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { collectSupabasePages } from "@/lib/supabase/paginate";
import type { PrivateQuestionSetSummary } from "@/features/private-question-sets/question-set";
import { PRIVATE_NO_STORE } from "@/features/private-question-sets/server";

// Lists the private question sets the signed-in user has been granted.
// Access is enforced by RLS on the user-scoped client; signed-out visitors and
// users without grants simply get an empty list.
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json([], { headers: PRIVATE_NO_STORE });
  }

  const { data: sets, error: setsError } = await supabase
    .from("private_question_sets")
    .select("id, slug, title, description")
    .order("created_at");

  if (setsError) {
    return NextResponse.json({ error: "Unable to load question sets" }, { status: 503 });
  }

  if (!sets?.length) {
    return NextResponse.json([], { headers: PRIVATE_NO_STORE });
  }

  const setIds = sets.map((set) => set.id as string);

  const [questionsRes, progressRes] = await Promise.all([
    collectSupabasePages<{ id: string; set_id: string; correct_index: number | null }>((from, to) =>
      supabase
        .from("private_questions")
        .select("id, set_id, correct_index")
        .in("set_id", setIds)
        .order("position")
        .range(from, to),
    ),
    collectSupabasePages<{ set_id: string; card_result: string | null; quiz_result: string | null }>(
      (from, to) =>
        supabase
          .from("private_question_progress")
          .select("set_id, card_result, quiz_result")
          .eq("user_id", user.id)
          .in("set_id", setIds)
          .range(from, to),
    ),
  ]);

  if (questionsRes.error || progressRes.error) {
    return NextResponse.json({ error: "Unable to load question sets" }, { status: 503 });
  }

  const summaries: PrivateQuestionSetSummary[] = sets.map((set) => {
    const questions = (questionsRes.data ?? []).filter((q) => q.set_id === set.id);
    const progress = (progressRes.data ?? []).filter((p) => p.set_id === set.id);
    const multipleChoiceCount = questions.filter((q) => q.correct_index !== null).length;

    return {
      slug: set.slug as string,
      title: set.title as string,
      description: (set.description as string | null) ?? null,
      questionCount: questions.length,
      multipleChoiceCount,
      recallCount: questions.length - multipleChoiceCount,
      reviewedCount: progress.filter((p) => p.card_result !== null || p.quiz_result !== null).length,
      missedCount: progress.filter((p) => p.card_result === "missed" || p.quiz_result === "incorrect")
        .length,
    };
  });

  return NextResponse.json(summaries, { headers: PRIVATE_NO_STORE });
}
