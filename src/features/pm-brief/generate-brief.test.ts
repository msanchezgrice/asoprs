import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted so mocks are available when vi.mock factories run
const { mockCreate, mockInsert } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockInsert: vi.fn().mockResolvedValue({ data: null, error: null }),
}));

// Track data per-table for the mock
let feedbackData: unknown[] = [];
let sessionsData: unknown[] = [];

// Mock Anthropic SDK
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockCreate };
  },
}));

// Mock Supabase — build a chainable mock that resolves with per-table data
vi.mock("@/lib/supabase", () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      if (table === "pm_briefs") {
        return { insert: mockInsert };
      }

      // Build a chainable query builder that eventually resolves
      const resolveWith = (data: unknown[]) => {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        chain.select = self;
        chain.gte = self;
        chain.eq = self;
        chain.in = self;
        chain.not = self;
        chain.order = self;
        // Make it thenable so `await` works
        chain.then = (resolve: (v: { data: unknown[] }) => void) =>
          Promise.resolve({ data }).then(resolve);
        return chain;
      };

      if (table === "feedback_entries") return resolveWith(feedbackData);
      if (table === "companion_sessions") return resolveWith(sessionsData);
      if (table === "companion_turns") return resolveWith([]);
      return resolveWith([]);
    },
  }),
}));

import {
  generateGlobalBrief,
  generateUserBrief,
  type DeliveryStrategy,
} from "./generate-brief";

function makeClaudeResponse(data: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
  };
}

const VALID_STRATEGIES: DeliveryStrategy[] = [
  "global_fix",
  "config_change",
  "content_weight",
  "isolated_module",
];

