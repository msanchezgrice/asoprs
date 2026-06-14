"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Image as ImageIcon,
  Loader2,
  MessageSquareText,
  Mic,
  MicOff,
  RotateCcw,
  Send,
  Stethoscope,
  Volume2,
} from "lucide-react";
import cards from "@/data/image-flashcards.generated.json";
import {
  getCompletedInputTranscript,
  getResponseAudioTranscriptDelta,
  parseRealtimeEvent,
} from "@/features/oral-exam/realtime-client";
import { buildExaminerReadAloudEvent } from "@/features/oral-exam/realtime-session";
import { resolveOralExamPdfUrl } from "@/features/oral-exam/pdf-url";
import {
  ORAL_EXAM_CASES,
  buildOpeningExaminerMessage,
  getInitialOralExamState,
  getOralExamFigureLabel,
  getOralExamCaseLabel,
  handleOralExamTurn,
  type OralExamCase,
  type OralExamState,
} from "@/features/oral-exam/oral-exam";

const ImageFlashcardPreview = dynamic(
  () =>
    import("@/components/flashcards/image-flashcard-preview").then(
      (mod) => mod.ImageFlashcardPreview
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-64 items-center justify-center text-coral">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    ),
  }
);

type ImageFlashcard = (typeof cards)[number];

type ChatMessage = {
  id: string;
  role: "examiner" | "candidate";
  text: string;
};

type VoiceMode = "off" | "connecting" | "openai" | "error";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const OPENAI_REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";

function findFigure(figureId: string) {
  return (cards as ImageFlashcard[]).find((card) => card.id === figureId);
}

function buildInitialMessages(oralCase: OralExamCase): ChatMessage[] {
  return [
    {
      id: `${oralCase.id}-opening`,
      role: "examiner",
      text: buildOpeningExaminerMessage(),
    },
  ];
}

function FigurePanel({
  figure,
  label,
  width,
}: {
  figure: ImageFlashcard;
  label: string;
  width: number;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-[0.18em] text-warm-gray">
            {figure.figureLabel}
          </p>
          <p className="truncate text-sm font-medium text-navy">
            {label}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-ivory px-2.5 py-1 text-[11px] font-semibold text-warm-gray">
          p{figure.pageNumber}
        </span>
      </div>
      <ImageFlashcardPreview
        file={resolveOralExamPdfUrl(figure.storagePath, SUPABASE_URL)}
        pageNumber={figure.pageNumber}
        width={width}
        pageWidth={figure.pageWidth}
        pageHeight={figure.pageHeight}
        crop={figure.crop}
      />
    </div>
  );
}

