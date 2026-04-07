"use client";

import { useState, useEffect, useCallback } from "react";
import { CheckCircle2, XCircle, Loader2, RefreshCw, Clock, BarChart3, Hammer, FileText, ExternalLink, X } from "lucide-react";
import { useAuthSession } from "@/hooks/use-auth-session";

interface Proposal {
  title: string;
  description: string;
  origin_type: string;
  evidence: string;
  confidence: string;
  tier: string;
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
  feature_context: {
    build_status?: string;
    github_issue_url?: string;
    github_issue_number?: number;
    pr_url?: string;
    prd?: PRDData;
    [key: string]: unknown;
  } | null;
}

interface PMBrief {
  id: string;
  generated_at: string;
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

export default function AdminPage() {
  const { user, loading: authLoading } = useAuthSession();
  const [briefs, setBriefs] = useState<PMBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [buildModal, setBuildModal] = useState<{
    title: string;
    prd: PRDData | null;
    github_issue_url: string | null;
    github_issue_number: number | null;
  } | null>(null);
  const [detailModal, setDetailModal] = useState<{
    proposal: Proposal;
    change?: BuildChange;
  } | null>(null);

  const fetchBriefs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/proposals");
      if (res.ok) setBriefs(await res.json());
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (user) fetchBriefs();
  }, [user, fetchBriefs]);

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
      await fetch("/api/admin/proposals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief_id: briefId, proposal_index: index, action }),
      });
      await fetchBriefs();
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
      });
      await fetchBriefs();
    } catch { /* silent */ }
    setActionLoading(null);
  };

  if (authLoading) return <div className="flex items-center justify-center min-h-dvh"><Loader2 className="animate-spin text-warm-gray" /></div>;
  if (!user) return <div className="flex items-center justify-center min-h-dvh text-warm-gray">Sign in to access admin</div>;

  const totalProposals = briefs.reduce((n, b) => n + (b.action_items?.length ?? 0), 0);
  const approvedCount = briefs.reduce((n, b) => n + (b.action_items ?? []).filter((p) => p.status === "approved").length, 0);
  const rejectedCount = briefs.reduce((n, b) => n + (b.action_items ?? []).filter((p) => p.status === "rejected").length, 0);
  const approveRate = totalProposals > 0 ? Math.round((approvedCount / totalProposals) * 100) : 0;

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

      {/* Briefs */}
      <div className="px-6 pb-24">
        {loading ? (
          <div className="text-center py-12 text-warm-gray"><Loader2 className="animate-spin mx-auto" /></div>
        ) : briefs.length === 0 ? (
          <div className="text-center py-12 text-warm-gray">
            <p className="text-lg font-medium">No briefs yet</p>
            <p className="text-sm mt-1">Click "Generate Brief" to create one from today's feedback and companion data.</p>
          </div>
        ) : (
          briefs.map((brief) => (
            <div key={brief.id} className="bg-white rounded-xl border border-ivory-dark mb-4 overflow-hidden">
              {/* Brief header */}
              <div className="px-5 py-3 border-b border-ivory-dark">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs text-warm-gray">
                      {new Date(brief.generated_at).toLocaleDateString()} {new Date(brief.generated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="text-xs text-warm-gray ml-3">
                      {brief.summary_json.raw_data?.feedback_count ?? 0} feedback &middot; {brief.summary_json.raw_data?.session_count ?? 0} sessions
                    </span>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${brief.status === "actioned" ? "bg-emerald-100 text-emerald-700" : brief.status === "reviewed" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                    {brief.status}
                  </span>
                </div>
                <p className="text-sm text-navy mt-1">{brief.summary_json.summary}</p>
              </div>

              {/* Proposals */}
              {(brief.action_items ?? []).map((proposal, i) => {
                const origin = ORIGIN_LABELS[proposal.origin_type] ?? ORIGIN_LABELS.pattern;
                const conf = CONFIDENCE_COLORS[proposal.confidence] ?? CONFIDENCE_COLORS.low;
                const isActioned = proposal.status === "approved" || proposal.status === "rejected";
                const loadingKey = `${brief.id}-${i}`;

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
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${origin.color}`}>{origin.label}</span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${conf}`}>{proposal.confidence?.toUpperCase()}</span>
                          <span className="text-[10px] text-warm-gray">{proposal.tier === "config" ? "Config change" : "Code change"}</span>
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

                      {proposal.status === "approved" && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-emerald-600 font-medium flex items-center gap-1"><CheckCircle2 size={12} /> Approved</span>
                          {(() => {
                            // Check for build status from feature_context or local state
                            const localStatus = Object.values(buildStatus).find(Boolean);
                            const featureBuildStatus = (proposal as Proposal & { feature_context?: { build_status?: string; github_issue_url?: string } }).feature_context?.build_status;
                            const issueUrl = (proposal as Proposal & { feature_context?: { github_issue_url?: string } }).feature_context?.github_issue_url;

                            if (featureBuildStatus === "triggered" || localStatus) {
                              const url = issueUrl || localStatus?.url;
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

                            if (featureBuildStatus === "pr_created") {
                              return (
                                <a
                                  href={issueUrl ?? "#"}
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

                            const buildKey = `build-${brief.id}-${i}`;
                            return (
                              <button
                                onClick={() => {
                                  fetch("/api/auto-build").then(r => r.json()).then((changes: Array<BuildChange>) => {
                                    const match = changes.find((c) => c.title === proposal.title);
                                    if (match) triggerBuild(match.id, brief.id, i);
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
                      {proposal.status === "rejected" && (
                        <span className="text-xs text-red-500 font-medium flex items-center gap-1"><XCircle size={12} /> Rejected</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))
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
              {buildModal.github_issue_url ? (
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

      {/* Detail Modal */}
      {detailModal && (() => {
        const { proposal, change } = detailModal;
        const origin = ORIGIN_LABELS[proposal.origin_type] ?? ORIGIN_LABELS.pattern;
        const conf = CONFIDENCE_COLORS[proposal.confidence] ?? CONFIDENCE_COLORS.low;
        const fc = change?.feature_context ?? proposal.feature_context;
        const prd = fc?.prd as PRDData | undefined;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setDetailModal(null)}>
            <div className="absolute inset-0 bg-black/40" />
            <div className="relative bg-white rounded-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-ivory-dark">
                <h2 className="font-[DM_Serif_Display] text-lg text-navy">Proposal Detail</h2>
                <button onClick={() => setDetailModal(null)} className="text-warm-gray hover:text-navy"><X size={18} /></button>
              </div>
              <div className="px-5 py-4 space-y-4">
                {/* Badges */}
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${origin.color}`}>{origin.label}</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${conf}`}>{proposal.confidence?.toUpperCase()}</span>
                  {proposal.status && (
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${proposal.status === "approved" ? "text-emerald-600 bg-emerald-100" : proposal.status === "rejected" ? "text-red-600 bg-red-100" : "text-slate-600 bg-slate-100"}`}>
                      {proposal.status.toUpperCase()}
                    </span>
                  )}
                </div>

                {/* Title & description */}
                <div>
                  <h3 className="text-base font-semibold text-navy">{proposal.title}</h3>
                  <p className="text-sm text-warm-gray mt-1">{proposal.description}</p>
                </div>

                {/* Evidence */}
                <div className="bg-ivory/50 rounded px-3 py-2 border-l-2 border-navy/20">
                  <span className="text-[10px] font-semibold text-warm-gray uppercase tracking-wider block mb-0.5">Evidence</span>
                  <span className="text-xs text-navy/80">{proposal.evidence}</span>
                </div>

                {/* PRD section (for approved+built proposals) */}
                {prd && (
                  <>
                    <div className="border-t border-ivory-dark pt-4">
                      <span className="text-[10px] font-semibold text-warm-gray uppercase tracking-wider">PRD</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold text-warm-gray uppercase tracking-wider">Problem</span>
                      <p className="text-sm text-navy mt-1">{prd.problem}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold text-warm-gray uppercase tracking-wider">Solution</span>
                      <p className="text-sm text-navy mt-1">{prd.solution}</p>
                    </div>
                    {prd.acceptance_criteria?.length > 0 && (
                      <div>
                        <span className="text-[10px] font-semibold text-warm-gray uppercase tracking-wider">Acceptance Criteria</span>
                        <ul className="mt-1 space-y-0.5 list-disc list-inside">
                          {prd.acceptance_criteria.map((c, idx) => (
                            <li key={idx} className="text-xs text-navy">{c}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {prd.files_to_modify?.length > 0 && (
                      <div>
                        <span className="text-[10px] font-semibold text-warm-gray uppercase tracking-wider">Files to Modify</span>
                        <ul className="mt-1 space-y-0.5">
                          {prd.files_to_modify.map((f, idx) => (
                            <li key={idx} className="text-xs text-navy font-mono bg-ivory/50 rounded px-2 py-1">{f}</li>
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
                      <p className="text-sm text-navy mt-1">{prd.rollback_plan}</p>
                    </div>
                  </>
                )}

                {/* Build status & links */}
                {fc && (
                  <div className="border-t border-ivory-dark pt-4 space-y-2">
                    <span className="text-[10px] font-semibold text-warm-gray uppercase tracking-wider">Build Status</span>
                    <div className="flex items-center gap-2">
                      {fc.build_status === "pr_created" ? (
                        <span className="text-xs font-medium text-emerald-600 flex items-center gap-1"><CheckCircle2 size={12} /> PR Created</span>
                      ) : fc.build_status === "triggered" ? (
                        <span className="text-xs font-medium text-amber-600 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Triggered</span>
                      ) : (
                        <span className="text-xs font-medium text-slate-500 flex items-center gap-1"><Clock size={12} /> {String(fc.build_status ?? "pending")}</span>
                      )}
                    </div>
                    {fc.github_issue_url && (
                      <a href={String(fc.github_issue_url)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-navy font-medium hover:underline">
                        <FileText size={12} /> GitHub Issue #{String(fc.github_issue_number ?? "")} <ExternalLink size={10} />
                      </a>
                    )}
                    {fc.pr_url && (
                      <a href={String(fc.pr_url)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-navy font-medium hover:underline">
                        <FileText size={12} /> Pull Request <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                )}
              </div>
              <div className="px-5 py-3 border-t border-ivory-dark">
                <button onClick={() => setDetailModal(null)} className="w-full bg-navy text-white py-2 rounded-lg text-sm font-medium hover:bg-navy/90">Close</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
