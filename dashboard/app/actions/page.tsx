"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Check, X, DollarSign, TrendingUp, Loader2, AlertCircle, Truck, ExternalLink, Clock } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type { Recommendation, ImpactAssessment } from "@/lib/types";

export default function ActionsPage() {
  const searchParams = useSearchParams();
  const skuFilter = searchParams.get("sku");

  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [impact, setImpact] = useState<ImpactAssessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionedIds, setActionedIds] = useState<Set<string>>(new Set());
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<{ id: string; status: string; message: string } | null>(null);
  const [executedResults, setExecutedResults] = useState<Record<string, { quantityMoved: number; transferId: string }>>({});
  const [actionedAt, setActionedAt] = useState<Record<string, number>>({}); // recId -> timestamp
  const [actionedRecs, setActionedRecs] = useState<Record<string, Recommendation>>({}); // preserve actioned recs
  const [now, setNow] = useState(Date.now());
  const dismissTimerRef = useRef<NodeJS.Timeout | null>(null);

  const RETENTION_MS = 5 * 60 * 1000; // 5 minutes

  // Tick every second for countdown UI
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto-dismiss the lastAction toast after 5 minutes
  useEffect(() => {
    if (!lastAction) return;
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(() => {
      setLastAction(null);
    }, 5 * 60 * 1000); // 5 minutes
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, [lastAction]);

  const dismissLastAction = () => {
    setLastAction(null);
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
  };

  const load = useCallback(async () => {
    try {
      const data = await api.getRecommendations();
      setRecommendations(data.recommendations || []);
      setImpact(data.impact_assessment || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [load]);

  const handleApprove = async (rec: Recommendation) => {
    const recId = rec.recommendation_id;
    setProcessingId(recId);
    setError(null);
    try {
      const result = await api.approveRecommendation(recId, "Sara") as any;
      setActionedIds((prev) => new Set(prev).add(recId));
      setActionedAt((prev) => ({ ...prev, [recId]: Date.now() }));
      setActionedRecs((prev) => ({ ...prev, [recId]: rec }));
      setLastAction({
        id: recId,
        status: "approved",
        message: result.message || "Transfer approved and executed",
      });
      // Store the execution result for inline display
      if (result.transfer_id && result.quantity_moved !== undefined) {
        setExecutedResults((prev) => ({
          ...prev,
          [recId]: { quantityMoved: result.quantity_moved, transferId: result.transfer_id },
        }));
      }
      // Reload to see updated state
      await load();
    } catch (err: any) {
      setError(`Failed to approve: ${err.message || "Unknown error"}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (rec: Recommendation) => {
    const recId = rec.recommendation_id;
    setProcessingId(recId);
    setError(null);
    try {
      const result = await api.rejectRecommendation(recId, "Not economical at this time", "Sara");
      setActionedIds((prev) => new Set(prev).add(recId));
      setActionedAt((prev) => ({ ...prev, [recId]: Date.now() }));
      setActionedRecs((prev) => ({ ...prev, [recId]: rec }));
      setLastAction({
        id: recId,
        status: "rejected",
        message: (result as any).message || "Transfer rejected",
      });
      await load();
    } catch (err: any) {
      setError(`Failed to reject: ${err.message || "Unknown error"}`);
    } finally {
      setProcessingId(null);
    }
  };

  // Merge live recommendations with actioned recs that are still within retention window.
  // Actioned recs may disappear from the API response after approval, so we keep them
  // locally for 5 minutes so the user can still see the result + link to action summary.
  const displayRecs = useMemo(() => {
    const liveIds = new Set(recommendations.map((r) => r.recommendation_id));
    // Include actioned recs that are no longer in the live response but within retention
    const retainedActioned = Object.values(actionedRecs).filter((r) => {
      if (liveIds.has(r.recommendation_id)) return false; // already in live list
      const ts = actionedAt[r.recommendation_id] || 0;
      return now - ts < RETENTION_MS;
    });
    const merged = [...recommendations, ...retainedActioned];
    // Deduplicate by recommendation_id
    const seen = new Set<string>();
    const deduped = merged.filter((r) => {
      if (seen.has(r.recommendation_id)) return false;
      seen.add(r.recommendation_id);
      return true;
    });
    // Filter by SKU from URL query param
    return skuFilter
      ? deduped.filter((r) => r.sku_id === skuFilter)
      : deduped;
  }, [recommendations, actionedRecs, actionedAt, now, skuFilter, RETENTION_MS]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-buddy-text">Recommended Actions</h1>
        <p className="text-sm text-buddy-muted mt-1">
          Ranked transfer proposals with cost/benefit analysis — requires planner approval.
          {skuFilter && ` Filtered by SKU: ${skuFilter}`}
        </p>
      </div>

      {/* Last action feedback — clickable, auto-dismisses after 5 min */}
      {lastAction && (
        <AnimatePresence>
          <motion.div
            key={lastAction.id}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`p-3 rounded-lg border cursor-pointer transition-all ${
              lastAction.status === "approved"
                ? "bg-green-950/30 border-green-900/50 hover:bg-green-950/40 hover:border-green-700"
                : "bg-red-950/30 border-red-900/50 hover:bg-red-950/40 hover:border-red-700"
            }`}
            onClick={() => {
              if (lastAction.status === "approved") {
                window.location.href = "/action-log";
              } else {
                dismissLastAction();
              }
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {lastAction.status === "approved" ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                <p className="text-sm font-medium">{lastAction.message}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {lastAction.status === "approved" && (
                  <span className="text-xs flex items-center gap-1 opacity-70">
                    View in Action Summary <ExternalLink className="w-3 h-3" />
                  </span>
                )}
                <span className="text-xs flex items-center gap-1 opacity-50">
                  <Clock className="w-3 h-3" />
                  {Math.ceil(300 - (now - (actionedAt[lastAction.id] || now)) / 1000)}s
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); dismissLastAction(); }}
                  className="opacity-50 hover:opacity-100 transition-opacity"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      )}

      {/* Error */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3 rounded-lg border bg-red-950/30 border-red-900/50 text-red-400"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <p className="text-sm">{error}</p>
          </div>
        </motion.div>
      )}

      {/* Impact assessment */}
      {impact.length > 0 && (
        <Card delay={0.1}>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-tradeling-400" />
            <h3 className="font-medium text-buddy-text">Before / After Impact Assessment</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {impact.map((m, i) => (
              <motion.div
                key={m.metric}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.05 }}
                className="p-3 rounded-lg bg-buddy-bg border border-buddy-border"
              >
                <p className="text-xs text-buddy-muted mb-1">{m.metric}</p>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-buddy-muted">{formatNumber(m.before)}</span>
                  <ArrowRight className="w-3 h-3 text-buddy-muted" />
                  <span className={`font-medium ${m.is_improvement ? "text-tradeling-400" : "text-red-400"}`}>
                    {formatNumber(m.after)}
                  </span>
                </div>
                <p className="text-xs text-buddy-muted mt-1">
                  Delta: <span className={m.is_improvement ? "text-tradeling-400" : "text-red-400"}>
                    {m.delta > 0 ? "+" : ""}{formatNumber(m.delta)} {m.unit}
                  </span>
                </p>
              </motion.div>
            ))}
          </div>
        </Card>
      )}

      {/* Recommendation cards */}
      <div className="space-y-4">
        <AnimatePresence>
          {displayRecs.map((rec, i) => {
            const isActioned = actionedIds.has(rec.recommendation_id);
            const isProcessing = processingId === rec.recommendation_id;
            const actionedTime = actionedAt[rec.recommendation_id];
            const retentionSecondsLeft = actionedTime
              ? Math.ceil((RETENTION_MS - (now - actionedTime)) / 1000)
              : null;
            return (
              <motion.div
                key={rec.recommendation_id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card hover className={isActioned ? "border-tradeling-800/50" : ""}>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-4">
                      {/* Rank */}
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm ${
                        rec.is_feasible ? "bg-tradeling-950/60 text-tradeling-400 border border-tradeling-800" :
                        "bg-red-950/60 text-red-400 border border-red-900"
                      }`}>
                        #{rec.rank}
                      </div>

                      {/* Transfer route */}
                      <div className="flex items-center gap-3">
                        <div className="text-center">
                          <p className="font-mono text-sm font-medium text-buddy-text">{rec.from_warehouse}</p>
                          <p className="text-xs text-buddy-muted">From</p>
                        </div>
                        <ArrowRight className={`w-5 h-5 ${rec.is_feasible ? "text-tradeling-400" : "text-red-400"}`} />
                        <div className="text-center">
                          <p className="font-mono text-sm font-medium text-buddy-text">{rec.to_warehouse}</p>
                          <p className="text-xs text-buddy-muted">To</p>
                        </div>
                      </div>

                      <div>
                        <p className="font-mono text-sm text-buddy-text">{rec.sku_id}</p>
                        <p className="text-xs text-buddy-muted">{formatNumber(rec.quantity)} units</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {rec.route_disrupted && (
                        <Badge variant="danger">Route Disrupted</Badge>
                      )}
                      <Badge variant={rec.is_feasible ? "success" : "danger"}>
                        {rec.is_feasible ? "Feasible" : "Not Recommended"}
                      </Badge>
                    </div>
                  </div>

                  {/* Cost/benefit breakdown */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <div className="p-3 rounded-lg bg-buddy-bg">
                      <p className="text-xs text-buddy-muted flex items-center gap-1">
                        <DollarSign className="w-3 h-3" /> Transfer Cost
                      </p>
                      <p className="text-sm font-medium text-red-400">{formatCurrency(rec.transfer_cost)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-buddy-bg">
                      <p className="text-xs text-buddy-muted">Expected Benefit</p>
                      <p className="text-sm font-medium text-tradeling-400">{formatCurrency(rec.expected_benefit)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-buddy-bg">
                      <p className="text-xs text-buddy-muted">Net Benefit</p>
                      <p className={`text-sm font-bold ${rec.net_benefit >= 0 ? "text-tradeling-400" : "text-red-400"}`}>
                        {rec.net_benefit >= 0 ? "+" : ""}{formatCurrency(rec.net_benefit)}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-buddy-bg">
                      <p className="text-xs text-buddy-muted">Lead Time</p>
                      <p className="text-sm font-medium text-buddy-text">{rec.lead_time_days} days</p>
                    </div>
                  </div>

                  {/* Reason */}
                  <div className="p-3 rounded-lg bg-buddy-bg mb-4">
                    <p className="text-xs text-buddy-muted mb-1">Reasoning</p>
                    <p className="text-xs text-buddy-text">{rec.reason}</p>
                  </div>

                  {/* Constraints checked */}
                  <div className="mb-4">
                    <p className="text-xs text-buddy-muted mb-2">Constraints Checked:</p>
                    <div className="flex flex-wrap gap-2">
                      {rec.constraints_checked.map((c, j) => (
                        <span key={j} className="text-xs px-2 py-1 rounded bg-buddy-bg text-buddy-muted border border-buddy-border">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Approve/Reject buttons */}
                  {!isActioned && (
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleApprove(rec)}
                        disabled={!rec.is_feasible || isProcessing}
                        size="sm"
                      >
                        {isProcessing ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Check className="w-4 h-4" />
                        )}
                        {isProcessing ? "Processing..." : "Approve & Execute"}
                      </Button>
                      <Button
                        onClick={() => handleReject(rec)}
                        disabled={isProcessing}
                        variant="secondary"
                        size="sm"
                      >
                        <X className="w-4 h-4" /> Reject
                      </Button>
                    </div>
                  )}
                  {isActioned && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 rounded-lg bg-green-950/20 border border-green-900/40"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-green-950/60 border border-green-900 flex items-center justify-center shrink-0">
                            <Truck className="w-4 h-4 text-green-400" />
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-green-400">Transfer Executed Successfully</p>
                            {executedResults[rec.recommendation_id] ? (
                              <p className="text-xs text-buddy-muted">
                                {formatNumber(executedResults[rec.recommendation_id].quantityMoved)} units of{" "}
                                <span className="font-mono text-buddy-text">{rec.sku_id}</span> moved from{" "}
                                <span className="font-mono text-buddy-text">{rec.from_warehouse}</span> to{" "}
                                <span className="font-mono text-buddy-text">{rec.to_warehouse}</span>
                              </p>
                            ) : (
                              <p className="text-xs text-buddy-muted">Decision recorded.</p>
                            )}
                            {lastAction?.status === "rejected" && lastAction.id === rec.recommendation_id && (
                              <p className="text-xs text-red-400">{lastAction.message}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <a
                            href="/action-log"
                            className="inline-flex items-center gap-1.5 text-xs text-tradeling-400 hover:text-tradeling-300 font-medium"
                          >
                            View in Action Summary
                            <ExternalLink className="w-3 h-3" />
                          </a>
                          {retentionSecondsLeft !== null && retentionSecondsLeft > 0 && (
                            <span className="text-[10px] text-buddy-muted flex items-center gap-1 opacity-60">
                              <Clock className="w-2.5 h-2.5" />
                              Disappears in {Math.floor(retentionSecondsLeft / 60)}:{String(retentionSecondsLeft % 60).padStart(2, "0")}
                            </span>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </Card>
              </motion.div>
            );
          })}
        </AnimatePresence>
        {displayRecs.length === 0 && !loading && (
          <Card>
            <div className="text-center py-8 space-y-2">
              {skuFilter ? (
                <>
                  <p className="text-buddy-text">
                    No transfer recommendations for SKU <span className="font-mono font-medium">{skuFilter}</span>
                  </p>
                  <p className="text-xs text-buddy-muted">
                    The AI planner found no economical transfer for this SKU — the cost of moving stock
                    exceeds the expected benefit, or no source warehouse has enough excess.
                  </p>
                  <a href="/actions" className="inline-block text-xs text-tradeling-400 hover:underline mt-2">
                    View all recommendations →
                  </a>
                </>
              ) : (
                <p className="text-buddy-muted">No recommendations generated yet</p>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
