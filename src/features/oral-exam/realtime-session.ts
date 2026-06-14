const OPENAI_REALTIME_CLIENT_SECRET_URL =
  "https://api.openai.com/v1/realtime/client_secrets";

export const DEFAULT_ORAL_EXAM_REALTIME_MODEL = "gpt-realtime-2";
export const DEFAULT_ORAL_EXAM_REALTIME_VOICE = "marin";
export const DEFAULT_ORAL_EXAM_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";

type FetchLike = typeof fetch;

export interface OralExamRealtimeOptions {
  model?: string;
  voice?: string;
  transcriptionModel?: string;
}

export interface OralExamRealtimeClientSecret {
  value: string;
  expires_at: number;
}

export function buildOralExamRealtimeInstructions() {
  return [
    "You are the voice transport for an ASOPRS oral exam simulator.",
    "Do not independently diagnose the case, name the source, or reveal final answers.",
    "When asked to speak an examiner script, read only that script in a calm oral-board examiner voice.",
    "Do not say you cannot see the image or exam materials; the application supplies the examiner script and case context.",
    "If the user speaks, transcribe the utterance; the application will decide the next case stage.",
  ].join(" ");
}

export function buildOralExamRealtimeSessionPayload({
  model = DEFAULT_ORAL_EXAM_REALTIME_MODEL,
  voice = DEFAULT_ORAL_EXAM_REALTIME_VOICE,
  transcriptionModel = DEFAULT_ORAL_EXAM_TRANSCRIPTION_MODEL,
}: OralExamRealtimeOptions = {}) {
  return {
    expires_after: {
      anchor: "created_at",
      seconds: 600,
    },
    session: {
      type: "realtime",
      model,
      instructions: buildOralExamRealtimeInstructions(),
      output_modalities: ["audio"],
      tool_choice: "none",
      audio: {
        input: {
          transcription: {
            model: transcriptionModel,
          },
          turn_detection: {
            type: "server_vad",
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 700,
            create_response: false,
            interrupt_response: true,
          },
        },
        output: {
          voice,
        },
      },
    },
  };
}

export async function createOralExamRealtimeClientSecret({
  apiKey,
  fetchImpl = fetch,
  model,
  voice,
  transcriptionModel,
}: OralExamRealtimeOptions & {
  apiKey: string;
  fetchImpl?: FetchLike;
}): Promise<OralExamRealtimeClientSecret> {
  const response = await fetchImpl(OPENAI_REALTIME_CLIENT_SECRET_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      buildOralExamRealtimeSessionPayload({
        model,
        voice,
        transcriptionModel,
      })
    ),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `OpenAI Realtime client secret request failed: ${response.status}${
        detail ? ` ${detail}` : ""
      }`
    );
  }

  return (await response.json()) as OralExamRealtimeClientSecret;
}

export function buildExaminerReadAloudEvent(text: string) {
  return {
    type: "response.create",
    response: {
      conversation: "none",
      output_modalities: ["audio"],
      instructions:
        "Read the provided examiner script exactly. Do not add clinical content, diagnosis labels, source labels, or commentary. Do not say you cannot see the image or exam materials.",
      input: [
        {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text,
            },
          ],
        },
      ],
    },
  };
}

export function buildExaminerReadAloudEvents(text: string) {
  return [
    {
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Examiner script to read aloud exactly:\n\n${text}`,
          },
        ],
      },
    },
    {
      type: "response.create",
      response: {
        output_modalities: ["audio"],
        instructions:
          "Read the latest examiner script exactly in a calm oral-board examiner voice. Do not add clinical content, diagnosis labels, source labels, commentary, or claims that you cannot see the image or exam materials.",
      },
    },
  ];
}
