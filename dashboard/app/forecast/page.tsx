"use client";

import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { TrendingUp, Activity } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { BacktestCard } from "@/components/BacktestCard";
import type { ForecastResult, SKU } from "@/lib/types";

const confidenceColors: Record<string, "success" | "warning" | "danger"> = {
  high: "success",
  medium: "warning",
  low: "danger",
};

export default function ForecastPage() {
  const [forecasts, setForecasts] = useState<ForecastResult[]>([]);
  const [skus, setSkus] = useState<SKU[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [f, skuData] = await Promise.all([
          api.getForecasts(),
          api.getSkus(),
        ]);
        setForecasts(f);
        setSkus(skuData);
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
          P10–P90 ranges, stockout-corrected history and data-quality notes — estimates, not certainties
        </p>
      </div>

      <BacktestCard />

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
