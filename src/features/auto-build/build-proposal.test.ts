import { describe, it, expect, vi, beforeEach } from "vitest";

// Track updates made to shipped_changes
let updateCalls: Array<{ table: string; data: unknown; id: string }> = [];
let selectResult: { data: unknown; error: unknown } = { data: null, error: null };

// Mock Anthropic SDK (imported by build-proposal but not used by executeBuildPlan)
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: vi.fn() };
  },
}));

// Mock Supabase with chainable builder
vi.mock("@/lib/supabase", () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      chain.update = (data: unknown) => {
        // Store for assertions, return chain for .eq()
        const eqChain: Record<string, unknown> = {};
        eqChain.eq = (_col: string, id: string) => {
          updateCalls.push({ table, data, id });
          return Promise.resolve({ data: null, error: null });
        };
        return eqChain;
      };
      chain.select = () => {
        const eqChain: Record<string, unknown> = {};
        eqChain.eq = () => {
          const singleChain: Record<string, unknown> = {};
          singleChain.single = () => Promise.resolve(selectResult);
          return singleChain;
        };
        return eqChain;
      };
      return chain;
    },
  }),
}));

import {
  executeBuildPlan,
  toKebabCase,
  generateGlobalFixPrompt,
  generateConfigChangePrompt,
  generateContentWeightPrompt,
  generateIsolatedModulePrompt,
} from "./build-proposal";

const basePrd = {
  problem: "Users forget spaced repetition schedule",
  solution: "Add a reminder notification system",
  acceptance_criteria: ["Reminders fire on time", "User can snooze"],
  files_to_modify: ["src/features/reminders/reminder.ts"],
  test_requirements: ["Test reminder scheduling"],
  rollback_plan: "Revert the commit",
};

