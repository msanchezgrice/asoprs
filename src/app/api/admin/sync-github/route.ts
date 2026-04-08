import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase";

interface FeatureContext {
  build_status?: string;
  github_issue_url?: string;
  github_issue_number?: number;
  pr_url?: string;
  pr_number?: number;
  completed_at?: string;
  [key: string]: unknown;
}

interface SyncItem {
  id: string;
  title: string;
  old_status: string;
  new_status: string;
  pr_url?: string;
  pr_number?: number;
}

const GITHUB_REPO = "msanchezgrice/asoprs";
const MAX_CONCURRENCY = 3;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

async function githubFetch(path: string, token: string): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
}

/** Run promises with a concurrency limit */
async function withConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift()!;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

export async function POST() {
  // Auth check
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    return NextResponse.json({ error: "GITHUB_TOKEN not configured" }, { status: 500 });
  }

  const db = getServiceClient();

  // Get all shipped_changes where build_status is 'triggered' and has a github_issue_number
  // Only look at items from the last 30 days
  const thirtyDaysAgo = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();

  const { data: changes, error } = await db
    .from("shipped_changes")
    .select("*")
    .gte("shipped_at", thirtyDaysAgo)
    .eq("status", "active");

  if (error) {
    return NextResponse.json({ error: "Failed to fetch changes" }, { status: 500 });
  }

  // Filter to only triggered items with a github_issue_number
  const triggeredChanges = (changes ?? []).filter((c) => {
    const fc = c.feature_context as FeatureContext | null;
    return fc?.build_status === "triggered" && fc?.github_issue_number != null;
  });

  const updated: SyncItem[] = [];

  await withConcurrency(triggeredChanges, MAX_CONCURRENCY, async (change) => {
    const fc = change.feature_context as FeatureContext;
    const issueNumber = fc.github_issue_number!;

    try {
      // 1. Check the issue status
      const issueRes = await githubFetch(
        `/repos/${GITHUB_REPO}/issues/${issueNumber}`,
        githubToken,
      );
      if (!issueRes.ok) return;

      const issue = await issueRes.json();
      const isIssueClosed = issue.state === "closed";

      // 2. Search for PRs referencing this issue
      let prUrl: string | undefined;
      let prNumber: number | undefined;
      let prMerged = false;

      const pullsRes = await githubFetch(
        `/repos/${GITHUB_REPO}/pulls?state=all&per_page=10`,
        githubToken,
      );

      if (pullsRes.ok) {
        const pulls = await pullsRes.json();
        // Find PR that references this issue by body or branch name
        const matchingPr = (pulls as Array<{
          body?: string;
          head?: { ref?: string };
          html_url?: string;
          number?: number;
          merged_at?: string | null;
        }>).find((pr) => {
          const bodyMatch = pr.body?.includes(`Closes #${issueNumber}`) ||
            pr.body?.includes(`closes #${issueNumber}`) ||
            pr.body?.includes(`Fixes #${issueNumber}`) ||
            pr.body?.includes(`fixes #${issueNumber}`);
          const branchMatch = pr.head?.ref === `auto-build/issue-${issueNumber}`;
          return bodyMatch || branchMatch;
        });

        if (matchingPr) {
          prUrl = matchingPr.html_url;
          prNumber = matchingPr.number;
          prMerged = matchingPr.merged_at != null;
        }
      }

      // 3. Determine new status
      let newStatus: string = fc.build_status!;
      const updateFields: Partial<FeatureContext> = {};

      if (prMerged) {
        // PR merged -> completed
        newStatus = "completed";
        updateFields.pr_url = prUrl;
        updateFields.pr_number = prNumber;
        updateFields.completed_at = new Date().toISOString();
      } else if (prUrl && prNumber) {
        // PR exists but not merged -> pr_created
        newStatus = "pr_created";
        updateFields.pr_url = prUrl;
        updateFields.pr_number = prNumber;
      } else if (isIssueClosed) {
        // Issue closed without PR -> completed (manually resolved)
        newStatus = "completed";
        updateFields.completed_at = new Date().toISOString();
      }
      // else: issue still open, no PR -> stay as triggered

      if (newStatus !== fc.build_status) {
        await db
          .from("shipped_changes")
          .update({
            feature_context: {
              ...fc,
              build_status: newStatus,
              ...updateFields,
            },
          })
          .eq("id", change.id);

        updated.push({
          id: change.id,
          title: change.title,
          old_status: fc.build_status!,
          new_status: newStatus,
          pr_url: prUrl,
          pr_number: prNumber,
        });
      }
    } catch (err) {
      // Log but don't fail the whole sync
      console.error(`Failed to sync issue #${issueNumber}:`, err);
    }
  });

  return NextResponse.json({
    synced: triggeredChanges.length,
    updated: updated.length,
    items: updated,
  });
}
