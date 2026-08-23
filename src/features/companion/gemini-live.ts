import { GoogleGenAI, Modality, type LiveServerMessage } from "@google/genai";
import type { CompanionConfig } from "./types";

const MAX_RECONNECT_ATTEMPTS = 6;
const RECONNECT_BASE_MS = 2000;

const DEFAULT_SYSTEM_PROMPT = `You are a user testing companion for OculoPrep, a study tool for oculoplastic oral board exams.

CURRENT FEATURES: Flashcards (text + image), multiple choice quizzes, PDF reader with highlighting, chat, mindmap, study packs, progress tracking, search.

YOUR JOB: Watch and listen silently. When the user speaks, capture it as feedback. If they ask a study question, answer briefly from their materials. Note frustrations, feature requests, and confusion. You are NOT a study tutor. You are a product observer.

WATCH FOR: "I wish...", "why can't I...", "this should...", long pauses on one card, repeated actions, expressions of confusion or frustration.

When you detect a frustration or feature request, prefix your internal note with [FRUSTRATION] or [FEATURE_REQUEST] so the system can extract it.`;

export interface GeminiLiveSession {
  sendAudio: (base64: string) => void;
  sendVideo: (base64: string) => void;
  sendText: (text: string) => void;
  close: () => void;
}

export interface GeminiLiveCallbacks {
  onAudioChunk: (base64Audio: string) => void;
  onTranscript: (text: string, role: "user" | "model") => void;
  onTurnComplete: (fullText: string, role: "user" | "model") => void;
  onToolCall: (name: string, args: Record<string, unknown>) => void;
  onDisconnect: (reason: string) => void;
  onReconnecting: (attempt: number) => void;
  onError: (error: Error) => void;
}

export async function createGeminiLiveSession(
  config: CompanionConfig,
  callbacks: GeminiLiveCallbacks,
): Promise<GeminiLiveSession> {
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

  let reconnectAttempts = 0;
  let shouldReconnect = true;
  let connectionGeneration = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  const transcriptFlushTimers = new Set<ReturnType<typeof setTimeout>>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let session: any = null;

  async function connect() {
    const generation = ++connectionGeneration;
    const isCurrent = () => shouldReconnect && connectionGeneration === generation;
    let connectionClosed = false;
    const systemPrompt = config.systemPrompt || DEFAULT_SYSTEM_PROMPT;

    // Transcript buffering — accumulate fragments, emit on turnComplete
    let userTranscriptBuffer = "";
    let modelTranscriptBuffer = "";
    let userFlushTimer: ReturnType<typeof setTimeout> | null = null;

    const connectedSession = await ai.live.connect({
      model: config.geminiModel,
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
        systemInstruction: { parts: [{ text: systemPrompt }] },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
      callbacks: {
        onopen() {
          if (!isCurrent()) return;
          reconnectAttempts = 0;
        },
        onmessage(msg: LiveServerMessage) {
          if (!isCurrent()) return;
          // Handle audio chunks from model
          if (msg.serverContent?.modelTurn?.parts) {
            for (const part of msg.serverContent.modelTurn.parts) {
              if (part.inlineData?.data) {
                callbacks.onAudioChunk(part.inlineData.data as string);
              }
            }
          }

          // Buffer user speech transcription
          if (msg.serverContent?.inputTranscription?.text) {
            userTranscriptBuffer += msg.serverContent.inputTranscription.text;
            callbacks.onTranscript(userTranscriptBuffer, "user");
            // Flush user transcript after 2s of silence
            if (userFlushTimer) {
              clearTimeout(userFlushTimer);
              transcriptFlushTimers.delete(userFlushTimer);
            }
            userFlushTimer = setTimeout(() => {
              if (userFlushTimer) transcriptFlushTimers.delete(userFlushTimer);
              userFlushTimer = null;
              if (!isCurrent()) return;
              if (userTranscriptBuffer.trim()) {
                callbacks.onTurnComplete(userTranscriptBuffer.trim(), "user");
                userTranscriptBuffer = "";
              }
            }, 2000);
            transcriptFlushTimers.add(userFlushTimer);
          }

          // Buffer model speech transcription
          if (msg.serverContent?.outputTranscription?.text) {
            modelTranscriptBuffer += msg.serverContent.outputTranscription.text;
            callbacks.onTranscript(modelTranscriptBuffer, "model");
          }

          // On turn complete, flush model buffer
          if (msg.serverContent?.turnComplete) {
            if (modelTranscriptBuffer.trim()) {
              callbacks.onTurnComplete(modelTranscriptBuffer.trim(), "model");
              modelTranscriptBuffer = "";
            }
          }
        },
        onerror(error: Event) {
          if (!isCurrent()) return;
          callbacks.onError(new Error(String(error)));
        },
        onclose() {
          connectionClosed = true;
          if (userFlushTimer) {
            clearTimeout(userFlushTimer);
            transcriptFlushTimers.delete(userFlushTimer);
            userFlushTimer = null;
          }
          if (!isCurrent()) return;
          session = null;

          if (shouldReconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            callbacks.onReconnecting(reconnectAttempts);
            const delay = RECONNECT_BASE_MS * Math.pow(2, reconnectAttempts - 1);
            reconnectTimer = setTimeout(() => {
              reconnectTimer = null;
              if (!isCurrent()) return;
              void connect().catch((error: unknown) => {
                if (!shouldReconnect) return;
                callbacks.onError(
                  error instanceof Error ? error : new Error(String(error)),
                );
              });
            }, delay);
          } else {
            callbacks.onDisconnect(
              reconnectAttempts >= MAX_RECONNECT_ATTEMPTS
                ? "max_reconnects"
                : "closed",
            );
          }
        },
      },
    });

    if (!isCurrent() || connectionClosed) {
      connectedSession.close?.();
      return;
    }

    session = connectedSession;
  }

  await connect();

  return {
    sendAudio(base64: string) {
      session?.sendRealtimeInput?.({
        audio: { data: base64, mimeType: "audio/pcm;rate=16000" },
      });
    },
    sendVideo(base64: string) {
      session?.sendRealtimeInput?.({
        video: { data: base64, mimeType: "image/jpeg" },
      });
    },
    sendText(text: string) {
      session?.sendRealtimeInput?.({ text });
    },
    close() {
      shouldReconnect = false;
      connectionGeneration += 1;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      for (const timer of transcriptFlushTimers) clearTimeout(timer);
      transcriptFlushTimers.clear();
      session?.close?.();
      session = null;
    },
  };
}

export { DEFAULT_SYSTEM_PROMPT };
