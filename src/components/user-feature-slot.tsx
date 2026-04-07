"use client";

import React from "react";
import { useUserFeatures } from "@/hooks/use-user-features";
import { getFeatureComponent } from "@/features/user-features/registry";

interface UserFeatureSlotProps {
  name: string;
  fallback?: React.ReactNode;
}

export function UserFeatureSlot({ name, fallback }: UserFeatureSlotProps) {
  const { features, loading } = useUserFeatures();

  if (loading) return null;

  const slotFeatures = features.filter((f) => f.mount_point === name);

  if (slotFeatures.length === 0) {
    return <>{fallback ?? null}</>;
  }

  return (
    <>
      {slotFeatures.map((feature) => {
        const Component = getFeatureComponent(feature.feature_module);
        if (!Component) {
          console.error(
            `[UserFeatureSlot] No component registered for module: ${feature.feature_module}`,
          );
          return null;
        }
        return <Component key={feature.id} config={feature.config} />;
      })}
    </>
  );
}
