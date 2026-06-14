import { NextResponse } from "next/server";
import { createOpenAIOralExamTurn } from "@/features/oral-exam/openai-turn";
import {
  handleOralExamTurn,
  type OralExamState,
} from "@/features/oral-exam/oral-exam";

type TurnRequestBody = {
  oralCaseId?: string;
  state?: OralExamState;
  userText?: string;
  transcript?: Array<{ role: "examiner" | "candidate"; text: string }>;
};

export async function POST(request: Request) {
  const body = (await request.json()) as TurnRequestBody;

  if (!body.oralCaseId || !body.state || !body.userText) {
    return NextResponse.json(
      { error: "Missing oralCaseId, state, or userText." },
      { status: 400 }
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const fallback = () =>
    handleOralExamTurn({
      oralCaseId: body.oralCaseId!,
      state: body.state!,
      userText: body.userText!,
    });

  if (!apiKey) {
    return NextResponse.json(fallback());
  }

  try {
    const result = await createOpenAIOralExamTurn({
      apiKey,
      oralCaseId: body.oralCaseId,
      state: body.state,
      userText: body.userText,
      transcript: body.transcript ?? [],
      model: process.env.OPENAI_ORAL_EXAM_MODEL,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("OpenAI oral exam turn failed:", error);
    return NextResponse.json(fallback());
  }
}
