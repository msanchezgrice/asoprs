import Anthropic from "@anthropic-ai/sdk";

const GITHUB_REPO = "msanchezgrice/asoprs";

export interface ApprovalConfig {
  mode: "dry_run" | "auto_low_risk" | "auto_all" | "disabled";
  risk_threshold: number;
  auto_merge_enabled: boolean;
  require_tests_pass: boolean;
  require_new_tests: boolean;
  max_files_changed: number;
  max_lines_changed: number;
  blocked_paths: string[];
  model: string;
  notify_on_approve: boolean;
  notify_on_escalate: boolean;
}

export interface ApprovalResult {
  decision: "approve" | "request_changes" | "escalate";
  risk_score: number;
  confidence: number;
  reasoning: {
    what_changed: string;
    failure_modes: string[];
    what_verified: string[];
    confidence_gaps: string[];
    blast_radius: "low" | "medium" | "high";
  };
  auto_merged: boolean;
}

export interface MechanicalRisk {
  files_changed: number;
  lines_changed: number;
  touches_blocked_path: boolean;
  touches_auth: boolean;
  touches_migrations: boolean;
  has_tests: boolean;
  test_ratio: number;
}

interface GitHubFile {
  filename: string;
  additions: number;
  deletions: number;
  patch?: string;
}

interface GitHubPR {
  title: string;
  body: string;
  additions: number;
  deletions: number;
  diff_url: string;
}

async function githubFetch(path: string, token: string, accept?: string): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: accept ?? "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
}

export function computeMechanicalRisk(
  files: GitHubFile[],
  blockedPaths: string[],
): MechanicalRisk {
  const filesChanged = files.length;
  const linesChanged = files.reduce((sum, f) => sum + f.additions + f.deletions, 0);

  const touchesBlockedPath = files.some((f) =>
    blockedPaths.some((bp) => f.filename.startsWith(bp)),
  );

  const touchesAuth = files.some((f) => f.filename.toLowerCase().includes("auth"));
  const touchesMigrations = files.some((f) => f.filename.endsWith(".sql"));

  const testFiles = files.filter(
    (f) =>
      f.filename.includes(".test.") ||
      f.filename.includes(".spec.") ||
      f.filename.includes("__tests__"),
  );
  const hasTests = testFiles.length > 0;

  const testLines = testFiles.reduce((sum, f) => sum + f.additions, 0);
  const prodFiles = files.filter(
    (f) =>
      !f.filename.includes(".test.") &&
      !f.filename.includes(".spec.") &&
      !f.filename.includes("__tests__"),
  );
  const prodLines = prodFiles.reduce((sum, f) => sum + f.additions, 0);
  const testRatio = prodLines > 0 ? testLines / prodLines : 0;

  return {
    files_changed: filesChanged,
    lines_changed: linesChanged,
    touches_blocked_path: touchesBlockedPath,
    touches_auth: touchesAuth,
    touches_migrations: touchesMigrations,
    has_tests: hasTests,
    test_ratio: Math.round(testRatio * 100) / 100,
  };
}

function buildReviewPrompt(
  prNumber: number,
  pr: GitHubPR,
  files: GitHubFile[],
  diff: string,
  risk: MechanicalRisk,
  config: ApprovalConfig,
): string {
  const fileList = files.map((f) => `- ${f.filename} (+${f.additions} -${f.deletions})`).join("\n");

  return `You are a senior engineering manager reviewing a pull request for auto-merge approval.
Your job is to determine if this PR is safe to merge automatically without human review.

## PR #${prNumber}: ${pr.title}

## Diff summary
${files.length} files changed, ${pr.additions} additions, ${pr.deletions} deletions

## Files changed
${fileList}

## Full diff
${diff}

## Mechanical risk factors (pre-computed)
- Files changed: ${risk.files_changed} (max allowed: ${config.max_files_changed})
- Lines changed: ${risk.lines_changed} (max allowed: ${config.max_lines_changed})
- Touches blocked path: ${risk.touches_blocked_path}
- Has test files: ${risk.has_tests}
- Test ratio: ${risk.test_ratio}

## Your task

Analyze this PR and output a JSON response with this exact structure:
{
  "what_changed": "One sentence: what does this PR actually do?",
  "failure_modes": ["List every way this could break in production"],
  "what_verified": ["List every specific thing you checked, with file:line references"],
  "confidence_gaps": ["List anything you're NOT confident about"],
  "blast_radius": "low|medium|high",
  "risk_score": <0-100>,
  "confidence": <1-10>,
  "decision": "approve|request_changes|escalate",
  "decision_reasoning": "Why you made this decision"
}

## Decision criteria
- APPROVE (risk_score < ${config.risk_threshold}): Small, well-tested change. Clear what it does. No auth/data/payment code. Tests pass and new tests added.
- REQUEST_CHANGES: Tests missing, unclear scope, or mechanical issues.
- ESCALATE: Touches sensitive code, large blast radius, or you're not confident.

## Rules
- Be paranoid. Production bugs are worse than slow approvals.
- If in doubt, ESCALATE. Never approve something you're unsure about.
- Cite specific file:line for every claim in what_verified.
- "Looks fine" is not a verification. Name what you checked and why it's safe.

Return ONLY valid JSON, no markdown fencing.`;
}