export default function OralExamPage() {
  const [selectedCaseId, setSelectedCaseId] = useState(ORAL_EXAM_CASES[0].id);
  const selectedCase = useMemo(
    () => ORAL_EXAM_CASES.find((item) => item.id === selectedCaseId)!,
    [selectedCaseId]
  );
  const selectedCaseIndex = useMemo(
    () => ORAL_EXAM_CASES.findIndex((item) => item.id === selectedCaseId),
    [selectedCaseId]
  );
  const [state, setState] = useState<OralExamState>(() =>
    getInitialOralExamState(selectedCaseId)
  );
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    buildInitialMessages(selectedCase)
  );
  const [input, setInput] = useState("");
  const [score, setScore] = useState(0);
  const imageWrapRef = useRef<HTMLDivElement | null>(null);
  const [imageWidth, setImageWidth] = useState(520);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("off");
  const [voiceStatus, setVoiceStatus] = useState("Voice off");
  const [liveVoiceText, setLiveVoiceText] = useState("");
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastSpokenExaminerIdRef = useRef<string | null>(null);
  const submitTurnRef = useRef<(text: string) => void>(() => {});

  const stopVoice = useCallback((updateState = true) => {
    dataChannelRef.current?.close();
    dataChannelRef.current = null;
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    if (updateState) {
      setVoiceMode("off");
      setVoiceStatus("Voice off");
      setLiveVoiceText("");
    }
  }, []);

  useEffect(() => {
    if (!imageWrapRef.current) return;
    const node = imageWrapRef.current;
    const resize = () => {
      setImageWidth(Math.max(260, Math.min(560, node.clientWidth - 32)));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  useEffect(() => () => stopVoice(false), [stopVoice]);

  function resetCase(nextCaseId = selectedCaseId) {
    const nextCase =
      ORAL_EXAM_CASES.find((item) => item.id === nextCaseId) ??
      ORAL_EXAM_CASES[0];
    lastSpokenExaminerIdRef.current = null;
    setSelectedCaseId(nextCase.id);
    setState(getInitialOralExamState(nextCase.id));
    setMessages(buildInitialMessages(nextCase));
    setInput("");
    setScore(0);
  }

  async function requestOralExamTurn(
    oralCaseId: string,
    currentState: OralExamState,
    userText: string
  ) {
    const response = await fetch("/api/oral-exam/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        oralCaseId,
        state: currentState,
        userText,
        transcript: messages.slice(-8).map((message) => ({
          role: message.role,
          text: message.text,
        })),
      }),
    });

    if (!response.ok) {
      throw new Error(`Oral exam turn failed: ${response.status}`);
    }

    return (await response.json()) as ReturnType<typeof handleOralExamTurn>;
  }

  async function submitTurn(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;

    const currentState = state;
    const result = await requestOralExamTurn(
      selectedCase.id,
      currentState,
      trimmed
    ).catch(() =>
      handleOralExamTurn({
        oralCaseId: selectedCase.id,
        state: currentState,
        userText: trimmed,
      })
    );

    setState(result.state);
    setScore((current) => Math.max(current, result.score.total));
    setMessages((current) => [
      ...current,
      {
        id: `${selectedCase.id}-${currentState.turnCount + 1}-candidate`,
        role: "candidate",
        text: trimmed,
      },
      {
        id: `${selectedCase.id}-${currentState.turnCount + 1}-examiner`,
        role: "examiner",
        text: result.examinerMessage,
      },
    ]);
    setInput("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitTurn(input);
  }

  submitTurnRef.current = submitTurn;

  const speakExaminerText = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const channel = dataChannelRef.current;
      if (voiceMode === "openai" && channel?.readyState === "open") {
        channel.send(JSON.stringify(buildExaminerReadAloudEvent(trimmed)));
        return;
      }

      setVoiceStatus("OpenAI voice is not connected");
    },
    [voiceMode]
  );

  const connectOpenAIRealtime = useCallback(async (clientSecret: string) => {
    const peerConnection = new RTCPeerConnection();
    peerConnectionRef.current = peerConnection;

    peerConnection.ontrack = (event) => {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = event.streams[0];
      }
    };

    const micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    micStreamRef.current = micStream;
    micStream.getAudioTracks().forEach((track) => {
      peerConnection.addTrack(track, micStream);
    });

    const dataChannel = peerConnection.createDataChannel("oai-events");
    dataChannelRef.current = dataChannel;
    dataChannel.addEventListener("open", () => {
      setVoiceMode("openai");
      setVoiceStatus("OpenAI Realtime");
    });
    dataChannel.addEventListener("message", (event) => {
      const realtimeEvent = parseRealtimeEvent(String(event.data));
      if (!realtimeEvent) return;

      const userTranscript = getCompletedInputTranscript(realtimeEvent);
      if (userTranscript) {
        setLiveVoiceText("");
        submitTurnRef.current(userTranscript);
        return;
      }

      const assistantDelta = getResponseAudioTranscriptDelta(realtimeEvent);
      if (assistantDelta) {
        setLiveVoiceText((current) => `${current}${assistantDelta}`);
      }
      if (realtimeEvent.type === "response.done") {
        setLiveVoiceText("");
      }
    });

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    const sdpResponse = await fetch(OPENAI_REALTIME_CALLS_URL, {
      method: "POST",
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${clientSecret}`,
        "Content-Type": "application/sdp",
      },
    });

    if (!sdpResponse.ok) {
      throw new Error(`OpenAI Realtime connection failed: ${sdpResponse.status}`);
    }

    await peerConnection.setRemoteDescription({
      type: "answer",
      sdp: await sdpResponse.text(),
    });
  }, []);

  const startVoice = useCallback(async () => {
    setVoiceMode("connecting");
    setVoiceStatus("Connecting voice");
    setLiveVoiceText("");

    try {
      const tokenResponse = await fetch("/api/oral-exam/realtime-token", {
        method: "POST",
      });

      if (tokenResponse.ok) {
        const payload = (await tokenResponse.json()) as { value?: string };
        if (!payload.value) {
          throw new Error("OpenAI Realtime token was empty.");
        }
        await connectOpenAIRealtime(payload.value);
        return;
      }

      const payload = (await tokenResponse.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(payload?.error ?? "Voice session failed.");
    } catch (error) {
      peerConnectionRef.current?.close();
      peerConnectionRef.current = null;
      micStreamRef.current?.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;

      setVoiceMode("error");
      setVoiceStatus(error instanceof Error ? error.message : "Voice unavailable");
    }
  }, [connectOpenAIRealtime]);

  useEffect(() => {
    if (voiceMode !== "openai") return;

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== "examiner") return;
    if (lastSpokenExaminerIdRef.current === lastMessage.id) return;

    lastSpokenExaminerIdRef.current = lastMessage.id;
    speakExaminerText(lastMessage.text);
  }, [messages, speakExaminerText, voiceMode]);

  const revealedFigures = state.revealedFigureIds
    .map(findFigure)
    .filter((figure): figure is ImageFlashcard => Boolean(figure));
  const primaryFigure = revealedFigures[0];
  const supportingFigures = revealedFigures.slice(1);
  const isComplete = state.stage === "complete";
  const isVoiceActive =
    voiceMode === "connecting" || voiceMode === "openai";
  const voiceButtonLabel =
    voiceMode === "connecting"
      ? "Connecting"
      : isVoiceActive
        ? "Stop voice"
        : "Start voice";

  return (
    <div className="min-h-dvh bg-parchment">
      <audio ref={remoteAudioRef} className="hidden" autoPlay />
      <header className="border-b border-ivory-dark bg-white px-4 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-warm-gray transition-colors hover:bg-ivory hover:text-navy"
              aria-label="Back to library"
            >
              <ArrowLeft size={20} />
            </Link>
            <div className="min-w-0">
              <h1 className="truncate font-[DM_Serif_Display] text-xl text-navy">
                Oral Exam Simulator
              </h1>
              <p className="text-xs text-warm-gray">
                Image-first ASOPRS cases with serial reveal and final source labeling
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => resetCase()}
            className="inline-flex items-center gap-2 rounded-lg border border-ivory-dark px-3 py-2 text-xs font-semibold text-warm-gray transition hover:bg-ivory hover:text-navy"
          >
            <RotateCcw size={14} />
            Restart
          </button>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-4 px-4 py-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(380px,0.72fr)]">
        <section className="min-w-0 overflow-hidden rounded-xl border border-ivory-dark bg-white shadow-sm">
          <div className="border-b border-ivory-dark px-4 py-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-coral">
                  <Stethoscope size={14} />
                  Case
                </p>
                <h2 className="mt-1 truncate font-[DM_Serif_Display] text-2xl text-navy">
                  {getOralExamCaseLabel(selectedCaseIndex)}
                </h2>
              </div>
              <label className="min-w-0 text-xs font-medium text-warm-gray md:w-80">
                Pick a case
                <select
                  value={selectedCaseId}
                  onChange={(event) => resetCase(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-ivory-dark bg-ivory/30 px-3 py-2 text-sm text-navy outline-none transition focus:border-coral"
                >
                  {ORAL_EXAM_CASES.map((oralCase, index) => (
                    <option key={oralCase.id} value={oralCase.id}>
                      {getOralExamCaseLabel(index)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div ref={imageWrapRef} className="p-4">
            {primaryFigure ? (
              <FigurePanel
                figure={primaryFigure}
                label={getOralExamFigureLabel(0)}
                width={imageWidth}
              />
            ) : (
              <div className="flex min-h-80 items-center justify-center text-sm text-warm-gray">
                No starting image found for this case.
              </div>
            )}

            {supportingFigures.length > 0 && (
              <div className="mt-5 border-t border-ivory-dark pt-4">
                <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-warm-gray">
                  <ImageIcon size={14} />
                  Revealed Images
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  {supportingFigures.map((figure, index) => (
                    <FigurePanel
                      key={figure.id}
                      figure={figure}
                      label={getOralExamFigureLabel(index + 1)}
                      width={Math.min(320, imageWidth)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="flex min-h-[calc(100dvh-116px)] min-w-0 flex-col overflow-hidden rounded-xl border border-ivory-dark bg-white shadow-sm">
          <div className="border-b border-ivory-dark px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-sage">
                  <MessageSquareText size={14} />
                  Examiner
                </p>
                <p className="mt-1 text-sm text-warm-gray">
                  Stage: <span className="font-semibold text-navy">{state.stage}</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-warm-gray">
                  Score signals
                </p>
                <p className="mt-1 text-lg font-bold text-navy">{score}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={isVoiceActive ? () => stopVoice() : startVoice}
                disabled={voiceMode === "connecting"}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition disabled:cursor-wait disabled:opacity-70 ${
                  isVoiceActive
                    ? "border border-coral/30 bg-coral/10 text-coral-dark hover:bg-coral/15"
                    : "bg-navy text-white hover:bg-navy/90"
                }`}
                title={voiceButtonLabel}
              >
                {isVoiceActive ? <MicOff size={14} /> : <Mic size={14} />}
                {voiceButtonLabel}
              </button>
              <div className="inline-flex min-h-9 min-w-0 items-center gap-2 rounded-lg border border-ivory-dark bg-ivory/30 px-3 text-xs font-medium text-warm-gray">
                <Volume2 size={14} className="shrink-0" />
                <span className="truncate">{voiceStatus}</span>
              </div>
            </div>
            {liveVoiceText && (
              <p className="mt-2 line-clamp-2 rounded-lg bg-ivory/50 px-3 py-2 text-xs text-warm-gray">
                {liveVoiceText}
              </p>
            )}
          </div>

          {isComplete && (
            <div className="border-b border-sage/20 bg-sage/10 px-4 py-3 text-sm text-sage-dark">
              <div className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{selectedCase.sourceDisclosure}</p>
              </div>
            </div>
          )}

          <div
            ref={transcriptRef}
            className="flex-1 space-y-3 overflow-y-auto bg-ivory/25 px-4 py-4"
          >
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "candidate" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[88%] whitespace-pre-line rounded-xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                    message.role === "candidate"
                      ? "bg-coral text-white"
                      : "border border-ivory-dark bg-white text-navy"
                  }`}
                >
                  {message.text}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-ivory-dark bg-white px-4 py-3">
            <div className="mb-3 grid gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => submitTurn("What is the relevant history and examination?")}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-ivory-dark px-3 py-2 text-xs font-semibold text-navy transition hover:bg-ivory"
              >
                <ClipboardCheck size={14} />
                History
              </button>
              <button
                type="button"
                onClick={() => submitTurn("I would get imaging and biopsy. What does the workup show?")}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-ivory-dark px-3 py-2 text-xs font-semibold text-navy transition hover:bg-ivory"
              >
                <ImageIcon size={14} />
                Workup
              </button>
              <button
                type="button"
                onClick={() =>
                  submitTurn(
                    "I will give my final diagnosis, management, counseling, and surveillance plan."
                  )
                }
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-ivory-dark px-3 py-2 text-xs font-semibold text-navy transition hover:bg-ivory"
              >
                <CheckCircle2 size={14} />
                Finish
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex gap-2">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                rows={2}
                placeholder="Answer the examiner or ask for the next part of the case..."
                className="min-h-12 flex-1 resize-none rounded-lg border border-ivory-dark bg-ivory/40 px-3 py-2 text-sm text-navy outline-none transition focus:border-coral focus:ring-2 focus:ring-coral/15"
              />
              <button
                type="submit"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-coral text-white transition hover:bg-coral-dark disabled:opacity-50"
                disabled={!input.trim()}
                aria-label="Send answer"
              >
                <Send size={18} />
              </button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
