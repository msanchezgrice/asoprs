import { describe, expect, it } from "vitest";
import {
  getCompletedInputTranscript,
  getResponseAudioTranscriptDelta,
  hasSpeechRecognition,
  parseRealtimeEvent,
} from "./realtime-client";

describe("oral exam realtime client helpers", () => {
  it("parses Realtime data-channel JSON safely", () => {
    expect(parseRealtimeEvent('{"type":"session.created"}')).toEqual({
      type: "session.created",
    });
    expect(parseRealtimeEvent("not json")).toBeNull();
  });

  it("extracts completed input transcripts from Realtime events", () => {
    const event = {
      type: "conversation.item.input_audio_transcription.completed",
      transcript: "I would ask about pain and onset.",
    };

    expect(getCompletedInputTranscript(event)).toBe(
      "I would ask about pain and onset."
    );
    expect(getCompletedInputTranscript({ type: "response.done" })).toBeNull();
  });

  it("extracts assistant audio transcript deltas", () => {
    expect(
      getResponseAudioTranscriptDelta({
        type: "response.output_audio_transcript.delta",
        delta: "History:",
      })
    ).toBe("History:");
    expect(getResponseAudioTranscriptDelta({ type: "response.done" })).toBeNull();
  });

  it("detects browser speech recognition support", () => {
    expect(
      hasSpeechRecognition({
        SpeechRecognition: function SpeechRecognition() {},
      })
    ).toBe(true);
    expect(
      hasSpeechRecognition({
        webkitSpeechRecognition: function webkitSpeechRecognition() {},
      })
    ).toBe(true);
    expect(hasSpeechRecognition({})).toBe(false);
  });
});