describe("build-proposal", () => {
  beforeEach(() => {
    updateCalls = [];
    selectResult = { data: { title: "Add Reminder Notifications" }, error: null };
  });

  describe("toKebabCase", () => {
    it("converts title to kebab-case", () => {
      expect(toKebabCase("Add Reminder Notifications")).toBe("add-reminder-notifications");
    });

    it("strips special characters", () => {
      expect(toKebabCase("Fix: user's bug!")).toBe("fix-user-s-bug");
    });
  });

  describe("executeBuildPlan with global_fix", () => {
    it("returns standard implementation prompt", async () => {
      const result = await executeBuildPlan("change-1", basePrd, "code", "global_fix");

      expect(result.success).toBe(true);
      expect(result.result).toContain("Implement this change in the OculoPrep study portal");
      expect(result.result).toContain(basePrd.problem);
      expect(result.result).toContain(basePrd.solution);
      expect(result.result).toContain("src/features/reminders/reminder.ts");
      expect(result.buildStatus).toBeUndefined();
    });

    it("stores ready_for_build status in DB", async () => {
      await executeBuildPlan("change-1", basePrd, "code", "global_fix");

      expect(updateCalls).toHaveLength(1);
      const ctx = updateCalls[0].data as { feature_context: Record<string, unknown> };
      expect(ctx.feature_context.build_status).toBe("ready_for_build");
      expect(ctx.feature_context.delivery_strategy).toBe("global_fix");
    });
  });

  describe("executeBuildPlan with config_change", () => {
    it("returns SQL-only prompt with no GitHub Issue needed", async () => {
      const result = await executeBuildPlan(
        "change-2",
        basePrd,
        "config",
        "config_change",
        "user-abc-123",
      );

      expect(result.success).toBe(true);
      expect(result.buildStatus).toBe("config_applied");
      expect(result.result).toContain("config-only change");
      expect(result.result).toContain("user-abc-123");
      expect(result.result).toContain("user_memory_profiles");
      expect(result.result).toContain("UPDATE");
    });

    it("stores config_applied status in DB", async () => {
      await executeBuildPlan("change-2", basePrd, "config", "config_change", "user-abc-123");

      expect(updateCalls).toHaveLength(1);
      const ctx = updateCalls[0].data as { feature_context: Record<string, unknown> };
      expect(ctx.feature_context.build_status).toBe("config_applied");
      expect(ctx.feature_context.build_method).toBe("config_update");
      expect(ctx.feature_context.delivery_strategy).toBe("config_change");
    });
  });

  describe("executeBuildPlan with content_weight", () => {
    it("returns SQL-only prompt for content weight adjustment", async () => {
      const result = await executeBuildPlan(
        "change-3",
        basePrd,
        "code",
        "content_weight",
        "user-xyz-789",
      );

      expect(result.success).toBe(true);
      expect(result.buildStatus).toBe("config_applied");
      expect(result.result).toContain("content weight adjustment");
      expect(result.result).toContain("user-xyz-789");
      expect(result.result).toContain("format_usage_stats");
      expect(result.result).toContain("UPDATE");
    });

    it("stores config_applied status with content_weight method", async () => {
      await executeBuildPlan("change-3", basePrd, "code", "content_weight", "user-xyz-789");

      const ctx = updateCalls[0].data as { feature_context: Record<string, unknown> };
      expect(ctx.feature_context.build_status).toBe("config_applied");
      expect(ctx.feature_context.build_method).toBe("content_weight");
    });
  });

  describe("executeBuildPlan with isolated_module", () => {
    it("includes registry.ts update instruction", async () => {
      const result = await executeBuildPlan(
        "change-4",
        basePrd,
        "code",
        "isolated_module",
        "user-mod-456",
      );

      expect(result.success).toBe(true);
      expect(result.result).toContain("registry.ts");
      expect(result.result).toContain("Register in src/features/user-features/registry.ts");
    });

    it("includes user_features INSERT statement", async () => {
      const result = await executeBuildPlan(
        "change-4",
        basePrd,
        "code",
        "isolated_module",
        "user-mod-456",
      );

      expect(result.result).toContain("INSERT INTO user_features");
      expect(result.result).toContain("user-mod-456");
      expect(result.result).toContain("isolated_module");
    });

    it("generates correct feature key from title", async () => {
      selectResult = { data: { title: "Custom Spaced Repetition Widget" }, error: null };
      const result = await executeBuildPlan(
        "change-4",
        basePrd,
        "code",
        "isolated_module",
        "user-mod-456",
      );

      expect(result.result).toContain("custom-spaced-repetition-widget");
      expect(result.result).toContain("FEATURE KEY: custom-spaced-repetition-widget");
    });

    it("derives mount point from files_to_modify", async () => {
      const result = await executeBuildPlan(
        "change-4",
        basePrd,
        "code",
        "isolated_module",
        "user-mod-456",
      );

      // basePrd has files_to_modify: ["src/features/reminders/reminder.ts"]
      // mount point should strip src/ prefix and extension
      expect(result.result).toContain("features/reminders/reminder");
    });

    it("uses global-overlay as default mount point when no files", async () => {
      const emptyFilesPrd = { ...basePrd, files_to_modify: [] };
      const result = await executeBuildPlan(
        "change-4",
        emptyFilesPrd,
        "code",
        "isolated_module",
        "user-mod-456",
      );

      expect(result.result).toContain("global-overlay");
    });

    it("stores ready_for_build status (needs GitHub Issue)", async () => {
      await executeBuildPlan("change-4", basePrd, "code", "isolated_module", "user-mod-456");

      const ctx = updateCalls[0].data as { feature_context: Record<string, unknown> };
      expect(ctx.feature_context.build_status).toBe("ready_for_build");
      expect(ctx.feature_context.delivery_strategy).toBe("isolated_module");
    });

    it("includes self-contained component rules", async () => {
      const result = await executeBuildPlan(
        "change-4",
        basePrd,
        "code",
        "isolated_module",
        "user-mod-456",
      );

      expect(result.result).toContain("SELF-CONTAINED");
      expect(result.result).toContain("config");
    });
  });

  describe("executeBuildPlan defaults", () => {
    it("defaults to global_fix for code tier with no strategy", async () => {
      const result = await executeBuildPlan("change-5", basePrd, "code");

      expect(result.result).toContain("Implement this change");
      expect(result.buildStatus).toBeUndefined();
    });

    it("defaults to config_change for config tier with no strategy", async () => {
      const result = await executeBuildPlan("change-6", basePrd, "config");

      expect(result.buildStatus).toBe("config_applied");
      expect(result.result).toContain("config-only change");
    });
  });

  describe("prompt generators", () => {
    it("generateGlobalFixPrompt includes all PRD fields", () => {
      const prompt = generateGlobalFixPrompt(basePrd);
      expect(prompt).toContain(basePrd.problem);
      expect(prompt).toContain(basePrd.solution);
      expect(prompt).toContain("Reminders fire on time");
      expect(prompt).toContain("npm run test");
    });

    it("generateConfigChangePrompt includes user ID and SQL", () => {
      const prompt = generateConfigChangePrompt(basePrd, "user-123");
      expect(prompt).toContain("user-123");
      expect(prompt).toContain("UPDATE user_memory_profiles");
    });

    it("generateContentWeightPrompt includes format_usage_stats", () => {
      const prompt = generateContentWeightPrompt(basePrd, "user-456");
      expect(prompt).toContain("user-456");
      expect(prompt).toContain("format_usage_stats");
    });

    it("generateIsolatedModulePrompt includes full module scaffold", () => {
      const prompt = generateIsolatedModulePrompt(basePrd, "user-789", "My Cool Widget");
      expect(prompt).toContain("my-cool-widget");
      expect(prompt).toContain("component.tsx");
      expect(prompt).toContain("mount.ts");
      expect(prompt).toContain("registry.ts");
      expect(prompt).toContain("user_features");
    });
  });
});
