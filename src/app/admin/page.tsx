"use client";

import { useState, useEffect, useCallback } from "react";
import { CheckCircle2, XCircle, Loader2, RefreshCw, Clock, BarChart3, Hammer, FileText } from "lucide-react";
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

  const triggerBuild = async (changeId: string) => {
    setActionLoading(`build-${changeId}`);
    try {
      const res = await fetch("/api/auto-build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ change_id: changeId }),
      });
      const data = await res.json();
      if (data.prd) {
        alert(`PRD generated! Build plan ready.\n\nProblem: ${data.prd.problem}\nFiles: ${data.prd.files_to_modify?.join(", ")}`);
      }
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
                      <div className="flex-1">
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
                          <button
                            onClick={() => {
                              // Find the shipped_change for this proposal by querying
                              fetch("/api/auto-build").then(r => r.json()).then((changes: Array<{id: string; title: string; feature_context: Record<string, unknown> | null}>) => {
                                const match = changes.find((c: {title: string}) => c.title === proposal.title);
                                if (match) triggerBuild(match.id);
                              });
                            }}
                            disabled={actionLoading?.startsWith("build")}
                            className="flex items-center gap-1 bg-navy text-white px-2 py-1 rounded text-xs font-medium hover:bg-navy/80 disabled:opacity-50"
                          >
                            {actionLoading?.startsWith("build") ? <Loader2 size={10} className="animate-spin" /> : <Hammer size={10} />}
                            Build
                          </button>
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
    </div>
  );
}
