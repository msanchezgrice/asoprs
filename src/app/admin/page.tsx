"use client";

import { useState, useEffect, useCallback } from "react";
import { CheckCircle2, XCircle, Loader2, RefreshCw, Clock, BarChart3, Hammer, FileText, ExternalLink, X, ChevronDown, ChevronRight } from "lucide-react";
import { useAuthSession } from "@/hooks/use-auth-session";

type DeliveryStrategy = "global_fix" | "config_change" | "content_weight" | "isolated_module";

interface Proposal {
  title: string;
  description: string;
  origin_type: string;
  evidence: string;
  confidence: string;
  tier: string;
  delivery_strategy?: DeliveryStrategy;
  scope?: "global" | "user";
  target_user_id?: string | null;
  status?: string;
  reject_reason?: string;
  feature_context?: {
    build_status?: string;
    github_issue_url?: string;
    github_issue_number?: number;
    pr_url?: string;
    prd?: PRDData;
    [key: string]: unknown;
  };
}

interface PRDData {
  problem: string;
  solution: string;
  acceptance_criteria: string[];
  files_to_modify: string[];
  test_requirements: string[];
  rollback_plan: string;
}

interface BuildChange {
  id: string;
  title: string;
  description?: string;
  origin_type?: string;
  origin_trace?: {
    delivery_strategy?: string;
    target_user_id?: string;
    confidence?: string;
    evidence?: string;
    [key: string]: unknown;
  } | null;
  shipped_at?: string;
  feature_context: {
    build_status?: string;
    github_issue_url?: string;
    github_issue_number?: number;
    pr_url?: string;
    prd?: PRDData;
    delivery_strategy?: string;
    triggered_at?: string;
    completed_at?: string;
    [key: string]: unknown;
  } | null;
}

interface PMBrief {
  id: string;
  generated_at: string;
  user_id: string | null;
  brief_type: "global" | "user";
  summary_json: {
    summary: string;
    top_friction_points: string[];
    unused_features: string[];
    proposals: Proposal[];
    raw_data: { feedback_count: number; session_count: number; total_turns: number };
  };
  action_items: Proposal[];
  status: string;
}

type AdminTab = "briefs" | "in_progress" | "shipped" | "archive";

const ORIGIN_LABELS: Record<string, { label: string; color: string }> = {
  request: { label: "USER REQUEST", color: "text-indigo-400 bg-indigo-500/15" },
  bug: { label: "NOTICED BUG", color: "text-red-400 bg-red-500/15" },
  pattern: { label: "USAGE PATTERN", color: "text-amber-400 bg-amber-500/15" },
  annoyance: { label: "ANNOYANCE FIX", color: "text-orange-400 bg-orange-500/15" },
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "text-emerald-400 bg-emerald-500/15",
  medium: "text-amber-400 bg-amber-500/15",
  low: "text-slate-400 bg-slate-500/15",
};

const DELIVERY_STRATEGY_LABELS: Record<string, { label: string; color: string }> = {
  global_fix: { label: "GLOBAL FIX", color: "text-red-400 bg-red-500/15" },
  config_change: { label: "CONFIG", color: "text-sky-400 bg-sky-500/15" },
  content_weight: { label: "CONTENT WEIGHT", color: "text-violet-400 bg-violet-500/15" },
  isolated_module: { label: "ISOLATED MODULE", color: "text-teal-400 bg-teal-500/15" },
};

const SCOPE_BADGES: Record<string, { label: string; color: string }> = {
  global: { label: "GLOBAL", color: "text-blue-600 bg-blue-100" },
  user: { label: "PERSONAL", color: "text-purple-600 bg-purple-100" },
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function BadgeRow({ proposal, showTarget = true }: { proposal: Proposal; showTarget?: boolean }) {
  const origin = ORIGIN_LABELS[proposal.origin_type] ?? ORIGIN_LABELS.pattern;
  const conf = CONFIDENCE_COLORS[proposal.confidence] ?? CONFIDENCE_COLORS.low;
  const strategy = proposal.delivery_strategy ? DELIVERY_STRATEGY_LABELS[proposal.delivery_strategy] : null;
  const scope = SCOPE_BADGES[proposal.scope ?? "global"];

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${origin.color}`}>{origin.label}</span>
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${conf}`}>{proposal.confidence?.toUpperCase()}</span>
      {strategy && (
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${strategy.color}`}>{strategy.label}</span>
      )}
      {scope && (
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${scope.color}`}>{scope.label}</span>
      )}
      {showTarget && proposal.scope === "user" && proposal.target_user_id && (
        <span className="text-[10px] text-sky-500 font-medium">For: {proposal.target_user_id.slice(0, 8)}...</span>
      )}
    </div>
  );
}