function formatPRComment(result: ApprovalResult, config: ApprovalConfig): string {
  const decisionEmoji =
    result.decision === "approve"
      ? "APPROVE"
      : result.decision === "request_changes"
        ? "REQUEST CHANGES"
        : "ESCALATE TO HUMAN";

  const failureModes = result.reasoning.failure_modes.map((f) => `- ${f}`).join("\n");
  const verified = result.reasoning.what_verified.map((v) => `- ${v}`).join("\n");
  const gaps = result.reasoning.confidence_gaps.map((g) => `- ${g}`).join("\n");

  return `## Approval Agent Review

**Decision:** ${decisionEmoji}
**Risk Score:** ${result.risk_score}/100
**Confidence:** ${result.confidence}/10
**Mode:** ${config.mode}

### What changed
${result.reasoning.what_changed}

### Failure modes considered
${failureModes || "- None identified"}

### What I verified
${verified || "- No specific verifications"}

### Confidence gaps
${gaps || "- None"}

### Reasoning
${result.auto_merged ? "Auto-merged based on low risk score and approval config." : "Posted for human review."}

---
*Reviewed by Claude Opus. Risk threshold: ${config.risk_threshold}. Mode: ${config.mode}.*`;
}

export function applyConfigOverrides(
  aiDecision: "approve" | "request_changes" | "escalate",
  aiRiskScore: number,
  risk: MechanicalRisk,
  config: ApprovalConfig,
): { decision: "approve" | "request_changes" | "escalate"; reason?: string } {
  // Force escalate for blocked paths
  if (risk.touches_blocked_path) {
    return { decision: "escalate", reason: "Touches blocked path" };
  }

  // Force escalate for too many files
  if (risk.files_changed > config.max_files_changed) {
    return { decision: "escalate", reason: `Files changed (${risk.files_changed}) exceeds max (${config.max_files_changed})` };
  }

  // Force escalate for too many lines
  if (risk.lines_changed > config.max_lines_changed) {
    return { decision: "escalate", reason: `Lines changed (${risk.lines_changed}) exceeds max (${config.max_lines_changed})` };
  }

  // Force request_changes if tests required but missing
  if (config.require_tests_pass && !risk.has_tests) {
    return { decision: "request_changes", reason: "No test files in diff but tests are required" };
  }

  // Apply mode-based logic
  if (config.mode === "disabled") {
    return { decision: "escalate", reason: "Approval agent is disabled" };
  }

  if (config.mode === "dry_run") {
    // Return AI decision but never actually merge
    return { decision: aiDecision };
  }

  if (config.mode === "auto_low_risk") {
    if (aiRiskScore < config.risk_threshold && aiDecision === "approve") {
      return { decision: "approve" };
    }
    if (aiDecision === "approve" && aiRiskScore >= config.risk_threshold) {
      return { decision: "escalate", reason: `Risk score ${aiRiskScore} >= threshold ${config.risk_threshold}` };
    }
    return { decision: aiDecision };
  }

  if (config.mode === "auto_all") {
    // Override to approve regardless (after safety checks above)
    return { decision: "approve" };
  }

  return { decision: aiDecision };
}

