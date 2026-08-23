import { NextResponse } from "next/server";
import { createOpenAIOralExamTurn } from "@/features/oral-exam/openai-turn";
import {
  handleOralExamTurn,
  type OralExamState,
} from "@/features/oral-exam/oral-exam";
import {
  enforcePaidRateLimit,
  rejectOversizedBody,
  requireSameOrigin,
  requireUser,
} from "@/lib/api-security";

type TurnRequestBody = {
  oralCaseId?: string;
  state?: OralExamState;
  userText?: string;
  transcript?: Array<{ role: "examiner" | "candidate"; text: string }>;
};

export async function POST(request: Request) {
  const requestError = requireSameOrigin(request) ?? rejectOversizedBody(request, 64_000);
  if (requestError) return requestError;

  const auth = await requireUser({ verifiedEmail: true });
  if (!auth.ok) return auth.response;

  const rateLimit = await enforcePaidRateLimit(request, auth.user.id, "oral_exam_turn", {
    user: 30,
    ip: 60,
    global: 1_500,
    windowSeconds: 600,
  });
  if (rateLimit) return rateLimit;

  const body = (await request.json()) as TurnRequestBody;

  if (
    !body.oralCaseId || body.oralCaseId.length > 100 ||
    !body.state ||
    !body.userText || body.userText.length > 4_000 ||
    (body.transcript !== undefined && (
      !Array.isArray(body.transcript) ||
      body.transcript.length > 30 ||
      body.transcript.some((turn) =>
        !turn || !["examiner", "candidate"].includes(turn.role) ||
        typeof turn.text !== "string" || turn.text.length > 4_000
      )
    ))
  ) {
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
