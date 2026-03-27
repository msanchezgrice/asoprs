"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { useAuthSession } from "@/hooks/use-auth-session";

function initialsFromEmail(email: string) {
  return email.slice(0, 1).toUpperCase();
}

export function AccountPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useAuthSession();

  async function handleSignOut() {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.refresh();
    router.push("/");
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-ivory-dark" />
        <div className="space-y-1">
          <div className="h-3 w-28 rounded bg-ivory-dark" />
          <div className="h-3 w-20 rounded bg-ivory-dark" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-coral/10 text-sm font-bold text-coral">
            S
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-navy">Save your study lane</p>
            <p className="truncate text-xs text-warm-gray">
              Sign in for progress, highlights, and history
            </p>
          </div>
        </div>
        <Link
          href={`/sign-in?next=${encodeURIComponent(pathname || "/")}`}
          className="inline-flex w-full items-center justify-center rounded-lg bg-navy px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-navy-light"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sage/15 text-sm font-bold text-sage-dark">
          {initialsFromEmail(user.email)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-navy">
            {user.fullName || user.email}
          </p>
          <p className="truncate text-xs text-warm-gray">{user.email}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={handleSignOut}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-ivory-dark px-3 py-2 text-sm font-semibold text-warm-gray transition-colors hover:bg-ivory hover:text-navy"
      >
        <LogOut size={14} />
        Sign out
      </button>
    </div>
  );
}
