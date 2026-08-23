import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { connectMock } = vi.hoisted(() => ({
  connectMock: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    live = { connect: connectMock };
  },
  Modality: { AUDIO: "AUDIO" },
}));

import { createGeminiLiveSession, type GeminiLiveCallbacks } from "./gemini-live";

type LiveCallbacks = {
  onopen: () => void;
  onmessage: (message: object) => void;
  onerror: (error: Event) => void;
  onclose: () => void;
};

describe("createGeminiLiveSession lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    connectMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("closes a reconnect that resolves after the wrapper was stopped", async () => {
    const firstSession = { close: vi.fn(), sendRealtimeInput: vi.fn() };
    const staleSession = { close: vi.fn(), sendRealtimeInput: vi.fn() };
    const captured: {
      firstCallbacks?: LiveCallbacks;
      resolveReconnect?: (session: typeof staleSession) => void;
    } = {};

    connectMock
      .mockImplementationOnce(async (options: { callbacks: LiveCallbacks }) => {
        captured.firstCallbacks = options.callbacks;
        return firstSession;
      })
      .mockImplementationOnce(
        () => new Promise<typeof staleSession>((resolve) => {
          captured.resolveReconnect = resolve;
        }),
      );

    const callbacks: GeminiLiveCallbacks = {
      onAudioChunk: vi.fn(),
      onTranscript: vi.fn(),
      onTurnComplete: vi.fn(),
      onToolCall: vi.fn(),
      onDisconnect: vi.fn(),
      onReconnecting: vi.fn(),
      onError: vi.fn(),
    };

    const wrapper = await createGeminiLiveSession(
      {
        captureMode: "html2canvas",
        captureIntervalMs: 30_000,
        systemPrompt: "test",
        geminiModel: "test-model",
        geminiApiKey: "test-key",
      },
      callbacks,
    );

    expect(captured.firstCallbacks).toBeDefined();
    if (!captured.firstCallbacks) throw new Error("Missing initial live callbacks");
    captured.firstCallbacks.onclose();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(connectMock).toHaveBeenCalledTimes(2);

    wrapper.close();
    expect(firstSession.close).not.toHaveBeenCalled();
    expect(captured.resolveReconnect).toBeDefined();
    if (!captured.resolveReconnect) throw new Error("Missing reconnect resolver");
    captured.resolveReconnect(staleSession);
    await Promise.resolve();
    await Promise.resolve();

    expect(staleSession.close).toHaveBeenCalledTimes(1);
    expect(callbacks.onError).not.toHaveBeenCalled();
  });
});
