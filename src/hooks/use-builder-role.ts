"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export interface BuilderRole {
  role: 'admin' | 'builder' | 'tester' | 'user';
  canModify: string[];  // page categories this role can propose changes to
}

const DEFAULT_ROLE: BuilderRole = { role: 'user', canModify: [] };
const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function useBuilderRole() {
  const [builderRole, setBuilderRole] = useState<BuilderRole>(DEFAULT_ROLE);
  const [loading, setLoading] = useState(true);
  const lastFetchRef = useRef<number>(0);

  const fetchRole = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastFetchRef.current < REFRESH_INTERVAL_MS) return;

    const supabase = createBrowserSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setBuilderRole(DEFAULT_ROLE);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("builder_roles")
        .select("role, can_modify")
        .eq("user_id", user.id)
        .single();

      if (error && error.code !== "PGRST116") {
        console.error("[useBuilderRole] query error:", error.message);
        setBuilderRole(DEFAULT_ROLE);
        setLoading(false);
        return;
      }

      if (data) {
        lastFetchRef.current = now;
        setBuilderRole({
          role: data.role as BuilderRole['role'],
          canModify: Array.isArray(data.can_modify) ? data.can_modify : [],
        });
      } else {
        setBuilderRole(DEFAULT_ROLE);
      }
    } catch (err) {
      console.error("[useBuilderRole] fetch error:", err);
      setBuilderRole(DEFAULT_ROLE);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRole(true);

    const interval = setInterval(() => {
      void fetchRole();
    }, REFRESH_INTERVAL_MS);

    const handleFocus = () => {
      void fetchRole();
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [fetchRole]);

  const isBuilder = builderRole.role === 'admin' || builderRole.role === 'builder';
  const isAdmin = builderRole.role === 'admin';

  const canModifyCategory = useCallback(
    (category: string): boolean => {
      if (builderRole.canModify.includes('*')) return true;
      return builderRole.canModify.includes(category);
    },
    [builderRole.canModify],
  );

  return { builderRole, isBuilder, isAdmin, canModifyCategory, loading };
}
