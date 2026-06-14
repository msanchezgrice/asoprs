import { NextResponse } from "next/server";
import { createOralExamRealtimeClientSecret } from "@/features/oral-exam/realtime-session";

export async function POST() {
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
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create OpenAI Realtime client secret.",
      },
      { status: 502 }
    );
  }
}
