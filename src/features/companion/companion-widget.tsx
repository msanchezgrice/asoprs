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
  buildSessionRecap,
} from "./session-store";
import type { CompanionTurn, CompanionEvent, CaptureMode } from "./types";

const ENV_GEMINI_KEY = process.env.NEXT_PUBLIC_currentKey ?? "";
const GEMINI_MODEL = "gemini-3.1-flash-live-preview";
const CAPTURE_INTERVAL_MS = 5000;
const STORAGE_KEY = "oculoprep_gemini_api_key";

function getStoredApiKey(): string {
  if (typeof window === "undefined") return ENV_GEMINI_KEY;
  return localStorage.getItem(STORAGE_KEY) ?? ENV_GEMINI_KEY;
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
  const [transcript, setTranscript] = useState<Array<{ role: string; text: string; time: string }>>([]);

  const sessionRef = useRef<GeminiLiveSession | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const turnsRef = useRef<CompanionTurn[]>([]);
  const eventsRef = useRef<CompanionEvent[]>([]);
  const captureIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playCtxRef = useRef<AudioContext | null>(null);

  const startCompanion = useCallback(async () => {
    const currentKey = getStoredApiKey();
    if (!user || !currentKey) {
      if (user) setState("needs_key");
      return;
    }

    setState("connecting");

    const dbSession = await createSession();
    if (!dbSession) {
      setState("error");
      return;
    }
    sessionIdRef.current = dbSession.id;
    turnsRef.current = [];
    eventsRef.current = [];

    try {
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
            if (!playCtxRef.current) return;
            try {
              const binaryString = atob(base64Audio);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              const buffer = playCtxRef.current.createBuffer(1, bytes.length / 2, 24000);
              const channelData = buffer.getChannelData(0);
              const dataView = new DataView(bytes.buffer);
              for (let i = 0; i < channelData.length; i++) {
                channelData[i] = dataView.getInt16(i * 2, true) / 32768.0;
              }
              const source = playCtxRef.current.createBufferSource();
              source.buffer = buffer;
              source.connect(playCtxRef.current.destination);
              source.start();
            } catch {
              // silent audio decode failure
            }
          },
          onTranscript(text, role) {
            const now = new Date();
            const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            setTranscript((prev) => [...prev.slice(-50), { role, text, time: timeStr }]);

            const turn: CompanionTurn = {
              id: crypto.randomUUID(),
              session_id: sessionIdRef.current!,
              role,
              transcript: text,
              prompt_kind: role === "user" ? "user-voice" : "model-response",
              started_at: now.toISOString(),
              ended_at: now.toISOString(),
            };
            turnsRef.current.push(turn);
            void saveTurn(sessionIdRef.current!, turn);

            const lower = text.toLowerCase();
            if (lower.includes("i wish") || lower.includes("why can't") || lower.includes("this should")) {
              setFeatureRequestCount((c) => c + 1);
            }
            if (lower.includes("confusing") || lower.includes("annoying") || lower.includes("frustrat") || lower.includes("broken")) {
              setFrustrationCount((c) => c + 1);
            }
          },
          onToolCall() {},
          onDisconnect() {
            setState("idle");
          },
          onReconnecting() {},
          onError() {
            setState("error");
          },
        },
      );

      sessionRef.current = session;
      setState("listening");

      // Start screen capture interval
      captureIntervalRef.current = setInterval(async () => {
        const frame = await captureFrame(
          captureMode,
          null,
          videoRef.current,
        );
        if (frame && sessionIdRef.current) {
          session.sendVideo(frame);
          const url = await saveScreenshot(sessionIdRef.current, frame);
          const event: CompanionEvent = {
            id: crypto.randomUUID(),
            session_id: sessionIdRef.current,
            event_type: "screenshot",
            payload: {},
            screenshot_url: url,
            occurred_at: new Date().toISOString(),
          };
          eventsRef.current.push(event);
          void saveEvent(sessionIdRef.current, event);
        }
      }, CAPTURE_INTERVAL_MS);

      // Start mic capture
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1 },
      });
      const micCtx = new AudioContext({ sampleRate: 16000 });
      await micCtx.audioWorklet.addModule("/pcm-recorder-worklet.js");
      const source = micCtx.createMediaStreamSource(micStream);
      const worklet = new AudioWorkletNode(micCtx, "pcm-recorder");
      worklet.port.onmessage = (e) => {
        if (e.data?.base64) {
          session.sendAudio(e.data.base64);
        }
      };
      source.connect(worklet);
      worklet.connect(micCtx.destination);

      // Duration timer
      const startTime = Date.now();
      durationIntervalRef.current = setInterval(() => {
        setSessionDuration(Math.round((Date.now() - startTime) / 1000));
      }, 1000);
    } catch (err) {
      console.error("Failed to start companion:", err);
      setState("error");
    }
  }, [user, captureMode]);

  const stopCompanion = useCallback(async () => {
    if (captureIntervalRef.current) clearInterval(captureIntervalRef.current);
    if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    captureIntervalRef.current = null;
    durationIntervalRef.current = null;

    sessionRef.current?.close();
    sessionRef.current = null;
    playCtxRef.current?.close();
    playCtxRef.current = null;

    if (sessionIdRef.current) {
      const dbSession = {
        id: sessionIdRef.current,
        user_id: user?.id ?? "",
        started_at: new Date(Date.now() - sessionDuration * 1000).toISOString(),
        ended_at: new Date().toISOString(),
        recap_json: null,
        created_at: "",
      };
      const recap = buildSessionRecap(dbSession, turnsRef.current, eventsRef.current);
      await endSession(sessionIdRef.current, recap);
    }

    setState("idle");
    setSessionDuration(0);
    setFrustrationCount(0);
    setFeatureRequestCount(0);
    setTranscript([]);
  }, [user, sessionDuration]);

  const upgradeToScreenShare = useCallback(async () => {
    const stream = await requestDisplayMedia();
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      setCaptureMode("display-media");
      stream.getVideoTracks()[0].onended = () => {
        setCaptureMode("html2canvas");
      };
    }
  }, []);

  useEffect(() => {
    return () => {
      if (captureIntervalRef.current) clearInterval(captureIntervalRef.current);
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
      sessionRef.current?.close();
      playCtxRef.current?.close();
    };
  }, []);

  const resolvedKey = getStoredApiKey();

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
                    localStorage.setItem(STORAGE_KEY, apiKey.trim());
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
