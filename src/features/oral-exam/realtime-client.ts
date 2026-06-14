export type RealtimeEvent = {
  type?: string;
  transcript?: unknown;
  delta?: unknown;
};

export type SpeechRecognitionWindow = {
  SpeechRecognition?: unknown;
  webkitSpeechRecognition?: unknown;
};

export function parseRealtimeEvent(raw: string): RealtimeEvent | null {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as RealtimeEvent) : null;
  } catch {
    return null;
  }
}

export function getCompletedInputTranscript(event: RealtimeEvent) {
  if (
    event.type === "conversation.item.input_audio_transcription.completed" &&
    typeof event.transcript === "string" &&
    event.transcript.trim()
  ) {
    return event.transcript.trim();
  }

  return null;
}

export function getResponseAudioTranscriptDelta(event: RealtimeEvent) {
  if (
    event.type === "response.output_audio_transcript.delta" &&
    typeof event.delta === "string"
  ) {
    return event.delta;
  }

  return null;
}

export function hasSpeechRecognition(target: SpeechRecognitionWindow) {
  return Boolean(target.SpeechRecognition || target.webkitSpeechRecognition);
}
