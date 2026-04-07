import type { ComponentType } from "react";

// Registry of user feature modules
// Each entry maps a feature_module string to a lazy-loaded component
const registry: Record<
  string,
  ComponentType<{ config: Record<string, unknown> }>
> = {
  // Example (uncomment when first module is created):
  // 'u_example--sample-feature': dynamic(() => import('./u_example--sample-feature/component')),
};

export function getFeatureComponent(
  featureModule: string,
): ComponentType<{ config: Record<string, unknown> }> | null {
  return registry[featureModule] ?? null;
}

export default registry;
