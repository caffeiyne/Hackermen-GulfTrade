"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, AlertTriangle, DollarSign, Package, Zap } from "lucide-react";
import { Card, CardHeader, CardTitle, CardValue } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { AgentPanel } from "@/components/AgentPanel";
import { UAEMap } from "@/components/UAEMap";
import { WarehouseDetailPanel } from "@/components/WarehouseDetailPanel";
import { api } from "@/lib/api";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type { InventoryOverview, ImbalanceFlag, Recommendation } from "@/lib/types";

export default function OverviewPage() {
  const [overview, setOverview] = useState<InventoryOverview[]>([]);
  const [imbalances, setImbalances] = useState<ImbalanceFlag[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWarehouse, setSelectedWarehouse] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [ov, imb, recs] = await Promise.all([
          api.getInventoryOverview(),
          api.getImbalances(),
          api.getRecommendations(),
        ]);
        setOverview(ov);
        setImbalances(imb);
        setRecommendations(recs.recommendations || []);
      } catch (err) {
        console.error("Failed to load overview:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  const totalStock = overview.reduce((sum, w) => sum + (w.total_stock || 0), 0);
  const totalAgeing = overview.reduce((sum, w) => sum + (w.ageing_units || 0), 0);
  const criticalCount = imbalances.filter((i) => i.severity === "critical").length;
  const warningCount = imbalances.filter((i) => i.severity === "warning").length;
  const feasibleRecs = recommendations.filter((r) => r.is_feasible);
  const totalBenefit = feasibleRecs.reduce((sum, r) => sum + (r.net_benefit || 0), 0);

  const kpis = [
    {
      label: "Total Stock Units",
      value: formatNumber(totalStock),
      icon: Package,
      trend: "across 3 warehouses",
      color: "text-tradeling-400",
    },
    {
      label: "Critical Imbalances",
      value: String(criticalCount),
      icon: AlertTriangle,
      trend: `${warningCount} warnings`,
      color: "text-red-400",
    },
    {
      label: "Ageing Stock",
      value: formatNumber(totalAgeing),
      icon: TrendingDown,
      trend: "units 61+ days",
      color: "text-yellow-400",
    },
    {
      label: "Net Benefit Potential",
      value: formatCurrency(totalBenefit),
      icon: DollarSign,
      trend: `${feasibleRecs.length} feasible actions`,
      color: "text-green-400",
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold gradient-text">GulfTrade Intelligence</h1>
          <p className="text-sm text-buddy-muted mt-1">AI-based demand planning & stock distribution</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 rounded-xl bg-buddy-surface border border-buddy-border shimmer" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-2xl font-bold gradient-text">GulfTrade Intelligence</h1>
        <p className="text-sm text-buddy-muted mt-1">
          AI-based demand planning & stock distribution for B2B inventory
        </p>
      </motion.div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label} delay={i * 0.1} hover>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{kpi.label}</CardTitle>
                  <Icon className={`w-4 h-4 ${kpi.color}`} />
                </div>
              </CardHeader>
              <CardValue className={kpi.color}>{kpi.value}</CardValue>
              <p className="text-xs text-buddy-muted mt-2">{kpi.trend}</p>
            </Card>
          );
        })}
      </div>

      {/* UAE Map + Warehouse Detail Panel */}
      <UAEMap
        selectedWarehouse={selectedWarehouse}
        onWarehouseSelect={(id) =>
          setSelectedWarehouse(id === selectedWarehouse ? null : id)
        }
      />
      <WarehouseDetailPanel
        warehouseId={selectedWarehouse}
        warehouseName={
          overview.find((w) => w.warehouse_id === selectedWarehouse)?.warehouse_name
        }
        onClose={() => setSelectedWarehouse(null)}
      />

      {/* AI Agent Reasoning Panel */}
      <AgentPanel />

      {/* Warehouse Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {overview.map((wh, i) => (
          <Card key={wh.warehouse_id} delay={i * 0.1}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-buddy-text">{wh.warehouse_name}</h3>
              <Badge variant="neutral">{wh.warehouse_id}</Badge>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-buddy-muted">Available</span>
                <span className="font-medium text-tradeling-400">{formatNumber(wh.total_available)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-buddy-muted">Reserved</span>
                <span className="font-medium text-buddy-text">{formatNumber(wh.total_reserved)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-buddy-muted">Inbound</span>
                <span className="font-medium text-blue-400">{formatNumber(wh.total_inbound)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-buddy-muted">Ageing (61+ days)</span>
                <span className={`font-medium ${wh.ageing_units > 100 ? "text-yellow-400" : "text-buddy-text"}`}>
                  {formatNumber(wh.ageing_units)}
                </span>
              </div>
              <div className="pt-2 border-t border-buddy-border">
                <div className="flex justify-between text-xs">
                  <span className="text-buddy-muted">SKUs tracked</span>
                  <span className="text-buddy-muted">{wh.sku_count}</span>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Top Imbalances + Recommendations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Imbalances */}
        <Card delay={0.2}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-buddy-text">Top Imbalances</h3>
            <Zap className="w-4 h-4 text-buddy-muted" />
          </div>
          <div className="space-y-3">
            {imbalances.slice(0, 5).map((flag, i) => (
              <motion.div
                key={`${flag.sku_id}-${flag.warehouse_id}-${flag.flag_type}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.05 }}
                className="flex items-center justify-between p-3 rounded-lg bg-buddy-bg border border-buddy-border"
              >
                <div className="flex items-center gap-3">
                  <Badge
                    variant={
                      flag.severity === "critical" ? "danger" :
                      flag.severity === "warning" ? "warning" : "info"
                    }
                  >
                    {flag.flag_type}
                  </Badge>
                  <div>
                    <p className="text-sm font-medium text-buddy-text">{flag.sku_id}</p>
                    <p className="text-xs text-buddy-muted">{flag.warehouse_id}</p>
                  </div>
                </div>
                <span className="text-xs text-buddy-muted">
                  {flag.shortfall_or_excess > 0 ? "+" : ""}{formatNumber(flag.shortfall_or_excess)}
                </span>
              </motion.div>
            ))}
            {imbalances.length === 0 && (
              <p className="text-sm text-buddy-muted text-center py-4">No imbalances detected</p>
            )}
          </div>
        </Card>

        {/* Recommendations */}
        <Card delay={0.3}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-buddy-text">Top Recommendations</h3>
            <TrendingUp className="w-4 h-4 text-buddy-muted" />
          </div>
          <div className="space-y-3">
            {recommendations.slice(0, 5).map((rec, i) => (
              <motion.div
                key={rec.recommendation_id}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.05 }}
                className="flex items-center justify-between p-3 rounded-lg bg-buddy-bg border border-buddy-border"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-buddy-muted">#{rec.rank}</span>
                  <div>
                    <p className="text-sm font-medium text-buddy-text">
                      {rec.from_warehouse} → {rec.to_warehouse}
                    </p>
                    <p className="text-xs text-buddy-muted">{rec.sku_id} · {rec.quantity} units</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-medium ${rec.is_feasible ? "text-green-400" : "text-red-400"}`}>
                    {rec.net_benefit >= 0 ? "+" : ""}{formatCurrency(rec.net_benefit)}
                  </p>
                  <Badge variant={rec.is_feasible ? "success" : "danger"}>
                    {rec.is_feasible ? "Feasible" : "Rejected"}
                  </Badge>
                </div>
              </motion.div>
            ))}
            {recommendations.length === 0 && (
              <p className="text-sm text-buddy-muted text-center py-4">No recommendations yet</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
