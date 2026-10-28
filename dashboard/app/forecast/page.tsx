"use client";

import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { TrendingUp, Activity, Target } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import type { ForecastResult, SKU } from "@/lib/types";

const confidenceColors: Record<string, "success" | "warning" | "danger"> = {
  high: "success",
  medium: "warning",
  low: "danger",
};

export default function ForecastPage() {
  const [forecasts, setForecasts] = useState<ForecastResult[]>([]);
  const [skus, setSkus] = useState<SKU[]>([]);
  const [backtest, setBacktest] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [f, skuData, bt] = await Promise.all([
          api.getForecasts(),
          api.getSkus(),
          api.getBacktest(),
        ]);
        setForecasts(f);
        setSkus(skuData);
        setBacktest(bt);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  const skuNameMap = useMemo(() => new Map(skus.map((s) => [s.sku_id, s.name])), [skus]);
  const skuLabel = (id: string) => {
    const name = skuNameMap.get(id);
    return name ? `${name} (${id})` : id;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-buddy-text">30-Day Demand Forecast</h1>
        <p className="text-sm text-buddy-muted mt-1">
          AI-generated forecasts with confidence bands and data quality notes
        </p>
      </div>

      {/* Forecast accuracy (backtest) */}
      {backtest?.aggregate && (
        <Card delay={0.02}>
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-tradeling-400" />
            <h3 className="font-medium text-buddy-text">Forecast Accuracy (Backtest)</h3>
            <span className="text-xs text-buddy-muted">— trained on first 60 days, tested against days 61-90</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-buddy-bg border border-buddy-border">
              <p className="text-xs text-buddy-muted mb-1">Avg Accuracy</p>
              <p className="text-2xl font-bold text-tradeling-400">
                {backtest.aggregate.avg_accuracy !== null ? `${backtest.aggregate.avg_accuracy}%` : "N/A"}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-buddy-bg border border-buddy-border">
              <p className="text-xs text-buddy-muted mb-1">Avg MAPE</p>
              <p className="text-2xl font-bold text-buddy-text">
                {backtest.aggregate.avg_mape !== null ? `${backtest.aggregate.avg_mape}%` : "N/A"}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-buddy-bg border border-buddy-border">
              <p className="text-xs text-buddy-muted mb-1">Combos Tested</p>
              <p className="text-2xl font-bold text-buddy-text">{backtest.aggregate.combos_tested}</p>
            </div>
            <div className="p-3 rounded-lg bg-buddy-bg border border-buddy-border">
              <p className="text-xs text-buddy-muted mb-1">Method</p>
              <p className="text-sm font-medium text-buddy-text">WMA + trend</p>
              <p className="text-[10px] text-buddy-muted mt-0.5">Train: 60d → Test: 30d</p>
            </div>
          </div>
          {/* Per-combo breakdown */}
          {backtest.results?.filter((r: any) => r.mape !== null).length > 0 && (
            <div className="mt-3 space-y-1">
              <p className="text-xs text-buddy-muted mb-1">Per SKU/Warehouse:</p>
              <div className="flex flex-wrap gap-2">
                {backtest.results
                  .filter((r: any) => r.mape !== null)
                  .sort((a: any, b: any) => a.mape - b.mape)
                  .map((r: any, i: number) => (
                    <span
                      key={i}
                      className={`text-xs px-2 py-1 rounded border ${
                        r.accuracy >= 85
                          ? "bg-green-950/30 border-green-900/50 text-green-400"
                          : r.accuracy >= 70
                          ? "bg-yellow-950/30 border-yellow-900/50 text-yellow-400"
                          : "bg-red-950/30 border-red-900/50 text-red-400"
                      }`}
                    >
                      {r.sku_id} @ {r.warehouse_id}: {r.accuracy}%
                    </span>
                  ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-40 rounded-xl bg-buddy-surface border border-buddy-border shimmer" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {forecasts.map((f, i) => (
            <motion.div
              key={`${f.sku_id}-${f.warehouse_id}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card hover>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium text-buddy-text">{skuLabel(f.sku_id)}</span>
                      <Badge variant="neutral">{f.warehouse_id}</Badge>
                    </div>
                    <p className="text-xs text-buddy-muted mt-1">{f.method}</p>
                  </div>
                  <Badge variant={confidenceColors[f.confidence_level]}>
                    {f.confidence_level} confidence
                  </Badge>
                </div>

                {/* Forecast value */}
                <div className="flex items-baseline gap-3 mb-4">
                  <span className="text-3xl font-bold text-tradeling-400">
                    {formatNumber(f.forecast_qty_30d)}
                  </span>
                  <span className="text-sm text-buddy-muted">units / 30 days</span>
                </div>

                {/* Confidence band */}
                <div className="mb-4">
                  <div className="flex justify-between text-xs text-buddy-muted mb-1">
                    <span>P10: {formatNumber(f.confidence_low)}</span>
                    <span>P90: {formatNumber(f.confidence_high)}</span>
                  </div>
                  <div className="relative h-2 rounded-full bg-buddy-bg overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: "100%" }}
                      transition={{ duration: 0.8 }}
                      className="absolute h-full rounded-full bg-gradient-to-r from-tradeling-700 via-tradeling-500 to-tradeling-300 opacity-40"
                    />
                    <div
                      className="absolute h-full bg-tradeling-400 rounded-full"
                      style={{
                        left: `${(f.confidence_low / (f.confidence_high || 1)) * 100}%`,
                        width: `${((f.confidence_high - f.confidence_low) / (f.confidence_high || 1)) * 100}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Assumptions */}
                {f.assumptions.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-buddy-muted mb-1">Assumptions:</p>
                    <ul className="text-xs text-buddy-text space-y-0.5">
                      {f.assumptions.map((a, j) => (
                        <li key={j} className="flex items-start gap-1.5">
                          <Activity className="w-3 h-3 mt-0.5 text-buddy-muted shrink-0" />
                          <span>{a}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Data quality notes */}
                {f.data_quality_notes.length > 0 && (
                  <div className="p-2 rounded-lg bg-yellow-950/30 border border-yellow-900/50">
                    <p className="text-xs text-yellow-400 mb-1">Data Quality Notes:</p>
                    <ul className="text-xs text-yellow-300/80 space-y-0.5">
                      {f.data_quality_notes.map((n, j) => (
                        <li key={j}>• {n}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