export async function runApprovalAgent(
  prNumber: number,
  config: ApprovalConfig,
): Promise<ApprovalResult> {
  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    throw new Error("GITHUB_TOKEN not configured");
  }

  // 1. Fetch PR details
  const prRes = await githubFetch(`/repos/${GITHUB_REPO}/pulls/${prNumber}`, githubToken);
  if (!prRes.ok) {
    throw new Error(`Failed to fetch PR #${prNumber}: ${prRes.status}`);
  }
  const pr: GitHubPR = await prRes.json();

  // 2. Fetch PR files
  const filesRes = await githubFetch(`/repos/${GITHUB_REPO}/pulls/${prNumber}/files`, githubToken);
  if (!filesRes.ok) {
    throw new Error(`Failed to fetch PR files: ${filesRes.status}`);
  }
  const files: GitHubFile[] = await filesRes.json();

  // 3. Fetch full diff
  const diffRes = await githubFetch(
    `/repos/${GITHUB_REPO}/pulls/${prNumber}`,
    githubToken,
    "application/vnd.github.v3.diff",
  );
  const diff = diffRes.ok ? await diffRes.text() : "Diff unavailable";

  // 4. Compute mechanical risk
  const risk = computeMechanicalRisk(files, config.blocked_paths);

  // 5. Check if mode is disabled
  if (config.mode === "disabled") {
    return {
      decision: "escalate",
      risk_score: 100,
      confidence: 0,
      reasoning: {
        what_changed: "Approval agent is disabled",
        failure_modes: [],
        what_verified: [],
        confidence_gaps: ["Agent is disabled"],
        blast_radius: "high",
      },
      auto_merged: false,
    };
  }

  // 6. Call Claude for AI review
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
  });

  const prompt = buildReviewPrompt(prNumber, pr, files, diff, risk, config);

  const message = await anthropic.messages.create({
    model: config.model || "claude-opus-4-6",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "{}";
  let aiResponse: {
    what_changed?: string;
    failure_modes?: string[];
    what_verified?: string[];
    confidence_gaps?: string[];
    blast_radius?: string;
    risk_score?: number;
    confidence?: number;
    decision?: string;
    decision_reasoning?: string;
  };

  try {
    aiResponse = JSON.parse(text);
  } catch {
    // If AI returns invalid JSON, escalate
    return {
      decision: "escalate",
      risk_score: 100,
      confidence: 0,
      reasoning: {
        what_changed: "AI response was not valid JSON",
        failure_modes: ["Could not parse AI review"],
        what_verified: [],
        confidence_gaps: ["AI response unparseable"],
        blast_radius: "high",
      },
      auto_merged: false,
    };
  }

  const aiDecision = (aiResponse.decision === "approve" || aiResponse.decision === "request_changes" || aiResponse.decision === "escalate")
    ? aiResponse.decision
    : "escalate";
  const aiRiskScore = typeof aiResponse.risk_score === "number" ? aiResponse.risk_score : 100;

  // 7. Apply config overrides
  const override = applyConfigOverrides(aiDecision, aiRiskScore, risk, config);

  const result: ApprovalResult = {
    decision: override.decision,
    risk_score: aiRiskScore,
    confidence: typeof aiResponse.confidence === "number" ? aiResponse.confidence : 1,
    reasoning: {
      what_changed: typeof aiResponse.what_changed === "string" ? aiResponse.what_changed : "Unknown",
      failure_modes: Array.isArray(aiResponse.failure_modes) ? aiResponse.failure_modes : [],
      what_verified: Array.isArray(aiResponse.what_verified) ? aiResponse.what_verified : [],
      confidence_gaps: Array.isArray(aiResponse.confidence_gaps) ? aiResponse.confidence_gaps : [],
      blast_radius: (aiResponse.blast_radius === "low" || aiResponse.blast_radius === "medium" || aiResponse.blast_radius === "high")
        ? aiResponse.blast_radius
        : "high",
    },
    auto_merged: false,
  };

  // 8. Post PR comment
  await githubFetch(
    `/repos/${GITHUB_REPO}/issues/${prNumber}/comments`,
    githubToken,
  ).catch(() => {}); // Pre-check, actual post below

  const comment = formatPRComment(result, config);
  await fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues/${prNumber}/comments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ body: comment }),
  });

  // 9. Auto-merge if approved and mode allows (with daily cap check)
  let shouldMerge =
    result.decision === "approve" &&
    (config.mode === "auto_low_risk" || config.mode === "auto_all");

  if (shouldMerge) {
    // Check daily cap before merging (dynamic import to avoid eager Supabase init)
    try {
      const { getDailyImprovementCount } = await import("./daily-cap");
      const dailyCap = await getDailyImprovementCount();
      if (dailyCap.remaining <= 0) {
        shouldMerge = false;
        console.log(`Daily improvement cap reached (${dailyCap.count}/${dailyCap.limit}), skipping auto-merge for PR #${prNumber}`);
      }
    } catch {
      // If daily cap check fails, proceed with merge
    }
  }

  if (shouldMerge) {
    const mergeRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/pulls/${prNumber}/merge`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          merge_method: "squash",
          commit_title: `${pr.title} (#${prNumber})`,
        }),
      },
    );

    if (mergeRes.ok) {
      result.auto_merged = true;

      // Delete branch after merge
      const branchMatch = diff.match(/^diff --git a\//m);
      if (branchMatch) {
        // Try to delete branch via API (best effort)
        await fetch(
          `https://api.github.com/repos/${GITHUB_REPO}/git/refs/heads/auto-build/issue-${prNumber}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${githubToken}`,
              Accept: "application/vnd.github+json",
              "X-GitHub-Api-Version": "2022-11-28",
            },
          },
        ).catch(() => {});
      }
    }
  }

  return result;
}

// Exported for testing
export { buildReviewPrompt, formatPRComment };
