import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  const contentDb = getServiceClient();
  const userDb = await createServerSupabaseClient();
  const {
    data: { user },
  } = await userDb.auth.getUser();

  const [docsRes, flashcardsRes, mcqRes, sessionsRes, progressRes] = await Promise.all([
    contentDb
      .from("documents")
      .select("id, title, category, page_count, storage_path, created_at")
      .order("category")
      .order("title"),
    contentDb.from("flashcards").select("id, document_id"),
    contentDb.from("mcq_questions").select("id, document_id"),
    user
      ? userDb.from("user_quiz_sessions").select("document_id")
      : Promise.resolve({ data: [], error: null }),
    user
      ? userDb.from("user_flashcard_progress").select("document_id, status")
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (docsRes.error) {
    return NextResponse.json({ error: docsRes.error.message }, { status: 500 });
  }

  const flashcardsByDoc: Record<string, { total: number; mastered: number }> = {};
  for (const flashcard of flashcardsRes.data || []) {
    if (!flashcardsByDoc[flashcard.document_id]) {
      flashcardsByDoc[flashcard.document_id] = { total: 0, mastered: 0 };
    }
    flashcardsByDoc[flashcard.document_id].total++;
  }

  for (const progress of progressRes.data || []) {
    if (!flashcardsByDoc[progress.document_id]) {
      flashcardsByDoc[progress.document_id] = { total: 0, mastered: 0 };
    }

    if (progress.status === "mastered" || progress.status === "learning") {
      flashcardsByDoc[progress.document_id].mastered++;
    }
  }

  const mcqByDoc: Record<string, number> = {};
  for (const question of mcqRes.data || []) {
    mcqByDoc[question.document_id] = (mcqByDoc[question.document_id] || 0) + 1;
  }

  const docsWithSessions = new Set(
    (sessionsRes.data || []).map((session) => session.document_id)
  );

  const enriched = (docsRes.data || []).map((doc) => {
    const flashcardMeta = flashcardsByDoc[doc.id];
    const flashcardCount = flashcardMeta?.total || 0;
    const masteredCount = user ? flashcardMeta?.mastered || 0 : 0;
    const hasSessions = docsWithSessions.has(doc.id);
    const progress =
      user && flashcardCount > 0
        ? Math.round((masteredCount / flashcardCount) * 100)
        : 0;

    let status: "not_started" | "in_progress" | "reviewed" = "not_started";
    if (progress >= 80 && hasSessions) status = "reviewed";
    else if (masteredCount > 0 || hasSessions) status = "in_progress";

    return {
      ...doc,
      flashcard_count: flashcardCount,
      mcq_count: mcqByDoc[doc.id] || 0,
      status,
      progress,
    };
  });

  return NextResponse.json(enriched, {
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}
