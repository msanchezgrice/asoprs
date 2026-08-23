"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, MicOff, Square, Monitor, Clock, Key } from "lucide-react";
import { useAuthSession } from "@/hooks/use-auth-session";
import {
  createGeminiLiveSession,
  type GeminiLiveSession,
} from "./gemini-live";
import { captureFrame, requestDisplayMedia } from "./screen-capture";
import {
  createSession,
  endSession,
  saveTurn,
  saveEvent,
  saveScreenshot,
  deleteScreenshot,
  buildSessionRecap,
} from "./session-store";
import type { CompanionTurn, CompanionEvent, CaptureMode } from "./types";

const GEMINI_MODEL = "gemini-3.1-flash-live-preview";
const CAPTURE_INTERVAL_MS = 30_000;
const MAX_STORED_SCREENSHOTS_PER_SESSION = 60;
const STORAGE_KEY = "oculoprep_gemini_api_key";

function storageKeyForUser(userId: string): string {
  return `${STORAGE_KEY}:${userId}`;
}

function getStoredApiKey(userId: string | undefined): string {
  if (typeof window === "undefined" || !userId) return "";
  return sessionStorage.getItem(storageKeyForUser(userId)) ?? "";
}

type CompanionState = "idle" | "connecting" | "listening" | "error" | "needs_key";

