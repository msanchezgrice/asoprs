import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createFakeSupabase } from "@/test/fake-supabase";

let fake = createFakeSupabase({ user: null, tables: {} });

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => fake.client),
}));

vi.mock("@/lib/api-security", () => ({
  requireSameOrigin: vi.fn().mockReturnValue(null),
  rejectOversizedBody: vi.fn().mockReturnValue(null),
  enforceRateLimit: vi.fn().mockResolvedValue(null),
}));

import { GET as listSets } from "./route";
import { GET as getSet } from "./[slug]/route";
import { POST as postProgress } from "./[slug]/progress/route";

const SET_ID = "11111111-1111-4111-8111-111111111111";
const Q1 = "22222222-2222-4222-8222-222222222222";
const Q2 = "33333333-3333-4333-8333-333333333333";
const OTHER_Q = "44444444-4444-4444-8444-444444444444";
const USER_ID = "55555555-5555-4555-8555-555555555555";

// Tables as the granted user would see them through RLS.
const GRANTED_TABLES = {
  private_question_sets: [
    {
      id: SET_ID,
      slug: "added-questions",
      title: "Added Questions",
      description: "desc",
      extras: { memorize_first: ["Fact one", 2, "Fact two"] },
      created_at: 1,
    },
  ],
  private_questions: [
    {
      id: Q2,
      set_id: SET_ID,
      position: 2,
      section: "Pearls",
      question: "Recall?",
      options: [],
      correct_index: null,
      answer: "Recall answer",
      explanation: null,
      pearl: null,
    },
    {
      id: Q1,
      set_id: SET_ID,
      position: 1,
      section: "Ptosis",
      question: "MCQ?",
      options: ["A1", "B1", "C1"],
      correct_index: 1,
      answer: "B1",
      explanation: "Because",
      pearl: "Pearl",
    },
  ],
  private_question_progress: [
    {
      user_id: USER_ID,
      set_id: SET_ID,
      question_id: Q1,
      card_result: "missed",
      quiz_result: null,
      quiz_attempts: 0,
      quiz_correct: 0,
    },
  ],
};

function progressRequest(body: unknown) {
  return new NextRequest("http://localhost/api/question-sets/added-questions/progress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const slugParams = (slug: string) => ({ params: Promise.resolve({ slug }) });

describe("/api/question-sets", () => {
  beforeEach(() => {
    fake = createFakeSupabase({ user: null, tables: {} });
  });

  it("returns an empty list to signed-out visitors", async () => {
    const response = await listSets();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it("returns an empty list to signed-in users without a grant", async () => {
    fake = createFakeSupabase({ user: { id: "someone-else" }, tables: {} });
    const response = await listSets();
    expect(await response.json()).toEqual([]);
  });

  it("summarizes granted sets with the caller's progress", async () => {
    fake = createFakeSupabase({ user: { id: USER_ID }, tables: GRANTED_TABLES });
    const response = await listSets();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual([
      {
        slug: "added-questions",
        title: "Added Questions",
        description: "desc",
        questionCount: 2,
        multipleChoiceCount: 1,
        recallCount: 1,
        reviewedCount: 1,
        missedCount: 1,
      },
    ]);
  });
});

describe("/api/question-sets/[slug]", () => {
  it("requires sign-in", async () => {
    fake = createFakeSupabase({ user: null, tables: GRANTED_TABLES });
    const response = await getSet(new NextRequest("http://localhost"), slugParams("added-questions"));
    expect(response.status).toBe(401);
  });

  it("returns 404 when the set is not visible to the caller", async () => {
    fake = createFakeSupabase({ user: { id: "someone-else" }, tables: {} });
    const response = await getSet(new NextRequest("http://localhost"), slugParams("added-questions"));
    expect(response.status).toBe(404);
  });

  it("rejects malformed slugs before querying", async () => {
    fake = createFakeSupabase({ user: { id: USER_ID }, tables: GRANTED_TABLES });
    const response = await getSet(new NextRequest("http://localhost"), slugParams("../etc"));
    expect(response.status).toBe(404);
  });

  it("returns ordered questions, memorize-first facts and progress", async () => {
    fake = createFakeSupabase({ user: { id: USER_ID }, tables: GRANTED_TABLES });
    const response = await getSet(new NextRequest("http://localhost"), slugParams("added-questions"));
    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(payload.title).toBe("Added Questions");
    expect(payload.memorizeFirst).toEqual(["Fact one", "Fact two"]);
    expect(payload.questions.map((q: { id: string }) => q.id)).toEqual([Q1, Q2]);
    expect(payload.questions[0]).toMatchObject({ options: ["A1", "B1", "C1"], correctIndex: 1, pearl: "Pearl" });
    expect(payload.questions[1]).toMatchObject({ options: [], correctIndex: null, answer: "Recall answer" });
    expect(payload.progress[Q1]).toEqual({ cardResult: "missed", quizResult: null, quizAttempts: 0, quizCorrect: 0 });
  });
});

describe("/api/question-sets/[slug]/progress", () => {
  it("requires sign-in", async () => {
    fake = createFakeSupabase({ user: null, tables: GRANTED_TABLES });
    const response = await postProgress(progressRequest({ questionId: Q1, cardResult: "got_it" }), slugParams("added-questions"));
    expect(response.status).toBe(401);
  });

  it("rejects invalid or ambiguous updates", async () => {
    fake = createFakeSupabase({ user: { id: USER_ID }, tables: GRANTED_TABLES });
    for (const body of [
      { questionId: "nope", cardResult: "got_it" },
      { questionId: Q1, cardResult: "maybe" },
      { questionId: Q1 },
      { questionId: Q1, cardResult: "got_it", quizResult: "correct" },
    ]) {
      const response = await postProgress(progressRequest(body), slugParams("added-questions"));
      expect(response.status).toBe(400);
    }
    expect(fake.upserts).toHaveLength(0);
  });

  it("refuses questions outside the caller's granted set", async () => {
    fake = createFakeSupabase({ user: { id: USER_ID }, tables: GRANTED_TABLES });
    const response = await postProgress(progressRequest({ questionId: OTHER_Q, quizResult: "correct" }), slugParams("added-questions"));
    expect(response.status).toBe(404);

    fake = createFakeSupabase({ user: { id: "someone-else" }, tables: {} });
    const denied = await postProgress(progressRequest({ questionId: Q1, quizResult: "correct" }), slugParams("added-questions"));
    expect(denied.status).toBe(404);
    expect(fake.upserts).toHaveLength(0);
  });

  it("merges the new result into existing progress", async () => {
    fake = createFakeSupabase({ user: { id: USER_ID }, tables: GRANTED_TABLES });
    const response = await postProgress(progressRequest({ questionId: Q1, quizResult: "correct" }), slugParams("added-questions"));
    expect(response.status).toBe(200);
    expect((await response.json()).progress).toEqual({
      cardResult: "missed",
      quizResult: "correct",
      quizAttempts: 1,
      quizCorrect: 1,
    });
    expect(fake.upserts).toHaveLength(1);
    expect(fake.upserts[0]).toMatchObject({
      table: "private_question_progress",
      onConflict: "user_id,question_id",
      values: {
        user_id: USER_ID,
        question_id: Q1,
        set_id: SET_ID,
        card_result: "missed",
        quiz_result: "correct",
        quiz_attempts: 1,
        quiz_correct: 1,
      },
    });
  });
});
