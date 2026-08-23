import { NextResponse } from "next/server";
import { createOralExamRealtimeClientSecret } from "@/features/oral-exam/realtime-session";
import { enforcePaidRateLimit, requireSameOrigin, requireUser } from "@/lib/api-security";

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const auth = await requireUser({ verifiedEmail: true });
  if (!auth.ok) return auth.response;

  const rateLimit = await enforcePaidRateLimit(request, auth.user.id, "oral_realtime_token", {
    user: 6,
    ip: 12,
    global: 200,
    windowSeconds: 600,
  });
  if (rateLimit) return rateLimit;

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "OpenAI Realtime is not configured." },
      { status: 503 }
    );
  }

  try {
    const clientSecret = await createOralExamRealtimeClientSecret({
      apiKey,
      model: process.env.OPENAI_REALTIME_MODEL,
      voice: process.env.OPENAI_REALTIME_VOICE,
      transcriptionModel: process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL,
    });

    return NextResponse.json(clientSecret);
  } catch (error) {
    console.error("OpenAI Realtime token creation failed:", error);
    return NextResponse.json(
      { error: "Failed to create OpenAI Realtime client secret." },
      { status: 502 }
    );
  }
}