export function CompanionWidget() {
  const { user } = useAuthSession();
  const [state, setState] = useState<CompanionState>("idle");
  const [captureMode, setCaptureMode] = useState<CaptureMode>("html2canvas");
  const [apiKey, setApiKey] = useState("");
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [sessionDuration, setSessionDuration] = useState(0);
  const [frustrationCount, setFrustrationCount] = useState(0);
  const [featureRequestCount, setFeatureRequestCount] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [transcript, setTranscript] = useState<Array<{ role: string; text: string; time: string; complete?: boolean }>>([]);

  const sessionRef = useRef<GeminiLiveSession | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const turnsRef = useRef<CompanionTurn[]>([]);
  const eventsRef = useRef<CompanionEvent[]>([]);
  const captureIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playCtxRef = useRef<AudioContext | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const captureInFlightRef = useRef(false);
  const storedScreenshotCountRef = useRef(0);
  const lifecycleRef = useRef(0);
  const previousUserIdRef = useRef<string | null>(null);

  const releaseLiveResources = useCallback(() => {
    lifecycleRef.current += 1;
    sessionIdRef.current = null;

    if (captureIntervalRef.current) clearInterval(captureIntervalRef.current);
    if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    captureIntervalRef.current = null;
    durationIntervalRef.current = null;
    captureInFlightRef.current = false;

    const liveSession = sessionRef.current;
    sessionRef.current = null;
    liveSession?.close();

    const playbackContext = playCtxRef.current;
    playCtxRef.current = null;
    void playbackContext?.close().catch(() => {});

    const microphoneContext = micCtxRef.current;
    micCtxRef.current = null;
    void microphoneContext?.close().catch(() => {});

    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    displayStreamRef.current?.getTracks().forEach((track) => track.stop());
    displayStreamRef.current = null;

    if (videoRef.current) videoRef.current.srcObject = null;
    nextPlayTimeRef.current = 0;
  }, []);

  const userId = user?.id;
  useEffect(() => {
    const previousUserId = previousUserIdRef.current;
    if (previousUserId && previousUserId !== userId) {
      sessionStorage.removeItem(storageKeyForUser(previousUserId));
    }
    // Never carry the historical unscoped key across account boundaries.
    sessionStorage.removeItem(STORAGE_KEY);
    previousUserIdRef.current = userId ?? null;

    releaseLiveResources();
    setState("idle");
    setCaptureMode("html2canvas");
    setApiKey("");
    setShowKeyInput(false);
    setSessionDuration(0);
    setFrustrationCount(0);
    setFeatureRequestCount(0);
    setTranscript([]);
  }, [userId, releaseLiveResources]);

  const startCompanion = useCallback(async () => {
    if (!user) return;

    const currentKey = getStoredApiKey(user.id);
    if (!currentKey) {
      setState("needs_key");
      return;
    }

    releaseLiveResources();
    const generation = lifecycleRef.current;
    const isCurrent = () => lifecycleRef.current === generation;
    setState("connecting");

    try {
      const dbSession = await createSession();
      if (!isCurrent()) return;
      if (!dbSession) {
        setState("error");
        return;
      }

      sessionIdRef.current = dbSession.id;
      turnsRef.current = [];
      eventsRef.current = [];
      storedScreenshotCountRef.current = 0;
      playCtxRef.current = new AudioContext({ sampleRate: 24000 });

      const session = await createGeminiLiveSession(
        {
          captureMode,
          captureIntervalMs: CAPTURE_INTERVAL_MS,
          systemPrompt: "",
          geminiModel: GEMINI_MODEL,
          geminiApiKey: currentKey,
        },
        {
          onAudioChunk(base64Audio) {
            if (!isCurrent()) return;
            const playCtx = playCtxRef.current;
            if (!playCtx) return;
            if (playCtx.state === "suspended") playCtx.resume();
            try {
              const binaryString = atob(base64Audio);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              const buffer = playCtx.createBuffer(1, bytes.length / 2, 24000);
              const channelData = buffer.getChannelData(0);
              const dataView = new DataView(bytes.buffer);
              for (let i = 0; i < channelData.length; i++) {
                channelData[i] = dataView.getInt16(i * 2, true) / 32768.0;
              }
              const source = playCtx.createBufferSource();
              source.buffer = buffer;
              source.connect(playCtx.destination);
              // Schedule sequentially — don't overlap
              if (nextPlayTimeRef.current < playCtx.currentTime) {
                nextPlayTimeRef.current = playCtx.currentTime;
              }
              source.start(nextPlayTimeRef.current);
              nextPlayTimeRef.current += buffer.duration;
            } catch {
              // silent audio decode failure
            }
          },
          onTranscript(text, role) {
            if (!isCurrent()) return;
            // Live preview of buffered transcript (updates as words come in)
            const now = new Date();
            const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            setTranscript((prev) => {
              // Update the last entry if same role (buffering), otherwise add new
              const last = prev[prev.length - 1];
              if (last && last.role === role && !last.complete) {
                return [...prev.slice(0, -1), { ...last, text, time: timeStr }];
              }
              return [...prev.slice(-50), { role, text, time: timeStr, complete: false }];
            });
          },
          onTurnComplete(fullText, role) {
            if (!isCurrent()) return;
            const activeSessionId = sessionIdRef.current;
            if (!activeSessionId) return;

            // Complete turn — save to DB and mark as complete in transcript
            const now = new Date();
            const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            setTranscript((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === role) {
                return [...prev.slice(0, -1), { role, text: fullText, time: timeStr, complete: true }];
              }
              return [...prev.slice(-50), { role, text: fullText, time: timeStr, complete: true }];
            });

            const turn: CompanionTurn = {
              id: crypto.randomUUID(),
              session_id: activeSessionId,
              role,
              transcript: fullText,
              prompt_kind: role === "user" ? "user-voice" : "model-response",
              started_at: now.toISOString(),
              ended_at: now.toISOString(),
            };
            turnsRef.current.push(turn);
            void saveTurn(activeSessionId, turn);

            const lower = fullText.toLowerCase();
            if (lower.includes("i wish") || lower.includes("why can't") || lower.includes("this should")) {
              setFeatureRequestCount((c) => c + 1);
            }
            if (lower.includes("confusing") || lower.includes("annoying") || lower.includes("frustrat") || lower.includes("broken")) {
              setFrustrationCount((c) => c + 1);
            }
          },
          onToolCall() {},
          onDisconnect() {
            if (!isCurrent()) return;
            releaseLiveResources();
            setState((current) => current === "error" ? "error" : "idle");
          },
          onReconnecting() {},
          onError() {
            if (!isCurrent()) return;
            releaseLiveResources();
            setState("error");
          },
        },
      );

      if (!isCurrent()) {
        session.close();
        return;
      }
      sessionRef.current = session;

      // Start screen capture interval
      captureIntervalRef.current = setInterval(async () => {
        if (
          !isCurrent() ||
          captureInFlightRef.current ||
          storedScreenshotCountRef.current >= MAX_STORED_SCREENSHOTS_PER_SESSION
        ) return;

        captureInFlightRef.current = true;
        try {
          const frame = await captureFrame(
            captureMode,
            null,
            videoRef.current,
          );
          if (!isCurrent() || !frame) return;

          const activeSessionId = sessionIdRef.current;
          const activeSession = sessionRef.current;
          if (!activeSessionId || !activeSession) return;

          activeSession.sendVideo(frame);
          const privateObjectPath = await saveScreenshot(activeSessionId, frame);
          if (!isCurrent()) {
            if (privateObjectPath) void deleteScreenshot(privateObjectPath);
            return;
          }
          if (!privateObjectPath || sessionIdRef.current !== activeSessionId) return;

          storedScreenshotCountRef.current += 1;
          const event: CompanionEvent = {
            id: crypto.randomUUID(),
            session_id: activeSessionId,
            event_type: "screenshot",
            payload: {},
            screenshot_url: privateObjectPath,
            occurred_at: new Date().toISOString(),
          };
          eventsRef.current.push(event);
          void saveEvent(activeSessionId, event);
        } finally {
          if (isCurrent()) captureInFlightRef.current = false;
        }
      }, CAPTURE_INTERVAL_MS);

      // Start mic capture — BrowserBud pattern
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      if (!isCurrent()) {
        micStream.getTracks().forEach((track) => track.stop());
        return;
      }
      micStreamRef.current = micStream;
      const micCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)({ sampleRate: 16000 });
      micCtxRef.current = micCtx;
      void micCtx.resume().catch(() => {});
      await micCtx.audioWorklet.addModule("/pcm-recorder-worklet.js");
      if (!isCurrent()) {
        micStream.getTracks().forEach((track) => track.stop());
        void micCtx.close().catch(() => {});
        return;
      }
      const source = micCtx.createMediaStreamSource(micStream);
      const processor = new AudioWorkletNode(micCtx, "pcm-recorder-processor", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCount: 1,
        processorOptions: { chunkSize: 2048 },
      });
      const sink = micCtx.createGain();
      sink.gain.value = 0;
      source.connect(processor);
      processor.connect(sink);
      sink.connect(micCtx.destination);
      processor.port.onmessage = (event) => {
        if (!isCurrent()) return;
        const inputData = event.data;
        if (!(inputData instanceof Float32Array)) return;
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcm16[i] = Math.max(-1, Math.min(1, inputData[i])) * 32767;
        }
        const uint8Array = new Uint8Array(pcm16.buffer);
        let binary = "";
        for (let i = 0; i < uint8Array.byteLength; i++) {
          binary += String.fromCharCode(uint8Array[i]);
        }
        session.sendAudio(btoa(binary));
      };

      // Duration timer
      const startTime = Date.now();
      durationIntervalRef.current = setInterval(() => {
        if (!isCurrent()) return;
        setSessionDuration(Math.round((Date.now() - startTime) / 1000));
      }, 1000);
      setState("listening");
    } catch (err) {
      if (!isCurrent()) return;
      console.error("Failed to start companion:", err);
      releaseLiveResources();
      setState("error");
    }
  }, [user, captureMode, releaseLiveResources]);

  const stopCompanion = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    releaseLiveResources();
    let recap: ReturnType<typeof buildSessionRecap> | null = null;
    if (sessionId) {
      const dbSession = {
        id: sessionId,
        user_id: user?.id ?? "",
        started_at: new Date(Date.now() - sessionDuration * 1000).toISOString(),
        ended_at: new Date().toISOString(),
        recap_json: null,
        created_at: "",
      };
      recap = buildSessionRecap(dbSession, turnsRef.current, eventsRef.current);
    }

    // Reset synchronously before the recap request yields. An older stop must
    // never resume later and hide a newly-started companion generation.
    setState("idle");
    setSessionDuration(0);
    setFrustrationCount(0);
    setFeatureRequestCount(0);
    setTranscript([]);

    if (sessionId && recap) {
      try {
        await endSession(sessionId, recap);
      } catch (error) {
        console.error("Failed to finalize companion session:", error);
      }
    }
  }, [user, sessionDuration, releaseLiveResources]);

  const upgradeToScreenShare = useCallback(async () => {
    const generation = lifecycleRef.current;
    const stream = await requestDisplayMedia();
    if (!stream) return;
    if (lifecycleRef.current !== generation || !videoRef.current) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    displayStreamRef.current?.getTracks().forEach((track) => track.stop());
    displayStreamRef.current = stream;
    videoRef.current.srcObject = stream;
    setCaptureMode("display-media");
    stream.getVideoTracks()[0].onended = () => {
      if (lifecycleRef.current !== generation) return;
      if (displayStreamRef.current === stream) {
        displayStreamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
      }
      setCaptureMode("html2canvas");
    };
  }, []);

  useEffect(() => {
    return releaseLiveResources;
  }, [releaseLiveResources]);

  const resolvedKey = getStoredApiKey(user?.id);

  if (!user) return null;

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <>
      <video ref={videoRef} className="hidden" autoPlay muted playsInline />
      <div className="fixed bottom-20 md:bottom-4 left-4 md:left-[272px] z-50">
        {/* BYO Key input */}
        {(state === "needs_key" || showKeyInput) && (
          <div className="bg-slate-900/95 border border-cyan-700/30 rounded-xl backdrop-blur-sm shadow-2xl p-4 mb-2 w-72">
            <div className="flex items-center gap-2 mb-2">
              <Key size={14} className="text-cyan-400" />
              <span className="text-xs text-cyan-400 font-medium">Gemini API Key</span>
            </div>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:border-cyan-500 mb-2"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (apiKey.trim()) {
                    sessionStorage.setItem(storageKeyForUser(user.id), apiKey.trim());
                    setShowKeyInput(false);
                    setState("idle");
                  }
                }}
                disabled={!apiKey.trim()}
                className="flex-1 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg text-xs font-medium"
              >
                Save
              </button>
              {state !== "needs_key" && (
                <button
                  onClick={() => setShowKeyInput(false)}
                  className="px-3 py-1.5 text-slate-500 text-xs"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}

        {state === "idle" || state === "needs_key" ? (
          <div className="flex items-center gap-2">
            <button
              onClick={resolvedKey ? startCompanion : () => setShowKeyInput(true)}
              className="flex items-center gap-2 bg-cyan-900/80 hover:bg-cyan-800/80 text-cyan-300 px-4 py-2.5 rounded-full text-sm font-medium backdrop-blur-sm border border-cyan-700/50 transition-colors"
            >
              <Mic size={16} />
              {resolvedKey ? "Start companion" : "Set up companion"}
            </button>
            {resolvedKey && (
              <button
                onClick={() => setShowKeyInput(!showKeyInput)}
                className="text-slate-500 hover:text-cyan-400 p-1"
                title="Change API key"
              >
                <Key size={14} />
              </button>
            )}
          </div>
        ) : state === "connecting" ? (
          <div className="flex items-center gap-2 bg-slate-800/90 text-slate-400 px-4 py-2.5 rounded-full text-sm backdrop-blur-sm border border-slate-700/50">
            <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            Connecting...
          </div>
        ) : state === "error" ? (
          <button
            onClick={startCompanion}
            className="flex items-center gap-2 bg-red-900/80 text-red-300 px-4 py-2.5 rounded-full text-sm font-medium backdrop-blur-sm border border-red-700/50"
          >
            <MicOff size={16} />
            Retry
          </button>
        ) : (
          <div className="bg-slate-900/95 border border-cyan-700/30 rounded-xl backdrop-blur-sm shadow-2xl overflow-hidden">
            {/* Status bar */}
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-800">
              <div className="w-3 h-3 bg-cyan-400 rounded-full animate-pulse" />
              <span className="text-xs text-cyan-400 font-medium">Observing</span>
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <Clock size={10} />
                {formatDuration(sessionDuration)}
              </span>
              <div className="flex-1" />
              {captureMode === "html2canvas" && (
                <button
                  onClick={upgradeToScreenShare}
                  className="text-xs text-slate-500 hover:text-cyan-400 flex items-center gap-1"
                >
                  <Monitor size={10} />
                  Upgrade
                </button>
              )}
              <button
                onClick={stopCompanion}
                className="text-red-400 hover:text-red-300"
              >
                <Square size={14} />
              </button>
            </div>

            {/* Stats */}
            <div className="flex gap-4 px-4 py-2 text-xs text-slate-500">
              <span><strong className="text-amber-400">{frustrationCount}</strong> frustrations</span>
              <span><strong className="text-indigo-400">{featureRequestCount}</strong> requests</span>
            </div>

            {/* Expandable transcript */}
            {expanded && (
              <div className="max-h-48 overflow-y-auto px-4 py-2 border-t border-slate-800 space-y-2">
                {transcript.map((entry, i) => (
                  <div key={i} className="text-xs">
                    <span className="text-slate-600">{entry.time}</span>{" "}
                    <span className={entry.role === "user" ? "text-cyan-400 font-medium" : "text-green-400 font-medium"}>
                      {entry.role === "user" ? "You" : "Companion"}:
                    </span>{" "}
                    <span className="text-slate-300">{entry.text}</span>
                  </div>
                ))}
                {transcript.length === 0 && (
                  <div className="text-xs text-slate-600">Listening... say something or just study.</div>
                )}
              </div>
            )}

            <button
              onClick={() => setExpanded(!expanded)}
              className="w-full text-center text-xs text-slate-600 hover:text-slate-400 py-1.5 border-t border-slate-800"
            >
              {expanded ? "Hide transcript" : "Show transcript"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
