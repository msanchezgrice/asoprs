"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export interface UserFeature {
  id: string;
  feature_key: string;
  feature_module: string;
  mount_point: string | null;
  config: Record<string, unknown>;
  status: string;
}

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function useUserFeatures() {
  const [features, setFeatures] = useState<UserFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const featuresRef = useRef<UserFeature[]>([]);
  const lastFetchRef = useRef<number>(0);
  const userIdRef = useRef<string | null>(null);

  const fetchFeatures = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastFetchRef.current < REFRESH_INTERVAL_MS) return;

    const supabase = createBrowserSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      userIdRef.current = null;
      featuresRef.current = [];
      setFeatures([]);
      setLoading(false);
      return;
    }

    userIdRef.current = user.id;

    try {
      const { data, error } = await supabase
        .from("user_features")
        .select("id, feature_key, feature_module, mount_point, config, status")
        .eq("user_id", user.id)
        .eq("enabled", true)
        .in("status", ["active"]);

      if (error) {
        console.error("[useUserFeatures] query error:", error.message);
        setLoading(false);
        return;
      }

      const mapped: UserFeature[] = (data ?? []).map((row: Record<string, unknown>) => ({
        id: row.id,
        feature_key: row.feature_key,
        feature_module: row.feature_module,
        mount_point: row.mount_point,
        config: (row.config as Record<string, unknown>) ?? {},
        status: row.status,
      }));

      lastFetchRef.current = now;
      featuresRef.current = mapped;
      setFeatures(mapped);
    } catch (err) {
      console.error("[useUserFeatures] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchFeatures(true);

    const interval = setInterval(() => {
      void fetchFeatures();
    }, REFRESH_INTERVAL_MS);

    const handleFocus = () => {
      void fetchFeatures();
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [fetchFeatures]);

  const hasFeature = useCallback(
    (key: string): boolean => {
      return features.some((f) => f.feature_key === key);
    },
    [features],
  );

  const getFeatureConfig = useCallback(
    (key: string): Record<string, unknown> | null => {
      const feature = features.find((f) => f.feature_key === key);
      return feature?.config ?? null;
    },
    [features],
  );

  return { features, hasFeature, getFeatureConfig, loading };
}
