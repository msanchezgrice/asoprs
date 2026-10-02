import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { collectSupabasePages } from "@/lib/supabase/paginate";
import {
  SLUG_RE,
  type PrivateQuestionSetDetail,
} from "@/features/private-question-sets/question-set";
import {
  mapProgressRows,
  mapQuestionRow,
  PRIVATE_NO_STORE,
  readMemorizeFirst,
  type PrivateQuestionProgressRow,
  type PrivateQuestionRow,
} from "@/features/private-question-sets/server";

// Returns one private question set with its questions and the caller's progress.
// RLS on the user-scoped client is the access check: a set the caller was not
// granted is indistinguishable from one that does not exist.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug) || slug.length > 80) {
    return NextResponse.json({ error: "Question set not found" }, { status: 404 });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401, headers: PRIVATE_NO_STORE });
  }

  const { data: set, error: setError } = await supabase
    .from("private_question_sets")
    .select("id, slug, title, description, extras")
    .eq("slug", slug)
    .maybeSingle();

  if (setError) {
    return NextResponse.json({ error: "Unable to load question set" }, { status: 503 });
  }

  if (!set) {
    return NextResponse.json({ error: "Question set not found" }, { status: 404, headers: PRIVATE_NO_STORE });
  }

  const [questionsRes, progressRes] = await Promise.all([
    collectSupabasePages<PrivateQuestionRow>((from, to) =>
      supabase
        .from("private_questions")
        .select("id, position, section, question, options, correct_index, answer, explanation, pearl")
        .eq("set_id", set.id)
        .order("position")
        .range(from, to),
    ),
    collectSupabasePages<PrivateQuestionProgressRow>((from, to) =>
      supabase
        .from("private_question_progress")
        .select("question_id, card_result, quiz_result, quiz_attempts, quiz_correct")
        .eq("user_id", user.id)
        .eq("set_id", set.id)
        .range(from, to),
    ),
  ]);

  if (questionsRes.error || progressRes.error) {
    return NextResponse.json({ error: "Unable to load question set" }, { status: 503 });
  }

  const detail: PrivateQuestionSetDetail = {
    slug: set.slug as string,
    title: set.title as string,
    description: (set.description as string | null) ?? null,
    memorizeFirst: readMemorizeFirst(set.extras),
    questions: (questionsRes.data ?? []).map(mapQuestionRow),
    progress: mapProgressRows(progressRes.data ?? []),
  };

  return NextResponse.json(detail, { headers: PRIVATE_NO_STORE });
}
