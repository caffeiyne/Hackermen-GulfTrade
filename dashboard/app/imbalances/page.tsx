"use client";

import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { AlertTriangle, AlertCircle, Info, Clock, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import type { ImbalanceFlag, Recommendation, SKU } from "@/lib/types";

const flagIcons: Record<string, typeof AlertTriangle> = {
  shortage: AlertCircle,
  excess: Info,
  ageing: Clock,
  misleading_sales: AlertTriangle,
};

const severityColors: Record<string, "danger" | "warning" | "info"> = {
  critical: "danger",
  warning: "warning",
  info: "info",
};

export default function ImbalancesPage() {
  const searchParams = useSearchParams();
  const skuFilter = searchParams.get("sku");

  const [flags, setFlags] = useState<ImbalanceFlag[]>([]);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [skus, setSkus] = useState<SKU[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    async function load() {
      try {
        const [f, recData, skuData] = await Promise.all([
          api.getImbalances(),
          api.getRecommendations(),
          api.getSkus(),
        ]);
        setFlags(f);
        setRecs(recData.recommendations || []);
        setSkus(skuData);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  const skuNameMap = useMemo(() => new Map(skus.map((s) => [s.sku_id, s.name])), [skus]);
  const skuLabel = (id: string) => {
    const name = skuNameMap.get(id);
    return name ? `${name} (${id})` : id;
  };

  // Build a set of SKU IDs that have at least one recommendation
  const recSkuIds = new Set(recs.map((r) => r.sku_id));

  // Filter by type AND by SKU from URL
  const filteredBySku = skuFilter ? flags.filter((f) => f.sku_id === skuFilter) : flags;
  const filtered = filter === "all" ? filteredBySku : filteredBySku.filter((f) => f.flag_type === filter);
  const counts = {
    shortage: filteredBySku.filter((f) => f.flag_type === "shortage").length,
    excess: filteredBySku.filter((f) => f.flag_type === "excess").length,
    ageing: filteredBySku.filter((f) => f.flag_type === "ageing").length,
    misleading_sales: filteredBySku.filter((f) => f.flag_type === "misleading_sales").length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-buddy-text">Inventory Imbalances</h1>
        <p className="text-sm text-buddy-muted mt-1">
          Flagged shortages, excess stock, ageing inventory, and misleading sales patterns
          {skuFilter && ` · Filtered by SKU: ${skuLabel(skuFilter)}`}
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFilter("all")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            filter === "all" ? "bg-tradeling-600 text-white" : "bg-buddy-surface text-buddy-muted"
          }`}
        >
          All ({filteredBySku.length})
        </button>
        {Object.entries(counts).map(([type, count]) => (
          <button
            key={type}
            onClick={() => setFilter(type)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
              filter === type ? "bg-tradeling-600 text-white" : "bg-buddy-surface text-buddy-muted"
            }`}
          >
            {type.replace("_", " ")} ({count})
          </button>
        ))}
      </div>

      {/* Imbalance cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((flag, i) => {
          const Icon = flagIcons[flag.flag_type] || AlertCircle;
          return (
            <motion.div
              key={`${flag.sku_id}-${flag.warehouse_id}-${flag.flag_type}`}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card hover>
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    flag.severity === "critical" ? "bg-red-950/40" :
                    flag.severity === "warning" ? "bg-yellow-950/40" :
                    "bg-blue-950/40"
                  }`}>
                    <Icon className={`w-5 h-5 ${
                      flag.severity === "critical" ? "text-red-400" :
                      flag.severity === "warning" ? "text-yellow-400" :
                      "text-blue-400"
                    }`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm font-medium text-buddy-text">{skuLabel(flag.sku_id)}</span>
                      <Badge variant="neutral">{flag.warehouse_id}</Badge>
                      <Badge variant={severityColors[flag.severity]}>{flag.flag_type.replace("_", " ")}</Badge>
                    </div>
                    <p className="text-xs text-buddy-text">{flag.description}</p>
                  </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs mb-3">
                  <div className="p-2 rounded-lg bg-buddy-bg">
                    <p className="text-buddy-muted">Current</p>
                    <p className="font-medium text-buddy-text">{formatNumber(flag.current_qty)}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-buddy-bg">
                    <p className="text-buddy-muted">Forecast</p>
                    <p className="font-medium text-tradeling-400">{formatNumber(flag.forecast_qty)}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-buddy-bg">
                    <p className="text-buddy-muted">Safety</p>
                    <p className="font-medium text-buddy-text">{formatNumber(flag.safety_stock)}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-buddy-bg">
                    <p className="text-buddy-muted">Gap</p>
                    <p className={`font-medium ${
                      flag.shortfall_or_excess < 0 ? "text-red-400" :
                      flag.shortfall_or_excess > 0 ? "text-yellow-400" :
                      "text-buddy-text"
                    }`}>
                      {flag.shortfall_or_excess > 0 ? "+" : ""}{formatNumber(flag.shortfall_or_excess)}
                    </p>
                  </div>
                </div>

                {/* Recommended action — clickable to jump to Actions page (only if recs exist for this SKU) */}
                {flag.recommended_action && recSkuIds.has(flag.sku_id) && (
                  <Link
                    href={`/actions?sku=${flag.sku_id}`}
                    className="block p-3 rounded-lg bg-tradeling-950/30 border border-tradeling-900/50 hover:bg-tradeling-900/30 hover:border-tradeling-800 transition-colors group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-tradeling-400 font-medium mb-1">Recommended Action</p>
                        <p className="text-xs text-buddy-text">{flag.recommended_action}</p>
                      </div>
                      <div className="flex items-center gap-1 text-tradeling-400 shrink-0 ml-2">
                        <span className="text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                          View Actions
                        </span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </Link>
                )}

                {/* If no transfer recommendation exists, show a static note */}
                {flag.recommended_action && !recSkuIds.has(flag.sku_id) && (
                  <div className="block p-3 rounded-lg bg-buddy-bg border border-buddy-border">
                    <p className="text-xs text-buddy-muted font-medium mb-1">Recommended Action</p>
                    <p className="text-xs text-buddy-muted">{flag.recommended_action}</p>
                    <p className="text-[10px] text-buddy-muted/60 mt-1">
                      No economical transfer found for this SKU
                    </p>
                  </div>
                )}
              </Card>
            </motion.div>
          );
        })}
        {filtered.length === 0 && !loading && (
          <Card className="col-span-2">
            <p className="text-center text-buddy-muted py-8">No imbalances detected for this filter</p>
          </Card>
        )}
      </div>
    </div>
  );
}
