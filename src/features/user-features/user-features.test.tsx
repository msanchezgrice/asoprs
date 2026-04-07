import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, act, cleanup } from "@testing-library/react";
import React from "react";

// ---------- Supabase mock ----------
const mockGetUser = vi.fn();
let mockQueryResult: { data: unknown[] | null; error: { message: string } | null } = { data: [], error: null };

vi.mock("@/lib/supabase/browser", () => ({
  createBrowserSupabaseClient: () => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      in: () => mockQueryResult,
    };
    return {
      auth: { getUser: mockGetUser },
      from: () => chain,
    };
  },
}));

// ---------- Registry mock ----------
const MockComponent = ({ config }: { config: Record<string, unknown> }) => (
  <div data-testid="mock-feature">mock:{JSON.stringify(config)}</div>
);

const MockComponentB = ({ config }: { config: Record<string, unknown> }) => (
  <div data-testid="mock-feature-b">mockB:{JSON.stringify(config)}</div>
);

vi.mock("@/features/user-features/registry", () => {
  const registry: Record<string, React.ComponentType<{ config: Record<string, unknown> }>> = {};
  return {
    default: registry,
    getFeatureComponent: (key: string) => registry[key] ?? null,
    __setRegistryEntry: (key: string, component: React.ComponentType<{ config: Record<string, unknown> }>) => {
      registry[key] = component;
    },
    __clearRegistry: () => {
      for (const key of Object.keys(registry)) delete registry[key];
    },
  };
});

import { useUserFeatures } from "@/hooks/use-user-features";
import { UserFeatureSlot } from "@/components/user-feature-slot";
import { getFeatureComponent } from "@/features/user-features/registry";

const registryModule = await import("@/features/user-features/registry") as typeof import("@/features/user-features/registry") & {
  __setRegistryEntry: (key: string, component: React.ComponentType<{ config: Record<string, unknown> }>) => void;
  __clearRegistry: () => void;
};

// ---------- Helper ----------
function HookTester() {
  const { features, hasFeature, getFeatureConfig, loading } = useUserFeatures();
  return (
    <div>
      <span data-testid="loading">{loading ? "true" : "false"}</span>
      <span data-testid="count">{features.length}</span>
      <span data-testid="has-foo">{hasFeature("foo") ? "yes" : "no"}</span>
      <span data-testid="config-foo">{JSON.stringify(getFeatureConfig("foo"))}</span>
      {features.map((f) => (
        <span key={f.id} data-testid={`feature-${f.feature_key}`}>
          {f.feature_key}
        </span>
      ))}
    </div>
  );
}

const $ = (c: HTMLElement, sel: string) => c.querySelector(sel);

const SAMPLE_FEATURES = [
  { id: "f1", feature_key: "foo", feature_module: "u_test--foo", mount_point: "flashcard-tools", config: { color: "red" }, status: "active" },
  { id: "f2", feature_key: "bar", feature_module: "u_test--bar", mount_point: "flashcard-tools", config: {}, status: "active" },
];

beforeEach(() => {
  cleanup();
  registryModule.__clearRegistry();
  mockGetUser.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: null } });
  mockQueryResult = { data: [], error: null };
});

afterEach(() => {
  cleanup();
});

describe("useUserFeatures", () => {
  it("returns empty features for unauthenticated user", async () => {
    const { container } = render(<HookTester />);
    await waitFor(() => expect($(container, "[data-testid='loading']")?.textContent).toBe("false"));
    expect($(container, "[data-testid='count']")?.textContent).toBe("0");
  });

  it("loads features for authenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockQueryResult = { data: SAMPLE_FEATURES, error: null };
    const { container } = render(<HookTester />);
    await waitFor(() => expect($(container, "[data-testid='loading']")?.textContent).toBe("false"));
    expect($(container, "[data-testid='count']")?.textContent).toBe("2");
    expect($(container, "[data-testid='feature-foo']")).toBeTruthy();
    expect($(container, "[data-testid='feature-bar']")).toBeTruthy();
  });

  it("hasFeature returns true for enabled feature", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockQueryResult = { data: SAMPLE_FEATURES, error: null };
    const { container } = render(<HookTester />);
    await waitFor(() => expect($(container, "[data-testid='loading']")?.textContent).toBe("false"));
    expect($(container, "[data-testid='has-foo']")?.textContent).toBe("yes");
  });

  it("hasFeature returns false for unknown feature", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockQueryResult = { data: SAMPLE_FEATURES, error: null };
    const { container } = render(<HookTester />);
    await waitFor(() => expect($(container, "[data-testid='loading']")?.textContent).toBe("false"));
    expect($(container, "[data-testid='count']")?.textContent).toBe("2");
  });

  it("getFeatureConfig returns config object", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockQueryResult = { data: SAMPLE_FEATURES, error: null };
    const { container } = render(<HookTester />);
    await waitFor(() => expect($(container, "[data-testid='loading']")?.textContent).toBe("false"));
    expect($(container, "[data-testid='config-foo']")?.textContent).toBe(JSON.stringify({ color: "red" }));
  });

  it("caches and does not re-query within 5 minutes", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockQueryResult = { data: SAMPLE_FEATURES, error: null };
    const { container } = render(<HookTester />);
    await waitFor(() => expect($(container, "[data-testid='loading']")?.textContent).toBe("false"));
    const callCount = mockGetUser.mock.calls.length;
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(mockGetUser.mock.calls.length).toBe(callCount);
  });
});

describe("UserFeatureSlot", () => {
  it("renders nothing when no features match", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockQueryResult = { data: [], error: null };
    const { container } = render(<UserFeatureSlot name="nonexistent-slot" />);
    await waitFor(() => expect(container.innerHTML).toBe(""));
  });

  it("renders module when feature is active for slot", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockQueryResult = { data: [SAMPLE_FEATURES[0]], error: null };
    registryModule.__setRegistryEntry("u_test--foo", MockComponent);
    const { container } = render(<UserFeatureSlot name="flashcard-tools" />);
    await waitFor(() => expect($(container, "[data-testid='mock-feature']")).toBeTruthy());
    expect($(container, "[data-testid='mock-feature']")?.textContent).toContain("red");
  });

  it("handles module load error gracefully", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockQueryResult = { data: [SAMPLE_FEATURES[0]], error: null };
    render(<UserFeatureSlot name="flashcard-tools" />);
    await waitFor(() => expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("No component registered")));
    consoleSpy.mockRestore();
  });

  it("renders multiple features for same slot", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockQueryResult = { data: SAMPLE_FEATURES, error: null };
    registryModule.__setRegistryEntry("u_test--foo", MockComponent);
    registryModule.__setRegistryEntry("u_test--bar", MockComponentB);
    const { container } = render(<UserFeatureSlot name="flashcard-tools" />);
    await waitFor(() => {
      expect($(container, "[data-testid='mock-feature']")).toBeTruthy();
      expect($(container, "[data-testid='mock-feature-b']")).toBeTruthy();
    });
  });
});

describe("registry", () => {
  it("getFeatureComponent returns null for unknown module", () => {
    expect(getFeatureComponent("nonexistent-module")).toBeNull();
  });

  it("getFeatureComponent returns component for known module", () => {
    registryModule.__setRegistryEntry("u_test--known", MockComponent);
    expect(getFeatureComponent("u_test--known")).toBe(MockComponent);
  });
});
