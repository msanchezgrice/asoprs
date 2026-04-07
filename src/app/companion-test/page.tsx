"use client";

import { useState, useRef, useEffect } from "react";
import { GoogleGenAI, Modality } from "@google/genai";

const STORAGE_KEY = "oculoprep_gemini_api_key";

export default function CompanionTestPage() {
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) ?? "";
    if (stored) setApiKey(stored);
  }, []);

  const log = (msg: string) => {
    const ts = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${ts}] ${msg}`, ...prev].slice(0, 50));
  };

  const testConnection = async () => {
    if (!apiKey.trim()) {
      setError("Enter a Gemini API key first");
      return;
    }

    localStorage.setItem(STORAGE_KEY, apiKey.trim());
    setStatus("connecting");
    setError(null);
    setLogs([]);
    log("Initializing GoogleGenAI client...");

    try {
      const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
      log("Client created. Connecting to live session...");

      const session = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: { parts: [{ text: "You are a helpful assistant. Say hello when connected." }] },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen() {
            log("SESSION OPEN - connected successfully!");
            setStatus("connected");
          },
          onmessage(msg) {
            log("Message received: " + JSON.stringify({
              hasServerContent: !!msg.serverContent,
              hasModelTurn: !!msg.serverContent?.modelTurn,
              hasInputTranscription: !!msg.serverContent?.inputTranscription,
              hasOutputTranscription: !!msg.serverContent?.outputTranscription,
              turnComplete: msg.serverContent?.turnComplete,
              inputText: msg.serverContent?.inputTranscription?.text,
              outputText: msg.serverContent?.outputTranscription?.text,
              partCount: msg.serverContent?.modelTurn?.parts?.length,
            }));

            if (msg.serverContent?.inputTranscription?.text) {
              log("USER SAID: " + msg.serverContent.inputTranscription.text);
            }
            if (msg.serverContent?.outputTranscription?.text) {
              log("MODEL SAID: " + msg.serverContent.outputTranscription.text);
            }
            if (msg.serverContent?.modelTurn?.parts) {
              for (const part of msg.serverContent.modelTurn.parts) {
                if (part.inlineData?.data) {
                  log("AUDIO CHUNK received (" + (part.inlineData.data as string).length + " bytes)");
                }
                if (part.text) {
                  log("TEXT PART: " + part.text);
                }
              }
            }
          },
          onerror(err) {
            log("ERROR: " + String(err));
            setError(String(err));
            setStatus("error");
          },
          onclose() {
            log("SESSION CLOSED");
            setStatus("closed");
          },
        },
      });

      log("Session object created. Requesting mic access...");

      // Test mic
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: { sampleRate: 16000, channelCount: 1 },
        });
        log("Mic access granted. Tracks: " + micStream.getTracks().length);

        // Set up audio worklet — exact BrowserBud pattern
        const micCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)({ sampleRate: 16000 });
        log("AudioContext state: " + micCtx.state + ", sampleRate: " + micCtx.sampleRate);
        void micCtx.resume().catch(() => {});
        await micCtx.audioWorklet.addModule("/pcm-recorder-worklet.js");
        log("AudioWorklet loaded (pcm-recorder-processor).");

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

        let chunkCount = 0;
        processor.port.onmessage = (event) => {
          const inputData = event.data;
          if (!(inputData instanceof Float32Array)) {
            log("Worklet sent non-Float32Array: " + typeof inputData);
            return;
          }

          // Convert Float32 to PCM16 then base64 (BrowserBud pattern)
          const pcm16 = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            pcm16[i] = Math.max(-1, Math.min(1, inputData[i])) * 32767;
          }
          const uint8Array = new Uint8Array(pcm16.buffer);
          let binary = "";
          for (let i = 0; i < uint8Array.byteLength; i++) {
            binary += String.fromCharCode(uint8Array[i]);
          }
          const base64 = btoa(binary);

          chunkCount++;
          session.sendRealtimeInput({
            audio: { data: base64, mimeType: "audio/pcm;rate=16000" },
          });
          if (chunkCount <= 3 || chunkCount % 20 === 0) {
            log("Audio chunk #" + chunkCount + " sent (" + base64.length + " chars)");
          }
        };

        log("Mic pipeline connected (BrowserBud pattern). Speak now!");
        setStatus("listening");
      } catch (micErr) {
        log("Mic error: " + String(micErr));
        setError("Mic access failed: " + String(micErr));
      }
    } catch (err) {
      log("Connection error: " + String(err));
      setError(String(err));
      setStatus("error");
    }
  };

  return (
    <div className="min-h-dvh bg-slate-950 text-slate-200 p-6 font-mono">
      <h1 className="text-xl font-bold mb-4 text-cyan-400">Companion Test Page</h1>

      <div className="mb-4 flex gap-2">
        <input
          type="text"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Gemini API Key (AIzaSy...)"
          className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm"
        />
        <button
          onClick={testConnection}
          disabled={status === "connecting"}
          className="bg-cyan-700 hover:bg-cyan-600 px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
        >
          {status === "connecting" ? "Connecting..." : "Test Connection"}
        </button>
      </div>

      <div className="mb-4 flex gap-4 text-sm">
        <span>Status: <strong className={
          status === "listening" ? "text-green-400" :
          status === "connected" ? "text-cyan-400" :
          status === "error" ? "text-red-400" :
          "text-slate-400"
        }>{status}</strong></span>
        {error && <span className="text-red-400">Error: {error}</span>}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded p-4 max-h-[60vh] overflow-y-auto">
        <h2 className="text-sm font-bold mb-2 text-slate-400">Event Log</h2>
        {logs.length === 0 ? (
          <p className="text-slate-600 text-sm">Click "Test Connection" to start</p>
        ) : (
          logs.map((l, i) => (
            <div key={i} className={`text-xs mb-1 ${
              l.includes("USER SAID") ? "text-cyan-300" :
              l.includes("MODEL SAID") ? "text-green-300" :
              l.includes("ERROR") ? "text-red-400" :
              l.includes("AUDIO CHUNK") ? "text-slate-600" :
              "text-slate-400"
            }`}>
              {l}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
