"use client";

/** Forecast accuracy vs the case-study baseline on a 30-day holdout (GET /api/recommendations/backtest). */

import { useEffect, useState } from "react";
import { Target } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api";

export function BacktestCard() {
  const [bt, setBt] = useState<any>(null);

  useEffect(() => {
    api.getBacktest().then(setBt).catch(() => setBt(null));
  }, []);

  if (!bt || !bt.model) return null;
  const distorted = bt.stockout_distorted_series;

  return (
    <Card>
      <div className="flex items-center gap-2 mb-1">
        <Target className="w-4 h-4 text-tradeling-400" />
        <h3 className="font-medium text-buddy-text">Forecast accuracy (backtest)</h3>
      </div>
      <p className="text-xs text-buddy-muted mb-4">
        Trained on {bt.train_window}, scored on {bt.holdout_window} across {bt.series_scored} SKU × location series.
        Baseline = recent 30-day average (the case-study baseline).
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3 rounded-lg bg-buddy-bg border border-buddy-border">
          <p className="text-xs text-buddy-muted">Error (WAPE) — agent</p>
          <p className="text-lg font-bold text-tradeling-400">{bt.model.wape_pct}%</p>
        </div>
        <div className="p-3 rounded-lg bg-buddy-bg border border-buddy-border">
          <p className="text-xs text-buddy-muted">Error (WAPE) — baseline</p>
          <p className="text-lg font-bold text-buddy-text">{bt.baseline_recent_average.wape_pct}%</p>
        </div>
        <div className="p-3 rounded-lg bg-buddy-bg border border-buddy-border">
          <p className="text-xs text-buddy-muted">P10–P90 range held actual</p>
          <p className="text-lg font-bold text-buddy-text">
            {bt.model.p10_p90_coverage_pct}% <span className="text-xs font-normal text-buddy-muted">target 80%</span>
          </p>
        </div>
        {distorted && distorted.model && (
          <div className="p-3 rounded-lg bg-buddy-bg border border-buddy-border">
            <p className="text-xs text-buddy-muted">Stockout-hit series ({distorted.series.length})</p>
            <p className="text-sm text-buddy-text">
              <span className="font-bold text-tradeling-400">{distorted.model.wape_pct}%</span> vs{" "}
              <span className="font-bold text-red-400">{distorted.baseline.wape_pct}%</span> error
            </p>
          </div>
        )}
      </div>
      {Array.isArray(bt.per_series) && bt.per_series.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-buddy-muted mb-1">Per SKU / location (forecast vs actual, 30 days):</p>
          <div className="flex flex-wrap gap-2">
            {[...bt.per_series]
              .map((r: any) => ({ ...r, err: r.actual > 0 ? Math.abs(r.model - r.actual) / r.actual : 0 }))
              .sort((a: any, b: any) => a.err - b.err)
              .map((r: any) => (
                <span
                  key={`${r.sku_id}-${r.warehouse_id}`}
                  title={`forecast ${r.model} · baseline ${r.baseline} · actual ${r.actual}`}
                  className={`text-xs px-2 py-1 rounded border ${
                    r.err <= 0.15
                      ? "bg-green-950/30 border-green-900/50 text-green-400"
                      : r.err <= 0.3
                      ? "bg-yellow-950/30 border-yellow-900/50 text-yellow-400"
                      : "bg-red-950/30 border-red-900/50 text-red-400"
                  }`}
                >
                  {r.sku_id} @ {r.warehouse_id}: {Math.round(100 * (1 - r.err))}%
                </span>
              ))}
          </div>
        </div>
      )}
    </Card>
  );
}
