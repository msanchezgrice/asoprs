"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type Mode = "sign-in" | "sign-up";

export function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/";
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ctaLabel = useMemo(
    () => (mode === "sign-in" ? "Sign in" : "Create account"),
    [mode]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    const supabase = createBrowserSupabaseClient();

    try {
      if (mode === "sign-in") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          throw signInError;
        }

        router.refresh();
        router.push(nextPath);
        return;
      }

      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName || null,
          },
          emailRedirectTo: redirectTo,
        },
      });

      if (signUpError) {
        throw signUpError;
      }

      setMessage("Check your email to confirm your account, then come back here to continue.");
    } catch (caught) {
      const err = caught as Error;
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr]">
      <section className="rounded-[2rem] border border-white/60 bg-[linear-gradient(135deg,rgba(11,20,38,0.98),rgba(19,32,64,0.92))] p-8 text-white shadow-2xl shadow-navy/10">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-white/80">
          <Sparkles size={13} />
          ASOPRS Study Portal
        </div>
        <h1 className="mt-6 max-w-lg font-[DM_Serif_Display] text-4xl leading-tight md:text-5xl">
          Private study progress that picks up where you left off.
        </h1>
        <p className="mt-4 max-w-md text-sm leading-7 text-white/72">
          Sign in to save flashcard outcomes, keep quiz history, and build a real board-review habit instead of starting over on every device.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {[
            ["Saved review queues", "Spaced repetition follows your account, not the browser."],
            ["Persistent highlights", "Mark and revisit key passages across documents."],
            ["Personal analytics", "Track mastery by topic instead of global shared stats."],
          ].map(([title, body]) => (
            <div
              key={title}
              className="rounded-2xl border border-white/10 bg-white/6 p-4 backdrop-blur-sm"
            >
              <p className="text-sm font-semibold text-white">{title}</p>
              <p className="mt-2 text-xs leading-6 text-white/68">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[2rem] border border-ivory-dark bg-white p-8 shadow-xl shadow-navy/5">
        <div className="flex items-center gap-2 rounded-full bg-ivory px-1 py-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setMode("sign-in")}
            className={`rounded-full px-4 py-2 transition-colors ${
              mode === "sign-in" ? "bg-white text-navy shadow-sm" : "text-warm-gray"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setMode("sign-up")}
            className={`rounded-full px-4 py-2 transition-colors ${
              mode === "sign-up" ? "bg-white text-navy shadow-sm" : "text-warm-gray"
            }`}
          >
            Create account
          </button>
        </div>

        <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
          {mode === "sign-up" && (
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-warm-gray">
                Full name
              </span>
              <input
                type="text"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                className="w-full rounded-2xl border border-ivory-dark bg-parchment px-4 py-3 text-sm text-navy outline-none transition focus:border-coral"
                placeholder="Miguel"
              />
            </label>
          )}

          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-warm-gray">
              Email
            </span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-2xl border border-ivory-dark bg-parchment px-4 py-3 text-sm text-navy outline-none transition focus:border-coral"
              placeholder="you@example.com"
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-warm-gray">
              Password
            </span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-2xl border border-ivory-dark bg-parchment px-4 py-3 text-sm text-navy outline-none transition focus:border-coral"
              placeholder="At least 6 characters"
              minLength={6}
              required
            />
          </label>

          {error && (
            <div className="rounded-2xl border border-coral/20 bg-coral/8 px-4 py-3 text-sm text-coral-dark">
              {error}
            </div>
          )}

          {message && (
            <div className="rounded-2xl border border-sage/20 bg-sage/10 px-4 py-3 text-sm text-sage-dark">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-navy px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-navy-light disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
            {ctaLabel}
          </button>
        </form>

        <p className="mt-4 text-sm text-warm-gray">
          By continuing, you keep your reading history, quiz sessions, and flashcard review queue attached to your account.
        </p>

        <Link
          href={nextPath}
          className="mt-6 inline-flex text-sm font-semibold text-coral transition-colors hover:text-coral-dark"
        >
          Continue without signing in
        </Link>
      </section>
    </div>
  );
}