function ChangeBadgeRow({ change }: { change: BuildChange }) {
  const originType = change.origin_type ?? "pattern";
  const origin = ORIGIN_LABELS[originType] ?? ORIGIN_LABELS.pattern;
  const deliveryStrategy = change.feature_context?.delivery_strategy ?? change.origin_trace?.delivery_strategy;
  const strategy = deliveryStrategy ? DELIVERY_STRATEGY_LABELS[deliveryStrategy] : null;
  const targetUserId = change.origin_trace?.target_user_id;
  const scope = targetUserId ? SCOPE_BADGES.user : SCOPE_BADGES.global;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${origin.color}`}>{origin.label}</span>
      {strategy && (
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${strategy.color}`}>{strategy.label}</span>
      )}
      {scope && (
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${scope.color}`}>{scope.label}</span>
      )}
      {targetUserId && (
        <span className="text-[10px] text-sky-500 font-medium">For: {targetUserId.slice(0, 8)}...</span>
      )}
    </div>
  );
}

export default function AdminPage() {
  const { user, loading: authLoading } = useAuthSession();
  const [briefs, setBriefs] = useState<PMBrief[]>([]);
  const [shippedChanges, setShippedChanges] = useState<BuildChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>("briefs");
  const [buildModal, setBuildModal] = useState<{
    title: string;
    prd: PRDData | null;
    github_issue_url: string | null;
    github_issue_number: number | null;
    config_applied?: boolean;
    delivery_strategy?: string;
  } | null>(null);
  const [detailModal, setDetailModal] = useState<{
    proposal: Proposal;
    change?: BuildChange;
  } | null>(null);
  const [briefDetailModal, setBriefDetailModal] = useState<PMBrief | null>(null);
  const [expandedPRDs, setExpandedPRDs] = useState<Set<number>>(new Set());
  const [prdGenerating, setPrdGenerating] = useState<Set<string>>(new Set());

  const fetchBriefs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/proposals");
      if (res.ok) setBriefs(await res.json());
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  const fetchShippedChanges = useCallback(async () => {
    try {
      const res = await fetch("/api/auto-build");
      if (res.ok) {
        const data: BuildChange[] = await res.json();
        setShippedChanges(data);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (user) {
      fetchBriefs();
      fetchShippedChanges();
    }
  }, [user, fetchBriefs, fetchShippedChanges]);

  const generateBrief = async () => {
    setGenerating(true);
    try {
      await fetch("/api/pm-brief", { method: "POST" });
      await fetchBriefs();
    } catch { /* silent */ }
    setGenerating(false);
  };

  const handleProposal = async (briefId: string, index: number, action: "approve" | "reject") => {
    const key = `${briefId}-${index}`;
    setActionLoading(key);
    try {
      const res = await fetch("/api/admin/proposals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief_id: briefId, proposal_index: index, action }),
      });
      const data = await res.json();

      if (action === "approve" && data.change?.id) {
        // Phase 1: Auto-trigger PRD generation
        setPrdGenerating((prev) => new Set(prev).add(data.change.id));
        try {
          await fetch("/api/auto-build", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ change_id: data.change.id }),
          });
        } catch { /* silent */ }
        setPrdGenerating((prev) => {
          const next = new Set(prev);
          next.delete(data.change.id);
          return next;
        });
      }

      await fetchBriefs();
      await fetchShippedChanges();
    } catch { /* silent */ }
    setActionLoading(null);
  };

  const [buildStatus, setBuildStatus] = useState<Record<string, { url: string; number: number } | null>>({});

  const triggerBuild = async (changeId: string, briefId: string, index: number) => {
    const buildKey = `build-${briefId}-${index}`;
    setActionLoading(buildKey);
    try {
      const res = await fetch("/api/auto-build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ change_id: changeId }),
      });
      const data = await res.json();
      if (data.github_issue_url) {
        setBuildStatus((prev) => ({
          ...prev,
          [changeId]: { url: data.github_issue_url, number: data.github_issue_number },
        }));
      } else if (data.prd) {
        setBuildStatus((prev) => ({
          ...prev,
          [changeId]: null,
        }));
      }
      setBuildModal({
        title: data.title ?? "Build triggered",
        prd: data.prd ?? null,
        github_issue_url: data.github_issue_url ?? null,
        github_issue_number: data.github_issue_number ?? null,
        config_applied: data.config_applied ?? false,
        delivery_strategy: data.delivery_strategy ?? undefined,
      });
      await fetchBriefs();
      await fetchShippedChanges();
    } catch { /* silent */ }
    setActionLoading(null);
  };

  if (authLoading) return <div className="flex items-center justify-center min-h-dvh"><Loader2 className="animate-spin text-warm-gray" /></div>;
  if (!user) return <div className="flex items-center justify-center min-h-dvh text-warm-gray">Sign in to access admin</div>;

  const totalProposals = briefs.reduce((n, b) => n + (b.action_items?.length ?? 0), 0);
  const approvedCount = briefs.reduce((n, b) => n + (b.action_items ?? []).filter((p) => p.status === "approved").length, 0);
  const rejectedCount = briefs.reduce((n, b) => n + (b.action_items ?? []).filter((p) => p.status === "rejected").length, 0);
  const approveRate = totalProposals > 0 ? Math.round((approvedCount / totalProposals) * 100) : 0;

  const globalBriefs = briefs.filter((b) => !b.brief_type || b.brief_type === "global");
  const userBriefs = briefs.filter((b) => b.brief_type === "user");
  const groupedByUser = userBriefs.reduce<Record<string, PMBrief[]>>((acc, brief) => {
    const uid = brief.user_id ?? "unknown";
    if (!acc[uid]) acc[uid] = [];
    acc[uid].push(brief);
    return acc;
  }, {});

  // Tab 2 & 3 data
  const inProgressChanges = shippedChanges.filter((c) => {
    const status = c.feature_context?.build_status;
    return status === "triggered" || status === "ready_for_build" || status === "pending_prd";
  });
  const completedChanges = shippedChanges.filter((c) => {
    const status = c.feature_context?.build_status;
    return status === "completed" || status === "config_applied" || status === "pr_created";
  });

  // Collect all rejected proposals across all briefs for the Archive tab
  const rejectedProposals: { brief: PMBrief; proposal: Proposal; index: number }[] = [];
  briefs.forEach((brief) => {
    (brief.action_items ?? []).forEach((p, i) => {
      if (p.status === "rejected") {
        rejectedProposals.push({ brief, proposal: p, index: i });
      }
    });
  });

  const tabs: { key: AdminTab; label: string; count?: number }[] = [
    { key: "briefs", label: "Briefs", count: briefs.length },
    { key: "in_progress", label: "In Progress", count: inProgressChanges.length },
    { key: "shipped", label: "Shipped", count: completedChanges.length },
    { key: "archive", label: "Archive", count: rejectedProposals.length },
  ];

  const togglePRD = (index: number) => {
    setExpandedPRDs((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const renderBriefCard = (brief: PMBrief) => (
    <div key={brief.id} className="bg-white rounded-xl border border-ivory-dark mb-4 overflow-hidden">
      {/* Brief header — clickable to open full detail */}
      <div
        className="px-5 py-3 border-b border-ivory-dark cursor-pointer hover:bg-ivory/30 transition-colors"
        onClick={() => {
          setExpandedPRDs(new Set());
          setBriefDetailModal(brief);
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs text-warm-gray">
              {new Date(brief.generated_at).toLocaleDateString()} {new Date(brief.generated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
            <span className="text-xs text-warm-gray ml-3">
              {brief.summary_json.raw_data?.feedback_count ?? 0} feedback &middot; {brief.summary_json.raw_data?.session_count ?? 0} sessions
            </span>
            {brief.brief_type === "user" && brief.user_id && (
              <span className="text-xs text-sky-600 ml-3">User: {brief.user_id.slice(0, 8)}...</span>
            )}
          </div>
          <span className={`text-xs font-medium px-2 py-0.5 rounded ${brief.status === "actioned" ? "bg-emerald-100 text-emerald-700" : brief.status === "reviewed" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
            {brief.status}
          </span>
        </div>
        <p className="text-sm text-navy mt-1">{brief.summary_json.summary}</p>
      </div>

      {/* Proposals (hide rejected — those go to Archive tab) */}
      {(brief.action_items ?? []).filter((p) => p.status !== "rejected").map((proposal, i) => {
        const originalIndex = (brief.action_items ?? []).indexOf(proposal);
        const isActioned = proposal.status === "approved";
        const loadingKey = `${brief.id}-${originalIndex}`;

        return (
          <div key={i} className={`px-5 py-4 border-b border-ivory-dark last:border-b-0 ${isActioned ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div
                className="flex-1 cursor-pointer"
                onClick={() => {
                  if (proposal.status === "approved") {
                    fetch("/api/auto-build").then(r => r.json()).then((changes: BuildChange[]) => {
                      const match = changes.find((c) => c.title === proposal.title);
                      setDetailModal({ proposal, change: match });
                    }).catch(() => {
                      setDetailModal({ proposal });
                    });
                  } else {
                    setDetailModal({ proposal });
                  }
                }}
              >
                <div className="mb-1">
                  <BadgeRow proposal={proposal} />
                </div>
                <h3 className="text-sm font-semibold text-navy">{proposal.title}</h3>
                <p className="text-xs text-warm-gray mt-0.5">{proposal.description}</p>
                <div className="mt-2 bg-ivory/50 rounded px-3 py-2 border-l-2 border-navy/20">
                  <span className="text-[10px] text-warm-gray block mb-0.5">EVIDENCE:</span>
                  <span className="text-xs text-navy/80">{proposal.evidence}</span>
                </div>
              </div>

              {!isActioned && (
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleProposal(brief.id, originalIndex, "approve")}
                    disabled={actionLoading === loadingKey}
                    className="flex items-center gap-1 bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {actionLoading === loadingKey ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                    Approve
                  </button>
                  <button
                    onClick={() => handleProposal(brief.id, originalIndex, "reject")}
                    disabled={actionLoading === loadingKey}
                    className="flex items-center gap-1 border border-red-300 text-red-600 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-50 disabled:opacity-50"
                  >
                    <XCircle size={12} />
                    Reject
                  </button>
                </div>
              )}

              {proposal.status === "approved" && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-emerald-600 font-medium flex items-center gap-1"><CheckCircle2 size={12} /> Approved</span>
                  {(() => {
                    const localStatus = Object.values(buildStatus).find(Boolean);
                    const featureBuildStatus = proposal.feature_context?.build_status;
                    const issueUrl = proposal.feature_context?.github_issue_url;

                    // Check if PRD is generating (pending_prd or in prdGenerating set)
                    const matchChange = shippedChanges.find((c) => c.title === proposal.title);
                    const changeBuildStatus = matchChange?.feature_context?.build_status;
                    const isGenPrd = (matchChange && prdGenerating.has(matchChange.id)) || featureBuildStatus === "pending_prd" || changeBuildStatus === "pending_prd";

                    if (isGenPrd) {
                      return (
                        <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
                          <Loader2 size={10} className="animate-spin" />
                          Generating proposal...
                        </span>
                      );
                    }

                    if (featureBuildStatus === "triggered" || changeBuildStatus === "triggered" || localStatus) {
                      const url = issueUrl || matchChange?.feature_context?.github_issue_url as string | undefined || localStatus?.url;
                      return (
                        <a
                          href={url ?? "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-amber-600 font-medium hover:underline"
                        >
                          <Loader2 size={10} className="animate-spin" />
                          Building...
                          <ExternalLink size={10} />
                        </a>
                      );
                    }

                    if (featureBuildStatus === "config_applied" || changeBuildStatus === "config_applied") {
                      return (
                        <span className="flex items-center gap-1 text-xs text-sky-600 font-medium">
                          <CheckCircle2 size={10} />
                          Config applied
                        </span>
                      );
                    }

                    if (featureBuildStatus === "pr_created" || changeBuildStatus === "pr_created") {
                      return (
                        <a
                          href={(issueUrl || matchChange?.feature_context?.pr_url as string | undefined) ?? "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-emerald-600 font-medium hover:underline"
                        >
                          <FileText size={10} />
                          View PR
                          <ExternalLink size={10} />
                        </a>
                      );
                    }

                    if (featureBuildStatus === "completed" || changeBuildStatus === "completed") {
                      return (
                        <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                          <CheckCircle2 size={10} />
                          Shipped
                        </span>
                      );
                    }

                    // prd_ready: show Build button
                    if (featureBuildStatus === "prd_ready" || changeBuildStatus === "prd_ready") {
                      const buildKey = `build-${brief.id}-${originalIndex}`;
                      return (
                        <button
                          onClick={() => {
                            if (matchChange) {
                              triggerBuild(matchChange.id, brief.id, originalIndex);
                            } else {
                              fetch("/api/auto-build").then(r => r.json()).then((changes: Array<BuildChange>) => {
                                const match = changes.find((c) => c.title === proposal.title);
                                if (match) triggerBuild(match.id, brief.id, originalIndex);
                              });
                            }
                          }}
                          disabled={actionLoading === buildKey}
                          className="flex items-center gap-1 bg-navy text-white px-2 py-1 rounded text-xs font-medium hover:bg-navy/80 disabled:opacity-50"
                        >
                          {actionLoading === buildKey ? <Loader2 size={10} className="animate-spin" /> : <Hammer size={10} />}
                          Build
                        </button>
                      );
                    }

                    // Default: show Build button (legacy proposals without build_status)
                    const buildKey = `build-${brief.id}-${originalIndex}`;
                    return (
                      <button
                        onClick={() => {
                          fetch("/api/auto-build").then(r => r.json()).then((changes: Array<BuildChange>) => {
                            const match = changes.find((c) => c.title === proposal.title);
                            if (match) triggerBuild(match.id, brief.id, originalIndex);
                          });
                        }}
                        disabled={actionLoading === buildKey}
                        className="flex items-center gap-1 bg-navy text-white px-2 py-1 rounded text-xs font-medium hover:bg-navy/80 disabled:opacity-50"
                      >
                        {actionLoading === buildKey ? <Loader2 size={10} className="animate-spin" /> : <Hammer size={10} />}
                        Build
                      </button>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-dvh bg-parchment">
      {/* Header */}
      <header className="border-b border-ivory-dark bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-[DM_Serif_Display] text-xl text-navy">Admin Console</h1>
            <p className="text-xs text-warm-gray mt-0.5">PM Brief proposals and feedback</p>
          </div>
          <button
            onClick={generateBrief}
            disabled={generating}
            className="flex items-center gap-2 bg-navy text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-navy/90 disabled:opacity-50"
          >
            {generating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Generate Brief
          </button>
        </div>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 px-6 py-4">
        {[
          { label: "Total Proposals", value: totalProposals, icon: BarChart3 },
          { label: "Approved", value: approvedCount, icon: CheckCircle2, color: "text-emerald-600" },
          { label: "Rejected", value: rejectedCount, icon: XCircle, color: "text-red-500" },
          { label: "Approve Rate", value: `${approveRate}%`, icon: Clock, color: approveRate >= 90 ? "text-emerald-600" : "text-amber-500" },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-ivory-dark p-4">
            <div className="flex items-center gap-2 mb-1">
              <stat.icon size={14} className={stat.color ?? "text-warm-gray"} />
              <span className="text-xs text-warm-gray">{stat.label}</span>
            </div>
            <div className={`text-2xl font-bold ${stat.color ?? "text-navy"}`}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="px-6">
        <div className="flex gap-1 border-b border-ivory-dark">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-navy text-navy"
                  : "border-transparent text-warm-gray hover:text-navy/70"
              }`}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className={`ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.key ? "bg-navy/10 text-navy" : "bg-slate-100 text-warm-gray"
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="px-6 pb-24 pt-4">
        {/* Tab 1: Briefs */}
        {activeTab === "briefs" && (
          <>
            {loading ? (
              <div className="text-center py-12 text-warm-gray"><Loader2 className="animate-spin mx-auto" /></div>
            ) : briefs.length === 0 ? (
              <div className="text-center py-12 text-warm-gray">
                <p className="text-lg font-medium">No briefs yet</p>
                <p className="text-sm mt-1">Click &quot;Generate Brief&quot; to create one from today&apos;s feedback and companion data.</p>
              </div>
            ) : (
              <>
                {globalBriefs.length > 0 && (
                  <div className="mb-6">
                    <h2 className="font-[DM_Serif_Display] text-lg text-navy mb-3">Global Briefs</h2>
                    {globalBriefs.map(renderBriefCard)}
                  </div>
                )}
                {Object.keys(groupedByUser).length > 0 && (
                  <div className="mb-6">
                    <h2 className="font-[DM_Serif_Display] text-lg text-navy mb-3">Per-User Briefs</h2>
                    {Object.entries(groupedByUser).map(([userId, userBriefsGroup]) => (
                      <div key={userId} className="mb-4">
                        <div className="text-xs text-warm-gray font-medium mb-2 px-1">User: {userId.slice(0, 8)}...</div>
                        {userBriefsGroup.map(renderBriefCard)}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* Tab 2: In Progress */}
        {activeTab === "in_progress" && (
          <>
            {inProgressChanges.length === 0 ? (
              <div className="text-center py-12 text-warm-gray">
                <Hammer size={24} className="mx-auto mb-2 text-warm-gray/50" />
                <p className="text-lg font-medium">No builds in progress</p>
                <p className="text-sm mt-1">Approved proposals will appear here once a build is triggered.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {inProgressChanges.map((change) => {
                  const triggeredAt = change.feature_context?.triggered_at as string | undefined;
                  return (
                    <div key={change.id} className="bg-white rounded-xl border border-ivory-dark p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="mb-2">
                            <ChangeBadgeRow change={change} />
                          </div>
                          <h3 className="text-sm font-semibold text-navy">{change.title}</h3>
                          {change.description && (
                            <p className="text-xs text-warm-gray mt-0.5">{change.description}</p>
                          )}
                          {triggeredAt && (
                            <p className="text-[10px] text-warm-gray mt-2">Triggered {timeAgo(triggeredAt)}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          {/* Building animation */}
                          <div className="flex items-center gap-1.5">
                            <div className="relative flex items-center justify-center w-6 h-6">
                              <div className="absolute w-6 h-6 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
                              <Hammer size={10} className="text-amber-500" />
                            </div>
                            <span className="text-xs text-amber-600 font-medium">Building...</span>
                          </div>
                          {change.feature_context?.github_issue_url && (
                            <a
                              href={String(change.feature_context.github_issue_url)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs text-navy font-medium hover:underline"
                            >
                              Issue #{String(change.feature_context.github_issue_number ?? "")}
                              <ExternalLink size={10} />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Tab 3: Shipped */}
        {activeTab === "shipped" && (
          <>
            {completedChanges.length === 0 ? (
              <div className="text-center py-12 text-warm-gray">
                <CheckCircle2 size={24} className="mx-auto mb-2 text-warm-gray/50" />
                <p className="text-lg font-medium">Nothing shipped yet</p>
                <p className="text-sm mt-1">Completed builds will show up here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {completedChanges.map((change) => {
                  const buildStatus = change.feature_context?.build_status;
                  const completedAt = (change.feature_context?.completed_at ?? change.feature_context?.triggered_at ?? change.shipped_at) as string | undefined;
                  return (
                    <div key={change.id} className="bg-white rounded-xl border border-ivory-dark p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="mb-2">
                            <ChangeBadgeRow change={change} />
                          </div>
                          <h3 className="text-sm font-semibold text-navy">{change.title}</h3>
                          {change.description && (
                            <p className="text-xs text-warm-gray mt-0.5">{change.description}</p>
                          )}
                          <div className="flex items-center gap-3 mt-2">
                            {buildStatus === "config_applied" && (
                              <span className="text-xs text-sky-600 font-medium flex items-center gap-1">
                                <CheckCircle2 size={10} /> Config applied
                              </span>
                            )}
                            {buildStatus === "pr_created" && (
                              <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                                <CheckCircle2 size={10} /> PR created
                              </span>
                            )}
                            {buildStatus === "completed" && (
                              <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                                <CheckCircle2 size={10} /> Completed
                              </span>
                            )}
                            {completedAt && (
                              <span className="text-[10px] text-warm-gray">{timeAgo(completedAt)}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {change.feature_context?.pr_url && (
                            <a
                              href={String(change.feature_context.pr_url)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 font-medium px-2.5 py-1 rounded-lg hover:bg-emerald-100"
                            >
                              <FileText size={10} /> View PR <ExternalLink size={10} />
                            </a>
                          )}
                          {change.feature_context?.github_issue_url && !change.feature_context?.pr_url && (
                            <a
                              href={String(change.feature_context.github_issue_url)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs text-navy font-medium hover:underline"
                            >
                              Issue #{String(change.feature_context.github_issue_number ?? "")}
                              <ExternalLink size={10} />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Tab 4: Archive (rejected proposals) */}
        {activeTab === "archive" && (
          <>
            {rejectedProposals.length === 0 ? (
              <div className="text-center py-12 text-warm-gray">
                <XCircle size={24} className="mx-auto mb-2 text-warm-gray/50" />
                <p className="text-lg font-medium">No rejected proposals</p>
                <p className="text-sm mt-1">Rejected proposals will appear here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {rejectedProposals.map(({ brief, proposal, index }) => (
                  <div key={`${brief.id}-${index}`} className="bg-white rounded-xl border border-ivory-dark p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded text-red-600 bg-red-100">REJECTED</span>
                          <BadgeRow proposal={proposal} showTarget={false} />
                        </div>
                        <h3 className="text-sm font-semibold text-navy">{proposal.title}</h3>
                        <p className="text-xs text-warm-gray mt-0.5">{proposal.description}</p>
                        {proposal.evidence && (
                          <div className="mt-2 bg-ivory/50 rounded px-3 py-2 border-l-2 border-navy/20">
                            <span className="text-[10px] text-warm-gray block mb-0.5">EVIDENCE:</span>
                            <span className="text-xs text-navy/80">{proposal.evidence}</span>
                          </div>
                        )}
                        {proposal.reject_reason && (
                          <div className="mt-2 bg-red-50/50 rounded px-3 py-2 border-l-2 border-red-300">
                            <span className="text-[10px] text-red-600 font-semibold block mb-0.5">REJECT REASON:</span>
                            <span className="text-xs text-navy/80">{proposal.reject_reason}</span>
                          </div>
                        )}
                        <p className="text-[10px] text-warm-gray mt-2">
                          From brief: {new Date(brief.generated_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Build Result Modal */}
      {buildModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setBuildModal(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white rounded-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-ivory-dark">
              <h2 className="font-[DM_Serif_Display] text-lg text-navy">{buildModal.title}</h2>
              <button onClick={() => setBuildModal(null)} className="text-warm-gray hover:text-navy"><X size={18} /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {buildModal.config_applied ? (
                <div className="flex items-center gap-2 bg-sky-50 border border-sky-200 rounded-lg px-4 py-3">
                  <CheckCircle2 size={16} className="text-sky-600" />
                  <span className="text-sm text-sky-800 font-medium">Config applied — no code change needed</span>
                  {buildModal.delivery_strategy && (
                    <span className="ml-auto text-[10px] font-semibold text-sky-600 bg-sky-100 px-2 py-0.5 rounded">
                      {buildModal.delivery_strategy.toUpperCase().replace("_", " ")}
                    </span>
                  )}
                </div>
              ) : buildModal.github_issue_url ? (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                  <CheckCircle2 size={16} className="text-emerald-600" />
                  <span className="text-sm text-emerald-800 font-medium">Build triggered</span>
                  <a href={buildModal.github_issue_url} target="_blank" rel="noopener noreferrer" className="ml-auto flex items-center gap-1 text-xs text-emerald-700 font-medium hover:underline">
                    Issue #{buildModal.github_issue_number} <ExternalLink size={10} />
                  </a>
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                  <FileText size={16} className="text-amber-600" />
                  <span className="text-sm text-amber-800 font-medium">PRD generated — trigger build manually</span>
                </div>
              )}
              {buildModal.prd && (
                <>
                  <div>
                    <span className="text-[10px] font-semibold text-warm-gray uppercase tracking-wider">Problem</span>
                    <p className="text-sm text-navy mt-1">{buildModal.prd.problem}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold text-warm-gray uppercase tracking-wider">Solution</span>
                    <p className="text-sm text-navy mt-1">{buildModal.prd.solution}</p>
                  </div>
                  {buildModal.prd.files_to_modify?.length > 0 && (
                    <div>
                      <span className="text-[10px] font-semibold text-warm-gray uppercase tracking-wider">Files to Modify</span>
                      <ul className="mt-1 space-y-0.5">
                        {buildModal.prd.files_to_modify.map((f, idx) => (
                          <li key={idx} className="text-xs text-navy font-mono bg-ivory/50 rounded px-2 py-1">{f}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {buildModal.prd.acceptance_criteria?.length > 0 && (
                    <div>
                      <span className="text-[10px] font-semibold text-warm-gray uppercase tracking-wider">Acceptance Criteria</span>
                      <ul className="mt-1 space-y-0.5 list-disc list-inside">
                        {buildModal.prd.acceptance_criteria.map((c, idx) => (
                          <li key={idx} className="text-xs text-navy">{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {buildModal.prd.test_requirements?.length > 0 && (
                    <div>
                      <span className="text-[10px] font-semibold text-warm-gray uppercase tracking-wider">Test Requirements</span>
                      <ul className="mt-1 space-y-0.5 list-disc list-inside">
                        {buildModal.prd.test_requirements.map((t, idx) => (
                          <li key={idx} className="text-xs text-navy">{t}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div>
                    <span className="text-[10px] font-semibold text-warm-gray uppercase tracking-wider">Rollback Plan</span>
                    <p className="text-sm text-navy mt-1">{buildModal.prd.rollback_plan}</p>
                  </div>
                </>
              )}
            </div>
            <div className="px-5 py-3 border-t border-ivory-dark">
              <button onClick={() => setBuildModal(null)} className="w-full bg-navy text-white py-2 rounded-lg text-sm font-medium hover:bg-navy/90">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Proposal Detail Modal */}
      {detailModal && (() => {
        const { proposal, change } = detailModal;
        const origin = ORIGIN_LABELS[proposal.origin_type] ?? ORIGIN_LABELS.pattern;
        const conf = CONFIDENCE_COLORS[proposal.confidence] ?? CONFIDENCE_COLORS.low;
        const strategy = proposal.delivery_strategy ? DELIVERY_STRATEGY_LABELS[proposal.delivery_strategy] : null;
        const scope = SCOPE_BADGES[proposal.scope ?? "global"];
        const fc = change?.feature_context ?? proposal.feature_context;
        const prd = fc?.prd as PRDData | undefined;
        const buildSt = fc?.build_status as string | undefined;
        const changeId = change?.id;
        const isGeneratingPrd = changeId ? prdGenerating.has(changeId) : false;

        // Derive "Why this matters" from evidence and description
        const whyMatters = proposal.evidence && proposal.description
          ? `This directly affects the study experience: ${proposal.description.toLowerCase().replace(/\.$/, "")}. The evidence shows ${proposal.evidence.toLowerCase().replace(/\.$/, "")}, which impacts how effectively users can prepare.`
          : proposal.description || "This improvement enhances the overall study experience.";

        // Derive "How this was detected" from origin_type
        const detectionMap: Record<string, string> = {
          bug: "Our companion AI observed this issue during a study session.",
          request: "A user directly asked for this improvement.",
          pattern: "We noticed this from study behavior data and usage patterns.",
          annoyance: "A user flagged this as frustrating during their study session.",
        };
        const howDetected = detectionMap[proposal.origin_type] ?? detectionMap.pattern;

        // Delivery strategy explanations
        const deliveryExplanations: Record<string, string> = {
          global_fix: "This fix ships to all users.",
          isolated_module: "This feature will be built as a personal module for one user.",
          config_change: "This is a database configuration change, no code needed.",
          content_weight: "This adjusts study content ordering for a specific user.",
        };
        const deliveryExplanation = proposal.delivery_strategy ? deliveryExplanations[proposal.delivery_strategy] : null;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setDetailModal(null)}>
            <div className="absolute inset-0 bg-black/40" />
            <div className="relative bg-white rounded-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-ivory-dark">
                <h2 className="font-[DM_Serif_Display] text-lg text-navy">Proposal Detail</h2>
                <button onClick={() => setDetailModal(null)} className="text-warm-gray hover:text-navy"><X size={18} /></button>
              </div>
              <div className="px-5 py-4 space-y-4">
                {/* Section 1: Context */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${origin.color}`}>{origin.label}</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${conf}`}>{proposal.confidence?.toUpperCase()}</span>
                  {strategy && (
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${strategy.color}`}>{strategy.label}</span>
                  )}
                  {scope && (
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${scope.color}`}>{scope.label}</span>
                  )}
                  {proposal.status && (
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${proposal.status === "approved" ? "text-emerald-600 bg-emerald-100" : proposal.status === "rejected" ? "text-red-600 bg-red-100" : "text-slate-600 bg-slate-100"}`}>
                      {proposal.status.toUpperCase()}
                    </span>
                  )}
                </div>

                {proposal.scope === "user" && proposal.target_user_id && (
                  <div className="text-xs text-sky-600 font-medium">Target user: {proposal.target_user_id}</div>
                )}

                <div>
                  <h3 className="text-base font-bold text-navy">{proposal.title}</h3>
                  <p className="text-sm text-warm-gray mt-1">{proposal.description}</p>
                </div>

                {/* Section 2: Evidence & Thinking */}
                <div className="border-t border-ivory-dark pt-4 space-y-3">
                  <span className="text-[10px] font-semibold text-warm-gray uppercase tracking-wider">Evidence &amp; Thinking</span>

                  {proposal.evidence && (
                    <div className="bg-ivory/50 rounded px-3 py-2 border-l-2 border-navy/20">
                      <span className="text-[10px] font-semibold text-warm-gray uppercase tracking-wider block mb-0.5">Evidence</span>
                      <span className="text-xs text-navy/80">{proposal.evidence}</span>
                    </div>
                  )}

                  <div className="bg-indigo-50/50 rounded px-3 py-2 border-l-2 border-indigo-300">
                    <span className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wider block mb-0.5">Why this matters</span>
                    <span className="text-xs text-navy/80">{whyMatters}</span>
                  </div>

                  <div className="bg-amber-50/50 rounded px-3 py-2 border-l-2 border-amber-300">
                    <span className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider block mb-0.5">How this was detected</span>
                    <span className="text-xs text-navy/80">{howDetected}</span>
                  </div>
                </div>

                {/* Section 3: Proposed Solution (PRD) — only if approved and has PRD */}
                {proposal.status === "approved" && prd && (
                  <div className="border-t border-ivory-dark pt-4 space-y-3">
                    <span className="text-[10px] font-semibold text-warm-gray uppercase tracking-wider">Proposed Solution (PRD)</span>

                    <div>
                      <span className="text-[10px] font-semibold text-warm-gray uppercase tracking-wider">Problem Statement</span>
                      <p className="text-sm text-navy mt-1">{prd.problem}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold text-warm-gray uppercase tracking-wider">Solution Approach</span>
                      <p className="text-sm text-navy mt-1">{prd.solution}</p>
                    </div>
                    {prd.acceptance_criteria?.length > 0 && (
                      <div>
                        <span className="text-[10px] font-semibold text-warm-gray uppercase tracking-wider">Acceptance Criteria</span>
                        <ul className="mt-1 space-y-1">
                          {prd.acceptance_criteria.map((c, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-xs text-navy">
                              <span className="text-warm-gray mt-0.5">&#9744;</span>
                              <span>{c}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {prd.files_to_modify?.length > 0 && (
                      <div>
                        <span className="text-[10px] font-semibold text-warm-gray uppercase tracking-wider">Files to Modify</span>
                        <div className="mt-1 space-y-0.5">
                          {prd.files_to_modify.map((f, idx) => (
                            <div key={idx} className="text-xs text-navy font-mono bg-ivory/50 rounded px-2 py-1">{f}</div>
                          ))}
                        </div>
                      </div>
                    )}
                    {prd.test_requirements?.length > 0 && (
                      <div>
                        <span className="text-[10px] font-semibold text-warm-gray uppercase tracking-wider">Test Requirements</span>
                        <ul className="mt-1 space-y-0.5 list-disc list-inside">
                          {prd.test_requirements.map((t, idx) => (
                            <li key={idx} className="text-xs text-navy">{t}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div>
                      <span className="text-[10px] font-semibold text-warm-gray uppercase tracking-wider">Rollback Plan</span>
                      <p className="text-sm text-navy mt-1">{prd.rollback_plan}</p>
                    </div>
                    {deliveryExplanation && (
                      <div className="bg-sky-50/50 rounded px-3 py-2 border-l-2 border-sky-300">
                        <span className="text-[10px] font-semibold text-sky-600 uppercase tracking-wider block mb-0.5">Delivery Strategy</span>
                        <span className="text-xs text-navy/80">{deliveryExplanation}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Section 4: Status & Actions */}
                <div className="border-t border-ivory-dark pt-4 space-y-3">
                  <span className="text-[10px] font-semibold text-warm-gray uppercase tracking-wider">Status &amp; Actions</span>

                  <div className="flex items-center gap-2">
                    {!proposal.status || proposal.status === "pending" ? (
                      <span className="text-xs font-medium text-slate-500 flex items-center gap-1"><Clock size={12} /> Pending review</span>
                    ) : proposal.status === "approved" && (buildSt === "completed" || buildSt === "config_applied") ? (
                      <span className="text-xs font-medium text-emerald-600 flex items-center gap-1"><CheckCircle2 size={12} /> Shipped</span>
                    ) : proposal.status === "approved" && buildSt === "triggered" ? (
                      <span className="text-xs font-medium text-amber-600 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Building</span>
                    ) : proposal.status === "approved" && buildSt === "prd_ready" ? (
                      <span className="text-xs font-medium text-indigo-600 flex items-center gap-1"><FileText size={12} /> PRD Ready</span>
                    ) : proposal.status === "approved" && (buildSt === "pending_prd" || isGeneratingPrd) ? (
                      <span className="text-xs font-medium text-amber-600 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Generating coding proposal...</span>
                    ) : proposal.status === "approved" ? (
                      <span className="text-xs font-medium text-emerald-600 flex items-center gap-1"><CheckCircle2 size={12} /> Approved</span>
                    ) : proposal.status === "rejected" ? (
                      <span className="text-xs font-medium text-red-500 flex items-center gap-1"><XCircle size={12} /> Rejected</span>
                    ) : (
                      <span className="text-xs font-medium text-slate-500 flex items-center gap-1"><Clock size={12} /> {proposal.status}</span>
                    )}
                  </div>

                  {/* Links */}
                  {fc?.github_issue_url && buildSt === "triggered" && (
                    <a href={String(fc.github_issue_url)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-navy font-medium hover:underline">
                      <FileText size={12} /> GitHub Issue #{String(fc.github_issue_number ?? "")} <ExternalLink size={10} />
                    </a>
                  )}
                  {fc?.pr_url && (buildSt === "completed" || buildSt === "config_applied") && (
                    <a href={String(fc.pr_url)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-emerald-700 font-medium hover:underline">
                      <FileText size={12} /> View PR <ExternalLink size={10} />
                    </a>
                  )}

                  {/* Action buttons */}
                  {(!proposal.status || proposal.status === "pending") && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setDetailModal(null);
                          // Find which brief this proposal belongs to
                          const brief = briefs.find((b) => (b.action_items ?? []).some((p) => p.title === proposal.title && p.description === proposal.description));
                          if (brief) {
                            const idx = (brief.action_items ?? []).findIndex((p) => p.title === proposal.title && p.description === proposal.description);
                            if (idx >= 0) handleProposal(brief.id, idx, "approve");
                          }
                        }}
                        className="flex items-center gap-1 bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-emerald-500"
                      >
                        <CheckCircle2 size={12} /> Approve
                      </button>
                      <button
                        onClick={() => {
                          setDetailModal(null);
                          const brief = briefs.find((b) => (b.action_items ?? []).some((p) => p.title === proposal.title && p.description === proposal.description));
                          if (brief) {
                            const idx = (brief.action_items ?? []).findIndex((p) => p.title === proposal.title && p.description === proposal.description);
                            if (idx >= 0) handleProposal(brief.id, idx, "reject");
                          }
                        }}
                        className="flex items-center gap-1 border border-red-300 text-red-600 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-50"
                      >
                        <XCircle size={12} /> Reject
                      </button>
                    </div>
                  )}

                  {/* Build button — only when PRD is ready */}
                  {proposal.status === "approved" && buildSt === "prd_ready" && changeId && (
                    <button
                      onClick={() => {
                        const brief = briefs.find((b) => (b.action_items ?? []).some((p) => p.title === proposal.title));
                        const briefId = brief?.id ?? "";
                        const idx = brief ? (brief.action_items ?? []).findIndex((p) => p.title === proposal.title) : 0;
                        triggerBuild(changeId, briefId, idx);
                      }}
                      className="flex items-center gap-1 bg-navy text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-navy/80"
                    >
                      <Hammer size={12} /> Build
                    </button>
                  )}
                </div>
              </div>
              <div className="px-5 py-3 border-t border-ivory-dark">
                <button onClick={() => setDetailModal(null)} className="w-full bg-navy text-white py-2 rounded-lg text-sm font-medium hover:bg-navy/90">Close</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Full Brief Detail Modal */}
      {briefDetailModal && (() => {
        const brief = briefDetailModal;
        const rawData = brief.summary_json.raw_data;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setBriefDetailModal(null)}>
            <div className="absolute inset-0 bg-black/40" />
            <div className="relative bg-white rounded-xl max-w-2xl w-full mx-4 max-h-[85vh] overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-ivory-dark sticky top-0 bg-white z-10">
                <div>
                  <h2 className="font-[DM_Serif_Display] text-lg text-navy">Brief Detail</h2>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-warm-gray">
                      {new Date(brief.generated_at).toLocaleDateString()} {new Date(brief.generated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${brief.status === "actioned" ? "bg-emerald-100 text-emerald-700" : brief.status === "reviewed" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                      {brief.status}
                    </span>
                    <span className="text-[10px] text-warm-gray">
                      {rawData?.feedback_count ?? 0} feedback &middot; {rawData?.session_count ?? 0} sessions
                    </span>
                  </div>
                </div>
                <button onClick={() => setBriefDetailModal(null)} className="text-warm-gray hover:text-navy"><X size={18} /></button>
              </div>

              <div className="px-6 py-5 space-y-6">
                {/* Summary */}
                <div>
                  <span className="text-[10px] font-semibold text-warm-gray uppercase tracking-wider block mb-1.5">Summary</span>
                  <p className="text-sm text-navy leading-relaxed">{brief.summary_json.summary}</p>
                </div>

                {/* Top Friction Points */}
                {brief.summary_json.top_friction_points?.length > 0 && (
                  <div>
                    <span className="text-[10px] font-semibold text-warm-gray uppercase tracking-wider block mb-1.5">Top Friction Points</span>
                    <ul className="space-y-1">
                      {brief.summary_json.top_friction_points.map((point, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-navy">
                          <span className="text-red-400 mt-0.5">&#8226;</span>
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Unused Features */}
                {brief.summary_json.unused_features?.length > 0 && (
                  <div>
                    <span className="text-[10px] font-semibold text-warm-gray uppercase tracking-wider block mb-1.5">Unused Features</span>
                    <ul className="space-y-1">
                      {brief.summary_json.unused_features.map((feature, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-navy">
                          <span className="text-amber-400 mt-0.5">&#8226;</span>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Proposals */}
                {(brief.action_items ?? []).length > 0 && (
                  <div>
                    <span className="text-[10px] font-semibold text-warm-gray uppercase tracking-wider block mb-3">
                      Proposals ({brief.action_items.length})
                    </span>
                    <div className="space-y-4">
                      {(brief.action_items ?? []).map((proposal, i) => {
                        const isActioned = proposal.status === "approved" || proposal.status === "rejected";
                        const loadingKey = `${brief.id}-${i}`;
                        const prd = proposal.feature_context?.prd;
                        const prdExpanded = expandedPRDs.has(i);

                        return (
                          <div key={i} className={`bg-ivory/30 rounded-xl border border-ivory-dark p-4 ${isActioned ? "opacity-70" : ""}`}>
                            {/* Badges */}
                            <div className="mb-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <BadgeRow proposal={proposal} />
                                {proposal.status && (
                                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${proposal.status === "approved" ? "text-emerald-600 bg-emerald-100" : proposal.status === "rejected" ? "text-red-600 bg-red-100" : "text-slate-600 bg-slate-100"}`}>
                                    {proposal.status.toUpperCase()}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Title & description */}
                            <h4 className="text-sm font-bold text-navy">{proposal.title}</h4>
                            <p className="text-xs text-warm-gray mt-1">{proposal.description}</p>

                            {/* Evidence */}
                            <div className="mt-3 bg-ivory/50 rounded px-3 py-2 border-l-2 border-navy/20">
                              <span className="text-[10px] font-semibold text-warm-gray uppercase tracking-wider block mb-0.5">Evidence</span>
                              <span className="text-xs text-navy/80">{proposal.evidence}</span>
                            </div>

                            {/* Expandable PRD */}
                            {prd && (
                              <div className="mt-3">
                                <button
                                  onClick={() => togglePRD(i)}
                                  className="flex items-center gap-1 text-[10px] font-semibold text-navy/60 hover:text-navy uppercase tracking-wider"
                                >
                                  {prdExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                  PRD Details
                                </button>
                                {prdExpanded && (
                                  <div className="mt-2 pl-4 border-l border-ivory-dark space-y-3">
                                    <div>
                                      <span className="text-[10px] font-semibold text-warm-gray uppercase tracking-wider">Problem</span>
                                      <p className="text-xs text-navy mt-0.5">{prd.problem}</p>
                                    </div>
                                    <div>
                                      <span className="text-[10px] font-semibold text-warm-gray uppercase tracking-wider">Solution</span>
                                      <p className="text-xs text-navy mt-0.5">{prd.solution}</p>
                                    </div>
                                    {prd.acceptance_criteria?.length > 0 && (
                                      <div>
                                        <span className="text-[10px] font-semibold text-warm-gray uppercase tracking-wider">Acceptance Criteria</span>
                                        <ul className="mt-1 space-y-0.5">
                                          {prd.acceptance_criteria.map((c, idx) => (
                                            <li key={idx} className="flex items-start gap-2 text-xs text-navy">
                                              <span className="text-warm-gray">&#9744;</span>
                                              <span>{c}</span>
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                    {prd.files_to_modify?.length > 0 && (
                                      <div>
                                        <span className="text-[10px] font-semibold text-warm-gray uppercase tracking-wider">Files to Modify</span>
                                        <ul className="mt-1 space-y-0.5">
                                          {prd.files_to_modify.map((f, idx) => (
                                            <li key={idx} className="text-xs text-navy font-mono bg-white rounded px-2 py-1">{f}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                    {prd.test_requirements?.length > 0 && (
                                      <div>
                                        <span className="text-[10px] font-semibold text-warm-gray uppercase tracking-wider">Test Requirements</span>
                                        <ul className="mt-1 space-y-0.5 list-disc list-inside">
                                          {prd.test_requirements.map((t, idx) => (
                                            <li key={idx} className="text-xs text-navy">{t}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                    <div>
                                      <span className="text-[10px] font-semibold text-warm-gray uppercase tracking-wider">Rollback Plan</span>
                                      <p className="text-xs text-navy mt-0.5">{prd.rollback_plan}</p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Action buttons */}
                            {!isActioned && (
                              <div className="flex gap-2 mt-3">
                                <button
                                  onClick={() => handleProposal(brief.id, i, "approve")}
                                  disabled={actionLoading === loadingKey}
                                  className="flex items-center gap-1 bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-emerald-500 disabled:opacity-50"
                                >
                                  {actionLoading === loadingKey ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleProposal(brief.id, i, "reject")}
                                  disabled={actionLoading === loadingKey}
                                  className="flex items-center gap-1 border border-red-300 text-red-600 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-50 disabled:opacity-50"
                                >
                                  <XCircle size={12} />
                                  Reject
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-3 border-t border-ivory-dark sticky bottom-0 bg-white">
                <button onClick={() => setBriefDetailModal(null)} className="w-full bg-navy text-white py-2 rounded-lg text-sm font-medium hover:bg-navy/90">Close</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
