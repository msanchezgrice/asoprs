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

  const [docsRes, countsRes, sessionsRes, progressRes] = await Promise.all([
    contentDb
      .from("documents")
      .select("id, title, category, page_count, storage_path, created_at")
      .order("category")
      .order("title"),
    contentDb
      .from("document_content_counts")
      .select("document_id, flashcard_count, mcq_count"),
    user
      ? collectSupabasePages<{ document_id: string }>((from, to) =>
          userDb.from("user_quiz_sessions").select("document_id").range(from, to)
        )
      : Promise.resolve({ data: [], error: null }),
    user
      ? collectSupabasePages<{ document_id: string; status: string }>((from, to) =>
          userDb.from("user_flashcard_progress").select("document_id, status").range(from, to)
        )
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (docsRes.error || countsRes.error || sessionsRes.error || progressRes.error) {
    return NextResponse.json({ error: "Unable to load document library" }, { status: 503 });
  }

  const flashcardsByDoc: Record<string, { total: number; mastered: number }> = {};
  const mcqByDoc: Record<string, number> = {};
  for (const count of countsRes.data || []) {
    flashcardsByDoc[count.document_id] = {
      total: Number(count.flashcard_count),
      mastered: 0,
    };
    mcqByDoc[count.document_id] = Number(count.mcq_count);
  }

  for (const progress of progressRes.data || []) {
    if (!flashcardsByDoc[progress.document_id]) {
      flashcardsByDoc[progress.document_id] = { total: 0, mastered: 0 };
    }

    if (progress.status === "mastered" || progress.status === "learning") {
      flashcardsByDoc[progress.document_id].mastered++;
    }
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