describe("generate-brief", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    feedbackData = [];
    sessionsData = [];
  });

  describe("generateGlobalBrief", () => {
    it("returns valid PMBriefResult structure", async () => {
      feedbackData = [
        { tag: "bug", screen: "flashcards", free_text: "Cards not loading", created_at: "2026-04-06T10:00:00Z", user_id: "u1" },
      ];

      mockCreate.mockResolvedValueOnce(
        makeClaudeResponse({
          summary: "One bug report about flashcards",
          top_friction_points: ["Cards not loading"],
          unused_features: ["mindmap"],
          proposals: [
            {
              title: "Fix flashcard loading",
              description: "Debug and fix the card loading issue",
              origin_type: "bug",
              evidence: "User reported cards not loading at 10:00",
              confidence: "high",
              tier: "code",
              delivery_strategy: "global_fix",
            },
          ],
        }),
      );

      const result = await generateGlobalBrief();

      expect(result).toHaveProperty("summary");
      expect(result).toHaveProperty("top_friction_points");
      expect(result).toHaveProperty("unused_features");
      expect(result).toHaveProperty("proposals");
      expect(result).toHaveProperty("raw_data");
      expect(typeof result.summary).toBe("string");
      expect(Array.isArray(result.top_friction_points)).toBe(true);
      expect(Array.isArray(result.unused_features)).toBe(true);
      expect(Array.isArray(result.proposals)).toBe(true);
      expect(result.raw_data).toHaveProperty("feedback_count");
      expect(result.raw_data).toHaveProperty("session_count");
      expect(result.raw_data).toHaveProperty("total_turns");
    });

    it("returns empty brief when no data", async () => {
      feedbackData = [];
      sessionsData = [];

      const result = await generateGlobalBrief();

      expect(result.proposals).toHaveLength(0);
      expect(result.raw_data.feedback_count).toBe(0);
      expect(result.raw_data.session_count).toBe(0);
      expect(result.summary).toContain("No user activity");
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("scope field is 'global' for global brief", async () => {
      feedbackData = [
        { tag: "bug", screen: "quiz", free_text: "Broken button", created_at: "2026-04-06T10:00:00Z", user_id: "u1" },
      ];

      mockCreate.mockResolvedValueOnce(
        makeClaudeResponse({
          summary: "Bug in quiz",
          top_friction_points: [],
          unused_features: [],
          proposals: [
            {
              title: "Fix quiz button",
              description: "Fix the broken button",
              origin_type: "bug",
              evidence: "Reported at 10:00",
              confidence: "high",
              tier: "code",
              delivery_strategy: "global_fix",
            },
          ],
        }),
      );

      const result = await generateGlobalBrief();
      expect(result.proposals.length).toBeGreaterThan(0);
      for (const p of result.proposals) {
        expect(p.scope).toBe("global");
        expect(p.target_user_id).toBeNull();
      }
    });
  });

  describe("generateUserBrief", () => {
    it("returns brief scoped to one user", async () => {
      feedbackData = [
        { tag: "request", screen: "flashcards", free_text: "I wish I could zoom in on images", created_at: "2026-04-06T10:00:00Z", user_id: "user-abc" },
      ];

      mockCreate.mockResolvedValueOnce(
        makeClaudeResponse({
          summary: "User wants image zoom",
          top_friction_points: ["No image zoom"],
          unused_features: [],
          proposals: [
            {
              title: "Add image zoom",
              description: "Allow zooming on flashcard images",
              origin_type: "request",
              evidence: "User said: I wish I could zoom in",
              confidence: "high",
              tier: "code",
              delivery_strategy: "isolated_module",
            },
          ],
        }),
      );

      const result = await generateUserBrief("user-abc");

      expect(result.proposals.length).toBeGreaterThan(0);
      for (const p of result.proposals) {
        expect(p.scope).toBe("user");
        expect(p.target_user_id).toBe("user-abc");
      }
    });

    it("returns empty brief with no user data", async () => {
      feedbackData = [];
      sessionsData = [];

      const result = await generateUserBrief("user-no-data");

      expect(result.proposals).toHaveLength(0);
      expect(result.raw_data.feedback_count).toBe(0);
      expect(result.summary).toContain("No activity");
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("scope field is 'user' for per-user brief", async () => {
      feedbackData = [
        { tag: "annoyance", screen: "search", free_text: "Search is slow", created_at: "2026-04-06T10:00:00Z", user_id: "user-xyz" },
      ];

      mockCreate.mockResolvedValueOnce(
        makeClaudeResponse({
          summary: "User finds search slow",
          top_friction_points: ["Slow search"],
          unused_features: [],
          proposals: [
            {
              title: "Optimize search for user",
              description: "Tune search indexing",
              origin_type: "annoyance",
              evidence: "User said search is slow",
              confidence: "medium",
              tier: "config",
              delivery_strategy: "config_change",
            },
          ],
        }),
      );

      const result = await generateUserBrief("user-xyz");
      for (const p of result.proposals) {
        expect(p.scope).toBe("user");
      }
    });
  });

  describe("delivery_strategy classification", () => {
    it("delivery_strategy is one of the 4 valid values", async () => {
      feedbackData = [
        { tag: "bug", screen: "pdf", free_text: "Crash on open", created_at: "2026-04-06T10:00:00Z", user_id: "u1" },
      ];

      mockCreate.mockResolvedValueOnce(
        makeClaudeResponse({
          summary: "PDF crash",
          top_friction_points: [],
          unused_features: [],
          proposals: [
            {
              title: "Fix PDF crash",
              description: "Fix crash on PDF open",
              origin_type: "bug",
              evidence: "Crash at 10:00",
              confidence: "high",
              tier: "code",
              delivery_strategy: "global_fix",
            },
            {
              title: "Adjust difficulty",
              description: "Lower default difficulty",
              origin_type: "pattern",
              evidence: "Many low scores",
              confidence: "medium",
              tier: "config",
              delivery_strategy: "config_change",
            },
          ],
        }),
      );

      const result = await generateGlobalBrief();
      for (const p of result.proposals) {
        expect(VALID_STRATEGIES).toContain(p.delivery_strategy);
      }
    });

    it("classifies bug report as global_fix", async () => {
      feedbackData = [
        { tag: "bug", screen: "flashcards", free_text: "App crashes when I flip a card", created_at: "2026-04-06T10:00:00Z", user_id: "u1" },
      ];

      mockCreate.mockResolvedValueOnce(
        makeClaudeResponse({
          summary: "Critical bug: crash on card flip",
          top_friction_points: ["App crash"],
          unused_features: [],
          proposals: [
            {
              title: "Fix card flip crash",
              description: "Debug and fix the crash when flipping flashcards",
              origin_type: "bug",
              evidence: "User reported crash at 10:00",
              confidence: "high",
              tier: "code",
              delivery_strategy: "global_fix",
            },
          ],
        }),
      );

      const result = await generateGlobalBrief();
      expect(result.proposals[0].delivery_strategy).toBe("global_fix");
    });

    it("classifies 'I wish I could...' as isolated_module", async () => {
      feedbackData = [
        { tag: "request", screen: "flashcards", free_text: "I wish I could create custom study sets", created_at: "2026-04-06T10:00:00Z", user_id: "u1" },
      ];

      mockCreate.mockResolvedValueOnce(
        makeClaudeResponse({
          summary: "Feature request for custom study sets",
          top_friction_points: [],
          unused_features: [],
          proposals: [
            {
              title: "Custom study set builder",
              description: "Allow users to create their own study sets",
              origin_type: "request",
              evidence: "User said: I wish I could create custom study sets",
              confidence: "high",
              tier: "code",
              delivery_strategy: "isolated_module",
            },
          ],
        }),
      );

      const result = await generateGlobalBrief();
      expect(result.proposals[0].delivery_strategy).toBe("isolated_module");
    });
  });

  describe("concurrent brief generation", () => {
    it("one failure does not block others", async () => {
      feedbackData = [
        { tag: "request", screen: "quiz", free_text: "More questions", created_at: "2026-04-06T10:00:00Z", user_id: "user-1" },
      ];

      let callCount = 0;
      mockCreate.mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          // Return invalid JSON to trigger the catch block (not a thrown error)
          return Promise.resolve({
            content: [{ type: "text", text: "NOT VALID JSON {{" }],
          });
        }
        return Promise.resolve(
          makeClaudeResponse({
            summary: "Brief generated",
            top_friction_points: [],
            unused_features: [],
            proposals: [
              {
                title: "Add questions",
                description: "More quiz questions",
                origin_type: "request",
                evidence: "User asked for more",
                confidence: "medium",
                tier: "code",
                delivery_strategy: "content_weight",
              },
            ],
          }),
        );
      });

      const results = await Promise.allSettled([
        generateUserBrief("user-1"),
        generateUserBrief("user-2"),
        generateUserBrief("user-3"),
      ]);

      // All should fulfill (the failed one catches internally and returns empty brief)
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      expect(fulfilled).toHaveLength(3);

      // The second one should have the parse-failure summary
      const secondResult = (results[1] as PromiseFulfilledResult<{ summary: string }>).value;
      expect(secondResult.summary).toContain("Failed to parse");

      // The others should have real proposals
      const firstResult = (results[0] as PromiseFulfilledResult<{ proposals: unknown[] }>).value;
      const thirdResult = (results[2] as PromiseFulfilledResult<{ proposals: unknown[] }>).value;
      expect(firstResult.proposals.length).toBeGreaterThan(0);
      expect(thirdResult.proposals.length).toBeGreaterThan(0);
    });
  });
});
