import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { collectSupabasePages } from "@/lib/supabase/paginate";

export async function GET() {
  const contentDb = getServiceClient();
  const userDb = await createServerSupabaseClient();
  const {
    data: { user },
  } = await userDb.auth.getUser();

  if (!user) {
    return NextResponse.json({
      authenticated: false,
      docsReviewed: 0,
      cardsMastered: 0,
      totalFlashcards: 0,
      mcqsCompleted: 0,
      avgScore: 0,
      streak: 0,
      categoryProgress: {},
      categoryDocCounts: {},
      dueToday: [],
      weakAreas: [],
      recentQuizzes: [],
      totalDocs: 0,
      highlightsSaved: 0,
    });
  }

  const [
    docsRes,
    flashcardCountRes,
    contentCountsRes,
    mcqTotalRes,
    userProgressRes,
    sessionsRes,
    recentSessionsRes,
    highlightsRes,
  ] = await Promise.all([
    contentDb.from("documents").select("id, title, category"),
    contentDb.from("flashcards").select("id", { count: "exact", head: true }),
    contentDb
      .from("document_content_counts")
      .select("document_id, flashcard_count"),
    contentDb.from("mcq_questions").select("id", { count: "exact", head: true }),
    collectSupabasePages<{
      flashcard_id: string;
      document_id: string;
      status: string;
      next_review: string | null;
      last_reviewed: string | null;
    }>((from, to) =>
      userDb
        .from("user_flashcard_progress")
        .select("flashcard_id, document_id, status, next_review, last_reviewed")
        .range(from, to)
    ),
    collectSupabasePages<{
      id: string;
      document_id: string;
      total_questions: number;
      correct_count: number;
      score_pct: number;
      completed_at: string;
    }>((from, to) =>
      userDb
        .from("user_quiz_sessions")
        .select("id, document_id, total_questions, correct_count, score_pct, completed_at")
        .range(from, to)
    ),
    userDb
      .from("user_quiz_sessions")
      .select("id, document_id, score_pct, completed_at")
      .order("completed_at", { ascending: false })
      .limit(10),
    userDb.from("user_pdf_highlights").select("id", { count: "exact", head: true }),
  ]);

  if (
    docsRes.error || flashcardCountRes.error || contentCountsRes.error || mcqTotalRes.error ||
    userProgressRes.error || sessionsRes.error || recentSessionsRes.error || highlightsRes.error
  ) {
    return NextResponse.json({ error: "Unable to load progress" }, { status: 503 });
  }

  const docs = docsRes.data || [];
  const docMap = Object.fromEntries(docs.map((doc) => [doc.id, doc]));
  const flashcardTotalsByDocument = new Map(
    (contentCountsRes.data || []).map((entry) => [
      entry.document_id,
      Number(entry.flashcard_count),
    ]),
  );
  const userProgress = userProgressRes.data || [];
  const sessions = sessionsRes.data || [];

  const totalFlashcards = flashcardCountRes.count || 0;
  const masteredCards = userProgress.filter((entry) => entry.status === "mastered").length;
  const totalMcqsAnswered = sessions.reduce(
    (sum, session) => sum + session.total_questions,
    0
  );
  const totalMcqsCorrect = sessions.reduce(
    (sum, session) => sum + session.correct_count,
    0
  );
  const avgScore =
    totalMcqsAnswered > 0
      ? Math.round((totalMcqsCorrect / totalMcqsAnswered) * 100)
      : 0;

  const docsWithSessions = new Set(sessions.map((session) => session.document_id));
  const docsWithReviewedCards = new Set(
    userProgress.filter((entry) => entry.status !== "new").map((entry) => entry.document_id)
  );
  const docsReviewed = new Set([...docsWithSessions, ...docsWithReviewedCards]);

  const streakDates = new Set<string>();
  sessions.forEach((session) => {
    streakDates.add(new Date(session.completed_at).toISOString().split("T")[0]);
  });
  userProgress.forEach((entry) => {
    if (entry.last_reviewed) {
      streakDates.add(new Date(entry.last_reviewed).toISOString().split("T")[0]);
    }
  });

  let streak = 0;
  if (streakDates.size > 0) {
    const checkDate = new Date();
    checkDate.setHours(0, 0, 0, 0);

    const hasDate = (date: Date) => streakDates.has(date.toISOString().split("T")[0]);
    if (!hasDate(checkDate)) {
      checkDate.setDate(checkDate.getDate() - 1);
    }

    while (hasDate(checkDate)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }
  }

  const categoryDocCounts: Record<string, number> = {};
  const docIdsByCategory: Record<string, string[]> = {};
  for (const doc of docs) {
    categoryDocCounts[doc.category] = (categoryDocCounts[doc.category] || 0) + 1;
    if (!docIdsByCategory[doc.category]) docIdsByCategory[doc.category] = [];
    docIdsByCategory[doc.category].push(doc.id);
  }

  const categoryProgress: Record<string, number> = {};
  for (const [category, docIds] of Object.entries(docIdsByCategory)) {
    const categoryCardCount = docIds.reduce(
      (sum, documentId) => sum + (flashcardTotalsByDocument.get(documentId) ?? 0),
      0,
    );
    if (categoryCardCount === 0) {
      categoryProgress[category] = 0;
      continue;
    }

    const categoryDocumentIds = new Set(docIds);
    const learnedCards = userProgress.filter(
      (entry) =>
        categoryDocumentIds.has(entry.document_id) &&
        (entry.status === "learning" || entry.status === "mastered"),
    ).length;

    categoryProgress[category] = Math.round(
      (learnedCards / categoryCardCount) * 100
    );
  }

  const dueByDoc: Record<string, number> = {};
  for (const progress of userProgress) {
    if (progress.status === "mastered") continue;
    if (progress.next_review && new Date(progress.next_review) > new Date()) continue;
    dueByDoc[progress.document_id] = (dueByDoc[progress.document_id] || 0) + 1;
  }

  const dueToday = Object.entries(dueByDoc)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([docId, cards]) => ({
      docId,
      title: docMap[docId]?.title || "Unknown",
      cards,
    }));

  const docScores: Record<string, { total: number; count: number }> = {};
  for (const session of sessions) {
    if (!docScores[session.document_id]) {
      docScores[session.document_id] = { total: 0, count: 0 };
    }
    docScores[session.document_id].total += session.score_pct;
    docScores[session.document_id].count++;
  }

  const weakAreas = Object.entries(docScores)
    .map(([docId, { total, count }]) => ({
      docId,
      title: docMap[docId]?.title || "Unknown",
      category: docMap[docId]?.category || "Other",
      score: Math.round(total / count),
    }))
    .filter((item) => item.score < 80)
    .sort((a, b) => a.score - b.score)
    .slice(0, 5);

  const recentQuizzes = (recentSessionsRes.data || []).map((session) => ({
    docId: session.document_id,
    title: docMap[session.document_id]?.title || "Unknown",
    score: session.score_pct,
    date: new Date(session.completed_at).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
  }));

  return NextResponse.json({
    authenticated: true,
    docsReviewed: docsReviewed.size,
    cardsMastered: masteredCards,
    totalFlashcards,
    mcqsCompleted: totalMcqsAnswered,
    avgScore,
    streak,
    categoryProgress,
    categoryDocCounts,
    dueToday,
    weakAreas,
    recentQuizzes,
    totalDocs: docs.length,
    highlightsSaved: highlightsRes.count || 0,
    totalMcqBank: mcqTotalRes.count || 0,
  });
}
