import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Anthropic SDK
const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockCreate };
  },
}));

// Mock fetch for GitHub API calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import {
  computeMechanicalRisk,
  applyConfigOverrides,
  type ApprovalConfig,
  type MechanicalRisk,
} from "./approval-agent";

const baseConfig: ApprovalConfig = {
  mode: "dry_run",
  risk_threshold: 30,
  auto_merge_enabled: false,
  require_tests_pass: true,
  require_new_tests: true,
  max_files_changed: 10,
  max_lines_changed: 500,
  blocked_paths: ["src/app/api/auth/", "migrations/"],
  model: "claude-opus-4-6",
  notify_on_approve: true,
  notify_on_escalate: true,
};

const makeFiles = (filenames: string[], additions = 10, deletions = 5) =>
  filenames.map((filename) => ({ filename, additions, deletions }));

describe("approval-agent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("computeMechanicalRisk", () => {
    it("correctly identifies blocked paths", () => {
      const files = makeFiles(["src/app/api/auth/login.ts", "src/lib/utils.ts"]);
      const risk = computeMechanicalRisk(files, baseConfig.blocked_paths);
      expect(risk.touches_blocked_path).toBe(true);
    });

    it("returns false for non-blocked paths", () => {
      const files = makeFiles(["src/lib/utils.ts", "src/components/Button.tsx"]);
      const risk = computeMechanicalRisk(files, baseConfig.blocked_paths);
      expect(risk.touches_blocked_path).toBe(false);
    });

    it("correctly counts files and lines", () => {
      const files = [
        { filename: "src/a.ts", additions: 20, deletions: 5 },
        { filename: "src/b.ts", additions: 30, deletions: 10 },
        { filename: "src/c.ts", additions: 10, deletions: 0 },
      ];
      const risk = computeMechanicalRisk(files, baseConfig.blocked_paths);
      expect(risk.files_changed).toBe(3);
      expect(risk.lines_changed).toBe(75); // 20+5+30+10+10+0
    });

    it("detects auth files", () => {
      const files = makeFiles(["src/middleware/auth-guard.ts"]);
      const risk = computeMechanicalRisk(files, baseConfig.blocked_paths);
      expect(risk.touches_auth).toBe(true);
    });

    it("detects migration files", () => {
      const files = makeFiles(["migrations/007_new_table.sql"]);
      const risk = computeMechanicalRisk(files, baseConfig.blocked_paths);
      expect(risk.touches_migrations).toBe(true);
      expect(risk.touches_blocked_path).toBe(true);
    });

    it("detects test files", () => {
      const files = makeFiles(["src/lib/utils.ts", "src/lib/utils.test.ts"]);
      const risk = computeMechanicalRisk(files, baseConfig.blocked_paths);
      expect(risk.has_tests).toBe(true);
    });

    it("computes test ratio", () => {
      const files = [
        { filename: "src/lib/utils.ts", additions: 100, deletions: 0 },
        { filename: "src/lib/utils.test.ts", additions: 50, deletions: 0 },
      ];
      const risk = computeMechanicalRisk(files, baseConfig.blocked_paths);
      expect(risk.test_ratio).toBe(0.5);
    });

    it("handles no test files", () => {
      const files = makeFiles(["src/lib/utils.ts"]);
      const risk = computeMechanicalRisk(files, baseConfig.blocked_paths);
      expect(risk.has_tests).toBe(false);
      expect(risk.test_ratio).toBe(0);
    });
  });

  describe("applyConfigOverrides", () => {
    const lowRisk: MechanicalRisk = {
      files_changed: 3,
      lines_changed: 50,
      touches_blocked_path: false,
      touches_auth: false,
      touches_migrations: false,
      has_tests: true,
      test_ratio: 0.5,
    };

    it("forces escalate when blocked path is touched", () => {
      const risk = { ...lowRisk, touches_blocked_path: true };
      const result = applyConfigOverrides("approve", 10, risk, baseConfig);
      expect(result.decision).toBe("escalate");
      expect(result.reason).toContain("blocked path");
    });

    it("forces escalate when files exceed max", () => {
      const risk = { ...lowRisk, files_changed: 15 };
      const result = applyConfigOverrides("approve", 10, risk, baseConfig);
      expect(result.decision).toBe("escalate");
      expect(result.reason).toContain("Files changed");
    });

    it("forces escalate when lines exceed max", () => {
      const risk = { ...lowRisk, lines_changed: 600 };
      const result = applyConfigOverrides("approve", 10, risk, baseConfig);
      expect(result.decision).toBe("escalate");
      expect(result.reason).toContain("Lines changed");
    });

    it("forces request_changes when no tests and tests required", () => {
      const risk = { ...lowRisk, has_tests: false };
      const result = applyConfigOverrides("approve", 10, risk, baseConfig);
      expect(result.decision).toBe("request_changes");
      expect(result.reason).toContain("No test files");
    });

    it("dry_run mode posts comment but does not change AI decision", () => {
      const config = { ...baseConfig, mode: "dry_run" as const };
      const result = applyConfigOverrides("approve", 10, lowRisk, config);
      expect(result.decision).toBe("approve");
      // In dry_run, the caller checks mode before merging
    });

    it("auto_low_risk mode approves when risk below threshold", () => {
      const config = { ...baseConfig, mode: "auto_low_risk" as const, risk_threshold: 30 };
      const result = applyConfigOverrides("approve", 20, lowRisk, config);
      expect(result.decision).toBe("approve");
    });

    it("auto_low_risk mode escalates when risk above threshold", () => {
      const config = { ...baseConfig, mode: "auto_low_risk" as const, risk_threshold: 30 };
      const result = applyConfigOverrides("approve", 50, lowRisk, config);
      expect(result.decision).toBe("escalate");
      expect(result.reason).toContain("Risk score 50");
    });

    it("disabled mode skips everything", () => {
      const config = { ...baseConfig, mode: "disabled" as const };
      const result = applyConfigOverrides("approve", 10, lowRisk, config);
      expect(result.decision).toBe("escalate");
      expect(result.reason).toContain("disabled");
    });

    it("auto_all mode approves regardless of risk score", () => {
      const config = { ...baseConfig, mode: "auto_all" as const };
      const result = applyConfigOverrides("escalate", 80, lowRisk, config);
      expect(result.decision).toBe("approve");
    });

    it("auto_low_risk passes through request_changes from AI", () => {
      const config = { ...baseConfig, mode: "auto_low_risk" as const };
      const result = applyConfigOverrides("request_changes", 20, lowRisk, config);
      expect(result.decision).toBe("request_changes");
    });
  });
});
