"use client";

import { use } from "react";
import { QuestionSetPage } from "@/features/private-question-sets/question-set-page";

export default function PrivateQuestionSetRoute({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ mode?: string | string[] }>;
}) {
  const { slug } = use(params);
  const { mode } = use(searchParams);
  const initialMode = mode === "cards" || mode === "quiz" ? mode : null;

  return <QuestionSetPage key={`${slug}:${initialMode ?? ""}`} slug={slug} initialMode={initialMode} />;
}
