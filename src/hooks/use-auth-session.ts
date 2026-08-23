"use client";

import { createContext, createElement, useContext, useEffect, useMemo, useState } from "react";
import type { AuthChangeEvent } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string | null;
}

interface AuthSessionValue {
  user: SessionUser | null;
  loading: boolean;
}

const AuthSessionContext = createContext<AuthSessionValue>({
  user: null,
  loading: true,
});

export function AuthSessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const supabase = createBrowserSupabaseClient();

    async function loadSession() {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        const authUser = data.user;

        if (!cancelled) {
          setUser(authUser ? {
            id: authUser.id,
            email: authUser.email ?? "",
            fullName: typeof authUser.user_metadata?.full_name === "string"
              ? authUser.user_metadata.full_name
              : null,
          } : null);
        }
      } catch {
        if (!cancelled) {
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: AuthChangeEvent) => {
      if (event !== "INITIAL_SESSION") void loadSession();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(() => ({ user, loading }), [user, loading]);
  return createElement(AuthSessionContext.Provider, { value }, children);
}

export function useAuthSession() {
  return useContext(AuthSessionContext);
}
