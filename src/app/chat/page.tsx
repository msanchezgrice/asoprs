"use client";

import { useState, useEffect } from "react";
import {
  Send,
  BookOpen,
  Sparkles,
  FileText,
} from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: { doc: string; page: number }[];
}

const SUGGESTED_QUESTIONS = [
  "Compare surgical approaches for orbital decompression",
  "What are the indications for ptosis repair?",
  "Explain the Chandler classification system",
  "How does thyroid eye disease affect extraocular muscles?",
  "What are the key steps in DCR surgery?",
  "Differential diagnosis of proptosis in adults",
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [scope, setScope] = useState<"all" | "single">("all");
  const [docCount, setDocCount] = useState<number | null>(null);

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) => setDocCount(d.documents || 0))
      .catch(() => {});
  }, []);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      content: input,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input }),
      });
      const data = await res.json();

      const botMsg: Message = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: data.answer || data.error || "Sorry, I couldn't generate a response.",
        sources: data.sources?.map((s: { title: string }) => ({
          doc: s.title,
          page: 1,
        })),
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: "Sorry, an error occurred. Please try again.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-dvh flex-col md:h-screen">
      {/* Header */}
      <header className="border-b border-ivory-dark bg-white px-4 py-4 md:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-[DM_Serif_Display] text-2xl text-navy">
                AI Study Assistant
              </h1>
              <p className="mt-1 text-xs text-warm-gray">
                Ask questions grounded in your {docCount ?? "…"} ASOPRS documents
              </p>
            </div>
            <div className="flex rounded-lg border border-ivory-dark p-0.5">
              <button
                onClick={() => setScope("all")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  scope === "all"
                    ? "bg-navy text-white"
                    : "text-warm-gray hover:text-navy"
                }`}
              >
                All Docs
              </button>
              <button
                onClick={() => setScope("single")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  scope === "single"
                    ? "bg-navy text-white"
                    : "text-warm-gray hover:text-navy"
                }`}
              >
                Single Doc
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Messages area */}
      <div className="flex-1 overflow-auto px-4 py-6 md:px-8">
        <div className="mx-auto max-w-3xl space-y-6">
          {messages.length === 0 ? (
            <div className="py-16 text-center">
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-coral/10">
                <Sparkles size={28} className="text-coral" />
              </div>
              <h2 className="font-[DM_Serif_Display] text-2xl text-navy">
                Ask anything about ASOPRS
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-warm-gray">
                Your AI assistant has access to all {docCount ?? "…"} documents. Ask questions
                about diagnoses, surgical techniques, management, or anything
                from the board review material.
              </p>

              <div className="mx-auto mt-8 grid max-w-xl gap-2 sm:grid-cols-2">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => setInput(q)}
                    className="flex items-start gap-2 rounded-xl border border-ivory-dark bg-white p-3 text-left text-xs text-navy transition-all hover:border-coral/30 hover:shadow-sm"
                  >
                    <BookOpen
                      size={14}
                      className="mt-0.5 shrink-0 text-coral"
                    />
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}
              >
                {msg.role === "assistant" && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-coral/10">
                    <Sparkles size={14} className="text-coral" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                    msg.role === "user"
                      ? "bg-navy text-white"
                      : "border border-ivory-dark bg-white"
                  }`}
                >
                  <p
                    className={`text-sm leading-relaxed whitespace-pre-line ${
                      msg.role === "user" ? "text-white" : "text-navy"
                    }`}
                  >
                    {msg.content}
                  </p>

                  {msg.sources && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {msg.sources.map((s, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 rounded-md bg-ivory px-2 py-1 text-[10px] font-medium text-warm-gray"
                        >
                          <FileText size={10} />
                          {s.doc} p.{s.page}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-ivory-dark bg-white px-4 py-3 md:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-end gap-2">
            <div className="flex-1 rounded-xl border border-ivory-dark bg-ivory/50 focus-within:border-coral focus-within:ring-2 focus-within:ring-coral/20">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Ask about any ASOPRS topic..."
                rows={1}
                className="w-full resize-none bg-transparent px-4 py-3 text-sm text-navy placeholder:text-warm-gray-light focus:outline-none"
              />
            </div>
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-coral text-white transition-all hover:bg-coral-dark disabled:bg-ivory-dark disabled:text-warm-gray active:scale-95"
            >
              <Send size={18} />
            </button>
          </div>
          <p className="mt-2 text-center text-[10px] text-warm-gray-light">
            Responses are grounded in your ASOPRS documents. Always verify with
            primary sources.
          </p>
        </div>
      </div>
    </div>
  );
}
