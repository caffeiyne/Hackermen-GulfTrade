"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  ArrowRight,
  Package,
  MapPin,
  TrendingUp,
  TrendingDown,
  Truck,
  Clock,
  Filter,
  RotateCcw,
  Loader2,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type { TransferProposal, StockLevel, Warehouse } from "@/lib/types";

// ---- Mini UAE map coordinates (mirrors UAEMap.tsx) ----
const WH_COORDS: Record<string, { x: number; y: number; city: string }> = {
  DXB: { x: 280, y: 180, city: "Dubai" },
  AUH: { x: 140, y: 250, city: "Abu Dhabi" },
  SHJ: { x: 330, y: 140, city: "Sharjah" },
};

const WH_COLORS: Record<string, string> = {
  DXB: "#22bd7a",
  AUH: "#3b82f6",
  SHJ: "#a855f7",
};

interface ActionEntry {
  transfer: TransferProposal;
  fromStock: StockLevel | undefined;
  toStock: StockLevel | undefined;
}

export default function ActionLogPage() {
  const [transfers, setTransfers] = useState<TransferProposal[]>([]);
  const [stockLevels, setStockLevels] = useState<StockLevel[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [tr, stk, whs] = await Promise.all([
        api.getTransfers(),
        api.getStockLevels(),
        api.getWarehouses(),
      ]);
      setTransfers(tr);
      setStockLevels(stk);
      setWarehouses(whs);
    } catch (err) {
      console.error("Failed to load action log:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 8000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Only show transfers that have been actioned (approved/completed/rejected/cancelled)
  const actionedTransfers = useMemo(() => {
    return transfers
      .filter((t) => ["completed", "approved", "rejected", "cancelled"].includes(t.status))
      .filter((t) => statusFilter === "all" || t.status === statusFilter)
      .sort((a, b) => {
        const da = new Date(a.updated_at || a.created_at || 0).getTime();
        const db = new Date(b.updated_at || b.created_at || 0).getTime();
        return db - da;
      });
  }, [transfers, statusFilter]);

  // Build enriched entries with current stock levels
  const entries: ActionEntry[] = useMemo(() => {
    return actionedTransfers.map((transfer) => ({
      transfer,
      fromStock: stockLevels.find(
        (s) => s.sku_id === transfer.sku_id && s.warehouse_id === transfer.from_warehouse
      ),
      toStock: stockLevels.find(
        (s) => s.sku_id === transfer.sku_id && s.warehouse_id === transfer.to_warehouse
      ),
    }));
  }, [actionedTransfers, stockLevels]);

  // Summary stats
  const stats = useMemo(() => {
    const completed = transfers.filter((t) => t.status === "completed");
    const rejected = transfers.filter((t) => t.status === "rejected");
    const cancelled = transfers.filter((t) => t.status === "cancelled");
    const totalUnitsMoved = completed.reduce((sum, t) => sum + t.quantity, 0);
    const totalNetBenefit = completed.reduce((sum, t) => sum + Number(t.net_benefit || 0), 0);
    return {
      completed: completed.length,
      rejected: rejected.length,
      cancelled: cancelled.length,
      totalUnitsMoved,
      totalNetBenefit,
    };
  }, [transfers]);

  const formatTime = (ts?: string | null) => {
    if (!ts) return "—";
    try {
      return new Date(ts).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return ts;
    }
  };

  const handleCancel = async (transferId: string) => {
    setCancellingId(transferId);
    try {
      await api.cancelTransfer(transferId);
      await loadData();
    } catch (err) {
      console.error("Failed to cancel transfer:", err);
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-buddy-text">Action Summary</h1>
        <p className="text-sm text-buddy-muted mt-1">
          Track every approved and rejected action — see what stock moved where, and the impact on each warehouse.
        </p>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card delay={0.05}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-950/60 border border-green-900 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-xs text-buddy-muted">Completed</p>
              <p className="text-xl font-bold text-buddy-text">{stats.completed}</p>
            </div>
          </div>
        </Card>
        <Card delay={0.1}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-950/60 border border-red-900 flex items-center justify-center">
              <XCircle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-xs text-buddy-muted">Rejected</p>
              <p className="text-xl font-bold text-buddy-text">{stats.rejected}</p>
            </div>
          </div>
        </Card>
        <Card delay={0.15}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-tradeling-950/60 border border-tradeling-800 flex items-center justify-center">
              <Truck className="w-5 h-5 text-tradeling-400" />
            </div>
            <div>
              <p className="text-xs text-buddy-muted">Units Moved</p>
              <p className="text-xl font-bold text-tradeling-400">{formatNumber(stats.totalUnitsMoved)}</p>
            </div>
          </div>
        </Card>
        <Card delay={0.2}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-950/60 border border-blue-900 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-buddy-muted">Net Benefit</p>
              <p className="text-xl font-bold text-blue-400">{formatCurrency(stats.totalNetBenefit)}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-buddy-muted" />
        {["all", "completed", "rejected", "cancelled"].map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
              statusFilter === f
                ? "bg-tradeling-950/60 text-tradeling-400 border border-tradeling-800"
                : "bg-buddy-bg text-buddy-muted border border-buddy-border hover:text-buddy-text"
            }`}
          >
            {f === "all" ? "All Actions" : f}
          </button>
        ))}
      </div>

      {/* Action entries */}
      <div className="space-y-4">
        <AnimatePresence>
          {entries.map((entry, i) => {
            const { transfer, fromStock, toStock } = entry;
            const isApproved = transfer.status === "completed" || transfer.status === "approved";
            const isCancelled = transfer.status === "cancelled";
            const isExpanded = expandedId === transfer.transfer_id;
            const fromColor = WH_COLORS[transfer.from_warehouse] || "#6b7280";
            const toColor = WH_COLORS[transfer.to_warehouse] || "#6b7280";

            // Calculate before/after for the source (stock was reduced by quantity)
            const fromBefore = (fromStock?.available_qty || 0) + transfer.quantity;
            const fromAfter = fromStock?.available_qty || 0;
            const toBefore = Math.max(0, (toStock?.available_qty || 0) - transfer.quantity);
            const toAfter = toStock?.available_qty || 0;

            return (
              <motion.div
                key={transfer.transfer_id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card hover>
                  {/* Clickable header */}
                  <div
                    className="cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : transfer.transfer_id || null)}
                  >
                    {/* Top row: status + route + time */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-4">
                        {/* Status icon */}
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          isCancelled
                            ? "bg-yellow-950/60 border border-yellow-900"
                            : isApproved
                            ? "bg-green-950/60 border border-green-900"
                            : "bg-red-950/60 border border-red-900"
                        }`}>
                          {isCancelled ? (
                            <RotateCcw className="w-5 h-5 text-yellow-400" />
                          ) : isApproved ? (
                            <CheckCircle2 className="w-5 h-5 text-green-400" />
                          ) : (
                            <XCircle className="w-5 h-5 text-red-400" />
                          )}
                        </div>

                        {/* Route */}
                        <div className="flex items-center gap-3">
                          <div className="text-center">
                            <p className="font-mono text-sm font-medium text-buddy-text">{transfer.from_warehouse}</p>
                            <p className="text-xs text-buddy-muted">From</p>
                          </div>
                          <ArrowRight className={`w-5 h-5 ${isCancelled ? "text-yellow-400" : isApproved ? "text-tradeling-400" : "text-red-400"}`} />
                          <div className="text-center">
                            <p className="font-mono text-sm font-medium text-buddy-text">{transfer.to_warehouse}</p>
                            <p className="text-xs text-buddy-muted">To</p>
                          </div>
                        </div>

                        {/* SKU + qty */}
                        <div>
                          <p className="font-mono text-sm text-buddy-text">{transfer.sku_id}</p>
                          <p className="text-xs text-buddy-muted">{formatNumber(transfer.quantity)} units</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-xs text-buddy-muted flex items-center gap-1 justify-end">
                            <Clock className="w-3 h-3" />
                            {formatTime(transfer.updated_at || transfer.created_at)}
                          </p>
                          {transfer.approved_by && (
                            <p className="text-xs text-buddy-muted">by {transfer.approved_by}</p>
                          )}
                        </div>
                        <Badge variant={isCancelled ? "warning" : isApproved ? "success" : "danger"}>
                          {transfer.status}
                        </Badge>
                        {transfer.status === "completed" && (
                          <Button
                            onClick={(e: any) => {
                              e.stopPropagation();
                              handleCancel(transfer.transfer_id);
                            }}
                            disabled={cancellingId === transfer.transfer_id}
                            variant="secondary"
                            size="sm"
                          >
                            {cancellingId === transfer.transfer_id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="w-3.5 h-3.5" />
                            )}
                            {cancellingId === transfer.transfer_id ? "Cancelling..." : "Cancel"}
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Compact summary row (always visible) */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="p-2.5 rounded-lg bg-buddy-bg">
                        <p className="text-xs text-buddy-muted">Units Moved</p>
                        <p className="text-sm font-medium text-tradeling-400">{formatNumber(transfer.quantity)}</p>
                      </div>
                      <div className="p-2.5 rounded-lg bg-buddy-bg">
                        <p className="text-xs text-buddy-muted">Transfer Cost</p>
                        <p className="text-sm font-medium text-red-400">{formatCurrency(Number(transfer.transfer_cost))}</p>
                      </div>
                      <div className="p-2.5 rounded-lg bg-buddy-bg">
                        <p className="text-xs text-buddy-muted">Net Benefit</p>
                        <p className={`text-sm font-bold ${Number(transfer.net_benefit || 0) >= 0 ? "text-tradeling-400" : "text-red-400"}`}>
                          {Number(transfer.net_benefit || 0) >= 0 ? "+" : ""}{formatCurrency(Number(transfer.net_benefit || 0))}
                        </p>
                      </div>
                      <div className="p-2.5 rounded-lg bg-buddy-bg">
                        <p className="text-xs text-buddy-muted">Lead Time</p>
                        <p className="text-sm font-medium text-buddy-text">{transfer.lead_time_days} days</p>
                      </div>
                    </div>
                  </div>

                  {/* Expanded detail: mini map + before/after */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-4 pt-4 border-t border-buddy-border grid grid-cols-1 lg:grid-cols-2 gap-6">
                          {/* Mini UAE map highlighting this route */}
                          <div>
                            <h4 className="text-sm font-medium text-buddy-text mb-3 flex items-center gap-2">
                              <MapPin className="w-4 h-4 text-tradeling-400" />
                              Transfer Route Map
                            </h4>
                            <div className="relative w-full rounded-lg bg-buddy-bg p-2" style={{ aspectRatio: "16 / 10" }}>
                              <svg viewBox="0 0 480 320" className="w-full h-full">
                                {/* UAE outline */}
                                <path
                                  d="M 60 80 Q 100 60 180 70 L 280 65 Q 350 60 400 80 L 420 120 Q 415 180 390 220 L 340 280 Q 250 290 180 285 L 120 280 Q 80 270 65 230 L 55 180 Q 50 120 60 80 Z"
                                  fill="rgba(20, 20, 35, 0.4)"
                                  stroke="rgba(100, 100, 120, 0.3)"
                                  strokeWidth="1.5"
                                  strokeDasharray="4 3"
                                />

                                {/* All warehouse nodes (dimmed except involved) */}
                                {Object.entries(WH_COORDS).map(([id, coord]) => {
                                  const isInvolved = id === transfer.from_warehouse || id === transfer.to_warehouse;
                                  const color = WH_COLORS[id] || "#6b7280";
                                  return (
                                    <g key={id}>
                                      <circle
                                        cx={coord.x}
                                        cy={coord.y}
                                        r={isInvolved ? 16 : 12}
                                        fill={isInvolved ? color : "rgba(30, 30, 50, 0.6)"}
                                        fillOpacity={isInvolved ? 0.3 : 0.15}
                                        stroke={isInvolved ? color : "rgba(80, 80, 100, 0.3)"}
                                        strokeWidth={isInvolved ? 2.5 : 1}
                                      />
                                      <text
                                        x={coord.x}
                                        y={coord.y + 4}
                                        fill={isInvolved ? color : "rgba(120, 120, 140, 0.5)"}
                                        fontSize="10"
                                        fontWeight="bold"
                                        textAnchor="middle"
                                        fontFamily="monospace"
                                      >
                                        {id}
                                      </text>
                                      {isInvolved && (
                                        <text
                                          x={coord.x}
                                          y={coord.y - 24}
                                          fill={color}
                                          fontSize="8"
                                          textAnchor="middle"
                                          fontFamily="monospace"
                                        >
                                          {id === transfer.from_warehouse
                                            ? `${formatNumber(fromAfter)}`
                                            : `${formatNumber(toAfter)}`}
                                        </text>
                                      )}
                                    </g>
                                  );
                                })}

                                {/* Animated route line */}
                                {(() => {
                                  const from = WH_COORDS[transfer.from_warehouse];
                                  const to = WH_COORDS[transfer.to_warehouse];
                                  if (!from || !to) return null;
                                  return (
                                    <g>
                                      <line
                                        x1={from.x}
                                        y1={from.y}
                                        x2={to.x}
                                        y2={to.y}
                                        stroke={isApproved ? "#22d3ee" : "#ef4444"}
                                        strokeWidth={3}
                                        strokeDasharray="8 4"
                                      >
                                        <animate
                                          attributeName="stroke-dashoffset"
                                          values="0;-24"
                                          dur="1s"
                                          repeatCount="indefinite"
                                        />
                                      </line>
                                      {/* Moving transfer dot */}
                                      {isApproved && (
                                        <motion.circle
                                          r="5"
                                          fill="#22d3ee"
                                          initial={{ cx: from.x, cy: from.y }}
                                          animate={{ cx: [from.x, to.x], cy: [from.y, to.y] }}
                                          transition={{
                                            duration: 2,
                                            repeat: Infinity,
                                            ease: "easeInOut",
                                            repeatType: "reverse",
                                          }}
                                        >
                                          <animate attributeName="r" values="4;6;4" dur="0.8s" repeatCount="indefinite" />
                                        </motion.circle>
                                      )}
                                      {/* Arrow direction label */}
                                      <text
                                        x={(from.x + to.x) / 2}
                                        y={(from.y + to.y) / 2 - 8}
                                        fill={isApproved ? "#22d3ee" : "#ef4444"}
                                        fontSize="9"
                                        textAnchor="middle"
                                        fontFamily="monospace"
                                      >
                                        {transfer.from_warehouse}→{transfer.to_warehouse}
                                      </text>
                                    </g>
                                  );
                                })()}
                              </svg>
                            </div>

                            {/* Legend */}
                            <div className="flex items-center gap-4 mt-2 text-xs text-buddy-muted">
                              <span className="flex items-center gap-1">
                                <span className="w-2.5 h-2.5 rounded-full" style={{ background: fromColor }} />
                                Source: {transfer.from_warehouse}
                              </span>
                              <span className="flex items-center gap-1">
                                <span className="w-2.5 h-2.5 rounded-full" style={{ background: toColor }} />
                                Destination: {transfer.to_warehouse}
                              </span>
                            </div>
                          </div>

                          {/* Before / After stock levels */}
                          <div>
                            <h4 className="text-sm font-medium text-buddy-text mb-3 flex items-center gap-2">
                              <Package className="w-4 h-4 text-tradeling-400" />
                              Stock Impact — {transfer.sku_id}
                            </h4>

                            {/* Source warehouse before/after */}
                            <div className="space-y-3">
                              {/* Source */}
                              <div className="p-3 rounded-lg bg-buddy-bg border border-buddy-border">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: fromColor }} />
                                    <span className="font-mono text-sm font-medium text-buddy-text">
                                      {transfer.from_warehouse}
                                    </span>
                                    <span className="text-xs text-buddy-muted">Source (stock out)</span>
                                  </div>
                                  <TrendingDown className="w-4 h-4 text-red-400" />
                                </div>
                                <div className="flex items-center gap-3">
                                  <div className="flex-1">
                                    <p className="text-xs text-buddy-muted">Before</p>
                                    <p className="text-lg font-medium text-buddy-text">{formatNumber(fromBefore)}</p>
                                  </div>
                                  <ArrowRight className="w-4 h-4 text-buddy-muted" />
                                  <div className="flex-1">
                                    <p className="text-xs text-buddy-muted">After</p>
                                    <p className="text-lg font-medium text-red-400">{formatNumber(fromAfter)}</p>
                                  </div>
                                  <div className="flex-1 text-right">
                                    <p className="text-xs text-buddy-muted">Change</p>
                                    <p className="text-sm font-bold text-red-400">
                                      -{formatNumber(transfer.quantity)}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              {/* Destination */}
                              <div className="p-3 rounded-lg bg-buddy-bg border border-buddy-border">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: toColor }} />
                                    <span className="font-mono text-sm font-medium text-buddy-text">
                                      {transfer.to_warehouse}
                                    </span>
                                    <span className="text-xs text-buddy-muted">Destination (stock in)</span>
                                  </div>
                                  <TrendingUp className="w-4 h-4 text-tradeling-400" />
                                </div>
                                <div className="flex items-center gap-3">
                                  <div className="flex-1">
                                    <p className="text-xs text-buddy-muted">Before</p>
                                    <p className="text-lg font-medium text-buddy-text">{formatNumber(toBefore)}</p>
                                  </div>
                                  <ArrowRight className="w-4 h-4 text-buddy-muted" />
                                  <div className="flex-1">
                                    <p className="text-xs text-buddy-muted">After</p>
                                    <p className="text-lg font-medium text-tradeling-400">{formatNumber(toAfter)}</p>
                                  </div>
                                  <div className="flex-1 text-right">
                                    <p className="text-xs text-buddy-muted">Change</p>
                                    <p className="text-sm font-bold text-tradeling-400">
                                      +{formatNumber(transfer.quantity)}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Reasoning */}
                            {transfer.reason && (
                              <div className="mt-3 p-3 rounded-lg bg-buddy-bg">
                                <p className="text-xs text-buddy-muted mb-1">Reason</p>
                                <p className="text-xs text-buddy-text">{transfer.reason}</p>
                              </div>
                            )}

                            {/* Rejection reason */}
                            {transfer.rejection_reason && (
                              <div className="mt-3 p-3 rounded-lg bg-red-950/20 border border-red-900/30">
                                <p className="text-xs text-red-400 mb-1">Rejection Reason</p>
                                <p className="text-xs text-buddy-text">{transfer.rejection_reason}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {entries.length === 0 && !loading && (
          <Card>
            <div className="text-center py-12 space-y-2">
              <CheckCircle2 className="w-10 h-10 text-buddy-muted mx-auto opacity-50" />
              <p className="text-buddy-text">No actions recorded yet</p>
              <p className="text-xs text-buddy-muted">
                Approved and rejected transfers will appear here with detailed before/after impact.
              </p>
              <a href="/actions" className="inline-block text-xs text-tradeling-400 hover:underline mt-2">
                Go to Recommended Actions →
              </a>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
