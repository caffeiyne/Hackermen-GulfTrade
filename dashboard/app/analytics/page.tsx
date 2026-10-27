"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, RadialBarChart, RadialBar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ScatterChart, Scatter, ZAxis,
} from "recharts";
import {
  TrendingUp, Package, DollarSign, AlertTriangle,
  BarChart3, Activity, Warehouse as WarehouseIcon,
  Info, X,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { api } from "@/lib/api";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type {
  InventoryOverview, SalesSummary, StockLevel, StockAge,
  ImbalanceFlag, Recommendation, ForecastResult, SKU,
} from "@/lib/types";

// ---- Chart colors (match theme) ----
const COLORS = {
  tradeling: "#22bd7a",
  blue: "#3b82f6",
  purple: "#a855f7",
  yellow: "#eab308",
  red: "#ef4444",
  cyan: "#06b6d4",
  orange: "#f97316",
  pink: "#ec4899",
};

const WAREHOUSE_COLORS: Record<string, string> = {
  DXB: COLORS.tradeling,
  AUH: COLORS.blue,
  SHJ: COLORS.purple,
};

const PRODUCT_TYPE_COLORS: Record<string, string> = {
  charger: COLORS.tradeling,
  cable: COLORS.blue,
  power_bank: COLORS.purple,
  earbuds: COLORS.yellow,
  mouse: COLORS.cyan,
};

const TOOLTIP_STYLE = {
  backgroundColor: "#11151c",
  border: "1px solid #1e242d",
  borderRadius: "8px",
  fontSize: "12px",
  color: "#e4e7eb",
  labelStyle: { color: "#e4e7eb", fontWeight: 600, marginBottom: "4px" },
  itemStyle: { color: "#e4e7eb" },
};

// Custom tooltip that guarantees light text color on all charts (including pie/scatter)
function DarkTooltip({ active, payload, label, formatter }: any) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      style={{
        backgroundColor: "#11151c",
        border: "1px solid #1e242d",
        borderRadius: "8px",
        padding: "8px 12px",
        fontSize: "12px",
        color: "#e4e7eb",
      }}
    >
      {label && (
        <p style={{ color: "#e4e7eb", fontWeight: 600, marginBottom: "4px" }}>
          {label}
        </p>
      )}
      {payload.map((entry: any, i: number) => {
        const formatted = formatter ? formatter(entry.value, entry.name) : [entry.value, entry.name];
        const displayValue = Array.isArray(formatted) ? formatted[0] : formatted;
        const displayName = Array.isArray(formatted) ? formatted[1] : entry.name;
        return (
          <p key={i} style={{ color: "#e4e7eb", margin: "2px 0" }}>
            <span
              style={{
                display: "inline-block",
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                backgroundColor: entry.color || entry.fill || COLORS.tradeling,
                marginRight: "6px",
              }}
            />
            {displayName}: {displayValue}
          </p>
        );
      })}
    </div>
  );
}

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<InventoryOverview[]>([]);
  const [salesSummary, setSalesSummary] = useState<SalesSummary[]>([]);
  const [stockLevels, setStockLevels] = useState<StockLevel[]>([]);
  const [stockAge, setStockAge] = useState<StockAge[]>([]);
  const [imbalances, setImbalances] = useState<ImbalanceFlag[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [forecasts, setForecasts] = useState<ForecastResult[]>([]);
  const [skus, setSkus] = useState<SKU[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSku, setSelectedSku] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [ov, sales, stock, age, imb, recs, fc, skuList] = await Promise.all([
          api.getInventoryOverview(),
          api.getSalesSummary(),
          api.getStockLevels(),
          api.getStockAge(),
          api.getImbalances(),
          api.getRecommendations(),
          api.getForecasts(),
          api.getSkus(),
        ]);
        setOverview(ov);
        setSalesSummary(sales);
        setStockLevels(stock);
        setStockAge(age);
        setImbalances(imb);
        setRecommendations(recs.recommendations || []);
        setForecasts(fc);
        setSkus(skuList);
      } catch (err) {
        console.error("Failed to load analytics data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, []);

  // ---- Derived chart data ----

  // 1. Warehouse stock comparison (stacked bar)
  const warehouseStockData = useMemo(() => {
    const whIds = [...new Set(stockLevels.map((s) => s.warehouse_id))].sort();
    return whIds.map((whId) => {
      const whStock = stockLevels.filter((s) => s.warehouse_id === whId);
      return {
        warehouse: whId,
        Available: whStock.reduce((sum, s) => sum + s.available_qty, 0),
        Reserved: whStock.reduce((sum, s) => sum + s.reserved_qty, 0),
        Safety: whStock.reduce((sum, s) => sum + s.safety_stock, 0),
        Inbound: whStock.reduce((sum, s) => sum + s.inbound_qty, 0),
      };
    });
  }, [stockLevels]);

  // 2. Sales by warehouse (bar)
  const salesByWarehouse = useMemo(() => {
    const whIds = [...new Set(salesSummary.map((s) => s.warehouse_id))].sort();
    return whIds.map((whId) => {
      const whSales = salesSummary.filter((s) => s.warehouse_id === whId);
      return {
        warehouse: whId,
        units: whSales.reduce((sum, s) => sum + s.total_qty, 0),
        revenue: whSales.reduce((sum, s) => sum + Number(s.total_value), 0),
      };
    });
  }, [salesSummary]);

  // 3. Top 10 SKUs by sales volume (horizontal bar) — enriched for click detail
  const topSkusBySales = useMemo(() => {
    const skuNameMap = new Map(skus.map((s) => [s.sku_id, s.name]));
    const skuTotals = new Map<string, number>();
    salesSummary.forEach((s) => {
      skuTotals.set(s.sku_id, (skuTotals.get(s.sku_id) || 0) + s.total_qty);
    });
    return Array.from(skuTotals.entries())
      .map(([sku_id, qty]) => ({
        sku_id,
        name: skuNameMap.get(sku_id) || sku_id,
        qty,
      }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);
  }, [salesSummary, skus]);

  // 3b. Full ranking of ALL SKUs by total units sold (for detail panel)
  const fullSkuRanking = useMemo(() => {
    const skuTotals = new Map<string, number>();
    salesSummary.forEach((s) => {
      skuTotals.set(s.sku_id, (skuTotals.get(s.sku_id) || 0) + s.total_qty);
    });
    return Array.from(skuTotals.entries())
      .map(([sku_id, qty]) => ({ sku_id, qty }))
      .sort((a, b) => b.qty - a.qty);
  }, [salesSummary]);

  // 3c. Build a detailed breakdown for the selected SKU
  const selectedSkuDetail = useMemo(() => {
    if (!selectedSku) return null;
    const skuInfo = skus.find((s) => s.sku_id === selectedSku);
    if (!skuInfo) return null;

    const whSales = salesSummary
      .filter((s) => s.sku_id === selectedSku)
      .map((s) => ({
        warehouse_id: s.warehouse_id,
        units: s.total_qty,
        revenue: Number(s.total_value),
        avgDaily: Math.round(s.avg_daily_qty * 10) / 10,
        txns: s.transaction_count,
        hasStockout: s.has_stockout_periods,
      }))
      .sort((a, b) => b.units - a.units);

    const totalUnits = whSales.reduce((sum, w) => sum + w.units, 0);
    const totalRevenue = whSales.reduce((sum, w) => sum + w.revenue, 0);
    const totalTxns = whSales.reduce((sum, w) => sum + w.txns, 0);
    const margin = skuInfo.unit_price - skuInfo.unit_cost;
    const marginPct = skuInfo.unit_cost > 0 ? (margin / skuInfo.unit_price) * 100 : 0;
    const rank = fullSkuRanking.findIndex((r) => r.sku_id === selectedSku) + 1;
    const totalStock = stockLevels
      .filter((s) => s.sku_id === selectedSku)
      .reduce((sum, s) => sum + s.available_qty, 0);
    const forecastTotal = forecasts
      .filter((f) => f.sku_id === selectedSku)
      .reduce((sum, f) => sum + f.forecast_qty_30d, 0);
    const bestWarehouse = whSales[0] || null;

    return {
      skuInfo,
      rank,
      totalUnits,
      totalRevenue,
      totalTxns,
      margin,
      marginPct,
      totalStock,
      forecastTotal,
      bestWarehouse,
      whSales,
    };
  }, [selectedSku, skus, salesSummary, stockLevels, forecasts, fullSkuRanking]);

  const handleBarClick = useCallback((data: any) => {
    if (data && data.sku_id) {
      setSelectedSku(data.sku_id);
    }
  }, []);

  // 4. Imbalances breakdown (pie)
  const imbalancesBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    imbalances.forEach((f) => {
      counts[f.flag_type] = (counts[f.flag_type] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [imbalances]);

  // 5. Stock age distribution (stacked area)
  const stockAgeData = useMemo(() => {
    const buckets = ["0-30", "31-60", "61-90", "90+"];
    const whIds = [...new Set(stockAge.map((s) => s.warehouse_id))].sort();
    return buckets.map((bucket) => {
      const row: Record<string, number | string> = { bucket };
      whIds.forEach((whId) => {
        row[whId] = stockAge
          .filter((s) => s.age_bucket === bucket && s.warehouse_id === whId)
          .reduce((sum, s) => sum + s.qty, 0);
      });
      return row;
    });
  }, [stockAge]);

  // 6. Forecast vs current stock (scatter)
  const forecastVsStock = useMemo(() => {
    return forecasts.map((f) => {
      const stock = stockLevels.find(
        (s) => s.sku_id === f.sku_id && s.warehouse_id === f.warehouse_id
      );
      return {
        sku_id: f.sku_id,
        warehouse_id: f.warehouse_id,
        current: stock?.available_qty || 0,
        forecast: f.forecast_qty_30d,
        confidence: f.confidence_level,
        fill: WAREHOUSE_COLORS[f.warehouse_id] || COLORS.tradeling,
      };
    });
  }, [forecasts, stockLevels]);

  // 7. Revenue by product type (pie)
  const revenueByProductType = useMemo(() => {
    const skuTypeMap = new Map(skus.map((s) => [s.sku_id, s.product_type]));
    const typeRevenue: Record<string, number> = {};
    salesSummary.forEach((s) => {
      const pType = skuTypeMap.get(s.sku_id) || "other";
      typeRevenue[pType] = (typeRevenue[pType] || 0) + Number(s.total_value);
    });
    return Object.entries(typeRevenue).map(([name, value]) => ({ name, value }));
  }, [salesSummary, skus]);

  // 8. Recommendation net benefit by rank (bar)
  const recBenefitData = useMemo(() => {
    return recommendations
      .slice(0, 12)
      .map((r) => ({
        rank: `#${r.rank}`,
        sku: r.sku_id.split("-").pop(),
        route: `${r.from_warehouse}→${r.to_warehouse}`,
        netBenefit: Math.round(r.net_benefit),
        feasible: r.is_feasible,
      }));
  }, [recommendations]);

  // 9. Warehouse capacity utilization (radial)
  const utilizationData = useMemo(() => {
    return overview.map((wh) => {
      // approximate capacity from stock levels (sum all)
      const totalStock = wh.total_available + wh.total_reserved;
      // Use a rough capacity estimate if not available
      const capacity = wh.warehouse_id === "DXB" ? 20000 :
                       wh.warehouse_id === "AUH" ? 15000 : 12000;
      const pct = Math.round((totalStock / capacity) * 100);
      return {
        name: wh.warehouse_id,
        utilization: pct,
        fill: WAREHOUSE_COLORS[wh.warehouse_id] || COLORS.tradeling,
      };
    });
  }, [overview]);

  // 10. Avg daily sales trend per warehouse (from summary)
  const avgDailyByWarehouse = useMemo(() => {
    const whIds = [...new Set(salesSummary.map((s) => s.warehouse_id))].sort();
    return whIds.map((whId) => {
      const whSales = salesSummary.filter((s) => s.warehouse_id === whId);
      const avg = whSales.reduce((sum, s) => sum + s.avg_daily_qty, 0) / (whSales.length || 1);
      return {
        warehouse: whId,
        avgDaily: Math.round(avg * 10) / 10,
      };
    });
  }, [salesSummary]);

  // ---- KPI calculations ----
  const totalRevenue = salesSummary.reduce((sum, s) => sum + Number(s.total_value), 0);
  const totalUnitsSold = salesSummary.reduce((sum, s) => sum + s.total_qty, 0);
  const totalStock = overview.reduce((sum, w) => sum + (w.total_stock || 0), 0);
  const totalAgeing = overview.reduce((sum, w) => sum + (w.ageing_units || 0), 0);

  const kpis = [
    { label: "Total Revenue", value: formatCurrency(totalRevenue), icon: DollarSign, color: "text-tradeling-400" },
    { label: "Units Sold (90d)", value: formatNumber(totalUnitsSold), icon: TrendingUp, color: "text-blue-400" },
    { label: "Total Stock", value: formatNumber(totalStock), icon: Package, color: "text-purple-400" },
    { label: "Ageing Units", value: formatNumber(totalAgeing), icon: AlertTriangle, color: "text-yellow-400" },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-buddy-text">Analytics</h1>
          <p className="text-sm text-buddy-muted mt-1">Statistical analysis & visual insights</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-buddy-surface border border-buddy-border shimmer" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-72 rounded-xl bg-buddy-surface border border-buddy-border shimmer" />
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
        <div className="flex items-center gap-3">
          <BarChart3 className="w-7 h-7 text-tradeling-400" />
          <div>
            <h1 className="text-2xl font-bold text-buddy-text">Analytics</h1>
            <p className="text-sm text-buddy-muted mt-0.5">
              Statistical analysis & visual insights across sales, inventory, and forecasts
            </p>
          </div>
        </div>
      </motion.div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label} delay={i * 0.08}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-buddy-muted">{kpi.label}</span>
                <Icon className={`w-4 h-4 ${kpi.color}`} />
              </div>
              <p className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
            </Card>
          );
        })}
      </div>

      {/* Row 1: Warehouse Stock Breakdown + Sales by Warehouse */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Warehouse Stock Composition */}
        <Card delay={0.1}>
          <div className="flex items-center gap-2 mb-4">
            <WarehouseIcon className="w-4 h-4 text-tradeling-400" />
            <h3 className="font-medium text-buddy-text">Stock Composition by Warehouse</h3>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={warehouseStockData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e242d" />
              <XAxis dataKey="warehouse" stroke="#6b7280" fontSize={12} />
              <YAxis stroke="#6b7280" fontSize={12} />
              <Tooltip content={<DarkTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Available" stackId="a" fill={COLORS.tradeling} />
              <Bar dataKey="Reserved" stackId="a" fill={COLORS.orange} />
              <Bar dataKey="Inbound" stackId="a" fill={COLORS.blue} />
              <Bar dataKey="Safety" stackId="a" fill={COLORS.yellow} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Sales by Warehouse */}
        <Card delay={0.15}>
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="w-4 h-4 text-blue-400" />
            <h3 className="font-medium text-buddy-text">Sales Volume & Revenue by Warehouse</h3>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={salesByWarehouse}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e242d" />
              <XAxis dataKey="warehouse" stroke="#6b7280" fontSize={12} />
              <YAxis yAxisId="left" stroke="#6b7280" fontSize={12} />
              <YAxis yAxisId="right" orientation="right" stroke="#6b7280" fontSize={12} />
              <Tooltip content={<DarkTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="left" dataKey="units" name="Units Sold" fill={COLORS.tradeling} radius={[4, 4, 0, 0]} />
              <Bar yAxisId="right" dataKey="revenue" name="Revenue (AED)" fill={COLORS.blue} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Row 2: Top SKUs by Sales + Imbalance Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Top 10 SKUs by Sales Volume */}
        <Card delay={0.2} className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-tradeling-400" />
              <h3 className="font-medium text-buddy-text">Top 10 SKUs by Sales Volume</h3>
            </div>
            <span className="text-xs text-buddy-muted flex items-center gap-1">
              <Info className="w-3 h-3" /> Click a bar for SKU details
            </span>
          </div>
          <ResponsiveContainer width="100%" height={380}>
            <BarChart data={topSkusBySales} layout="vertical" margin={{ left: 20, right: 40, top: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e242d" horizontal={false} />
              <XAxis type="number" stroke="#6b7280" fontSize={12} />
              <YAxis
                dataKey="name"
                type="category"
                stroke="#e4e7eb"
                fontSize={11}
                width={150}
                interval={0}
                tick={{ fill: "#e4e7eb" }}
              />
              <Tooltip content={<DarkTooltip />} cursor={{ fill: "#1e242d40" }} />
              <Bar
                dataKey="qty"
                name="Units Sold"
                fill={COLORS.tradeling}
                radius={[0, 4, 4, 0]}
                barSize={24}
                cursor="pointer"
                onClick={(data: any) => handleBarClick(data.payload)}
              >
                {topSkusBySales.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={selectedSku === entry.sku_id ? COLORS.blue : COLORS.tradeling}
                    cursor="pointer"
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Imbalance Distribution */}
        <Card delay={0.25}>
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-yellow-400" />
            <h3 className="font-medium text-buddy-text">Imbalance Distribution</h3>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={imbalancesBreakdown}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={90}
                paddingAngle={3}
                dataKey="value"
              >
                {imbalancesBreakdown.map((entry, i) => {
                  const colors = [COLORS.red, COLORS.yellow, COLORS.purple, COLORS.cyan];
                  return <Cell key={i} fill={colors[i % colors.length]} />;
                })}
              </Pie>
              <Tooltip content={<DarkTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* SKU Detail Panel — appears when a bar is clicked */}
      <AnimatePresence>
        {selectedSkuDetail && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Card>
              {/* Header */}
              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-tradeling-400 to-tradeling-600 flex items-center justify-center">
                    <Package className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-buddy-text">{selectedSkuDetail.skuInfo.name}</h3>
                      <Badge variant="neutral">{selectedSkuDetail.skuInfo.sku_id}</Badge>
                    </div>
                    <p className="text-xs text-buddy-muted mt-0.5 capitalize">
                      {selectedSkuDetail.skuInfo.product_type} ·{" "}
                      Rank #{selectedSkuDetail.rank} of {fullSkuRanking.length} SKUs by sales volume
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedSku(null)}
                  className="p-1.5 rounded-lg hover:bg-buddy-bg text-buddy-muted hover:text-buddy-text transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* KPI Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                <div className="p-3 rounded-lg bg-buddy-bg border border-buddy-border">
                  <p className="text-xs text-buddy-muted mb-1">Units Sold (90d)</p>
                  <p className="text-lg font-bold text-tradeling-400">{formatNumber(selectedSkuDetail.totalUnits)}</p>
                </div>
                <div className="p-3 rounded-lg bg-buddy-bg border border-buddy-border">
                  <p className="text-xs text-buddy-muted mb-1">Revenue</p>
                  <p className="text-lg font-bold text-blue-400">{formatCurrency(selectedSkuDetail.totalRevenue)}</p>
                </div>
                <div className="p-3 rounded-lg bg-buddy-bg border border-buddy-border">
                  <p className="text-xs text-buddy-muted mb-1">Current Stock</p>
                  <p className="text-lg font-bold text-purple-400">{formatNumber(selectedSkuDetail.totalStock)}</p>
                </div>
                <div className="p-3 rounded-lg bg-buddy-bg border border-buddy-border">
                  <p className="text-xs text-buddy-muted mb-1">Forecast (30d)</p>
                  <p className="text-lg font-bold text-cyan-400">{formatNumber(selectedSkuDetail.forecastTotal)}</p>
                </div>
              </div>

              {/* Product metrics + warehouse breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Product economics */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-buddy-text">Product Economics</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-buddy-muted">Unit Cost</span>
                      <span className="text-buddy-text">{formatCurrency(selectedSkuDetail.skuInfo.unit_cost)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-buddy-muted">Unit Price</span>
                      <span className="text-buddy-text">{formatCurrency(selectedSkuDetail.skuInfo.unit_price)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-buddy-muted">Margin / Unit</span>
                      <span className="text-tradeling-400 font-medium">{formatCurrency(selectedSkuDetail.margin)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-buddy-muted">Margin %</span>
                      <span className={`font-medium ${selectedSkuDetail.marginPct > 30 ? "text-green-400" : "text-yellow-400"}`}>
                        {selectedSkuDetail.marginPct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-buddy-muted">Shelf Life</span>
                      <span className="text-buddy-text">{selectedSkuDetail.skuInfo.shelf_life_days} days</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-buddy-muted">Supplier Lead</span>
                      <span className="text-buddy-text">{selectedSkuDetail.skuInfo.supplier_lead_days} days</span>
                    </div>
                  </div>
                </div>

                {/* Warehouse performance bar chart */}
                <div className="lg:col-span-2">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium text-buddy-text">Performance by Warehouse</h4>
                    {selectedSkuDetail.bestWarehouse && (
                      <span className="text-xs text-buddy-muted">
                        Best:{" "}
                        <span className="text-tradeling-400 font-medium">
                          {selectedSkuDetail.bestWarehouse.warehouse_id}
                        </span>{" "}
                        ({formatNumber(selectedSkuDetail.bestWarehouse.units)} units)
                      </span>
                    )}
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart
                      data={selectedSkuDetail.whSales}
                      margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e242d" />
                      <XAxis dataKey="warehouse_id" stroke="#6b7280" fontSize={11} />
                      <YAxis stroke="#6b7280" fontSize={11} />
                      <Tooltip content={<DarkTooltip />} cursor={{ fill: "#1e242d40" }} />
                      <Bar dataKey="units" name="Units Sold" radius={[4, 4, 0, 0]} barSize={40}>
                        {selectedSkuDetail.whSales.map((entry, i) => (
                          <Cell key={i} fill={WAREHOUSE_COLORS[entry.warehouse_id] || COLORS.tradeling} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>

                  {/* Warehouse table */}
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left border-b border-buddy-border">
                          <th className="pb-1.5 pr-3 font-medium text-buddy-muted">Warehouse</th>
                          <th className="pb-1.5 pr-3 font-medium text-buddy-muted text-right">Units</th>
                          <th className="pb-1.5 pr-3 font-medium text-buddy-muted text-right">Revenue</th>
                          <th className="pb-1.5 pr-3 font-medium text-buddy-muted text-right">Avg/Day</th>
                          <th className="pb-1.5 pr-3 font-medium text-buddy-muted text-right">Txns</th>
                          <th className="pb-1.5 font-medium text-buddy-muted">Stockout</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedSkuDetail.whSales.map((w) => (
                          <tr key={w.warehouse_id} className="border-b border-buddy-border/30">
                            <td className="py-1.5 pr-3">
                              <Badge variant="neutral">{w.warehouse_id}</Badge>
                            </td>
                            <td className="py-1.5 pr-3 text-right text-tradeling-400 font-medium">{formatNumber(w.units)}</td>
                            <td className="py-1.5 pr-3 text-right text-blue-400">{formatCurrency(w.revenue)}</td>
                            <td className="py-1.5 pr-3 text-right text-buddy-text">{w.avgDaily}</td>
                            <td className="py-1.5 pr-3 text-right text-buddy-muted">{w.txns}</td>
                            <td className="py-1.5">
                              {w.hasStockout ? (
                                <span className="text-yellow-400">Yes</span>
                              ) : (
                                <span className="text-buddy-muted">No</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Stock Age Distribution */}
        <Card delay={0.3}>
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-purple-400" />
            <h3 className="font-medium text-buddy-text">Stock Age Distribution by Warehouse</h3>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={stockAgeData}>
              <defs>
                <linearGradient id="colorDXB" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.tradeling} stopOpacity={0.6} />
                  <stop offset="95%" stopColor={COLORS.tradeling} stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="colorAUH" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.blue} stopOpacity={0.6} />
                  <stop offset="95%" stopColor={COLORS.blue} stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="colorSHJ" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.purple} stopOpacity={0.6} />
                  <stop offset="95%" stopColor={COLORS.purple} stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e242d" />
              <XAxis dataKey="bucket" stroke="#6b7280" fontSize={12} />
              <YAxis stroke="#6b7280" fontSize={12} />
              <Tooltip content={<DarkTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="DXB" stackId="1" stroke={COLORS.tradeling} fill="url(#colorDXB)" />
              <Area type="monotone" dataKey="AUH" stackId="1" stroke={COLORS.blue} fill="url(#colorAUH)" />
              <Area type="monotone" dataKey="SHJ" stackId="1" stroke={COLORS.purple} fill="url(#colorSHJ)" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        {/* Revenue by Product Type */}
        <Card delay={0.35}>
          <div className="flex items-center gap-2 mb-4">
            <Package className="w-4 h-4 text-tradeling-400" />
            <h3 className="font-medium text-buddy-text">Revenue by Product Type</h3>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={revenueByProductType}
                cx="50%"
                cy="50%"
                outerRadius={100}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
                style={{ fontSize: 11 }}
              >
                {revenueByProductType.map((entry, i) => (
                  <Cell key={i} fill={PRODUCT_TYPE_COLORS[entry.name] || COLORS.cyan} />
                ))}
              </Pie>
              <Tooltip
                content={<DarkTooltip formatter={(v: any) => formatCurrency(Number(v))} />}
              />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Row 4: Forecast vs Current Stock (Scatter) + Capacity Utilization (Radial) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Forecast vs Current Stock */}
        <Card delay={0.4} className="lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-blue-400" />
            <h3 className="font-medium text-buddy-text">
              Forecast Demand vs Current Stock (per SKU/Warehouse)
            </h3>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e242d" />
              <XAxis
                type="number"
                dataKey="current"
                name="Current Stock"
                stroke="#6b7280"
                fontSize={12}
                label={{ value: "Current Stock", position: "bottom", fill: "#6b7280", fontSize: 11 }}
              />
              <YAxis
                type="number"
                dataKey="forecast"
                name="Forecast (30d)"
                stroke="#6b7280"
                fontSize={12}
                label={{ value: "Forecast 30d", angle: -90, position: "insideLeft", fill: "#6b7280", fontSize: 11 }}
              />
              <ZAxis range={[60, 60]} />
              <Tooltip
                content={<DarkTooltip />}
                cursor={{ strokeDasharray: "3 3" }}
              />
              <Scatter name="SKU/Warehouse" data={forecastVsStock}>
                {forecastVsStock.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} fillOpacity={0.7} />
                ))}
              </Scatter>
              {/* Diagonal reference line: above = surplus, below = shortage risk */}
            </ScatterChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2 text-xs text-buddy-muted">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS.tradeling }} /> DXB
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS.blue }} /> AUH
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS.purple }} /> SHJ
            </span>
            <span className="ml-auto">Below diagonal = shortage risk · Above = surplus</span>
          </div>
        </Card>

        {/* Warehouse Capacity Utilization */}
        <Card delay={0.45}>
          <div className="flex items-center gap-2 mb-4">
            <WarehouseIcon className="w-4 h-4 text-tradeling-400" />
            <h3 className="font-medium text-buddy-text">Capacity Utilization</h3>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <RadialBarChart
              innerRadius="30%"
              outerRadius="100%"
              data={utilizationData}
              startAngle={90}
              endAngle={-270}
            >
              <RadialBar background dataKey="utilization" cornerRadius={6} />
              <Legend
                iconSize={10}
                layout="vertical"
                verticalAlign="middle"
                align="right"
                wrapperStyle={{ fontSize: 12 }}
              />
              <Tooltip content={<DarkTooltip />} />
            </RadialBarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Row 5: Recommendation Net Benefit + Avg Daily Sales */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recommendation Net Benefit by Rank */}
        <Card delay={0.5}>
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="w-4 h-4 text-tradeling-400" />
            <h3 className="font-medium text-buddy-text">Recommendation Net Benefit by Rank</h3>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={recBenefitData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e242d" />
              <XAxis dataKey="rank" stroke="#6b7280" fontSize={11} interval={0} />
              <YAxis stroke="#6b7280" fontSize={11} />
              <Tooltip
                content={<DarkTooltip formatter={(v: any) => [formatCurrency(Number(v)), "Net Benefit"]} />}
                cursor={{ fill: "#1e242d40" }}
              />
              <Bar dataKey="netBenefit" name="Net Benefit" radius={[4, 4, 0, 0]} barSize={28}>
                {recBenefitData.map((entry, i) => (
                  <Cell key={i} fill={entry.feasible ? COLORS.tradeling : COLORS.red} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2 text-xs text-buddy-muted">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS.tradeling }} /> Feasible
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS.red }} /> Not Recommended
            </span>
          </div>
        </Card>

        {/* Avg Daily Sales by Warehouse (Line) */}
        <Card delay={0.55}>
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-blue-400" />
            <h3 className="font-medium text-buddy-text">Average Daily Sales Rate by Warehouse</h3>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={avgDailyByWarehouse}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e242d" />
              <XAxis dataKey="warehouse" stroke="#6b7280" fontSize={12} />
              <YAxis stroke="#6b7280" fontSize={12} />
              <Tooltip content={<DarkTooltip />} />
              <Line
                type="monotone"
                dataKey="avgDaily"
                name="Avg Daily Units"
                stroke={COLORS.blue}
                strokeWidth={3}
                dot={{ fill: COLORS.blue, r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Summary stats footer */}
      <Card delay={0.6}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-xs text-buddy-muted mb-1">Total SKUs Tracked</p>
            <p className="text-lg font-bold text-buddy-text">{skus.length}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-buddy-muted mb-1">Stock Records</p>
            <p className="text-lg font-bold text-buddy-text">{stockLevels.length}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-buddy-muted mb-1">Active Imbalances</p>
            <p className="text-lg font-bold text-yellow-400">{imbalances.length}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-buddy-muted mb-1">Recommendations</p>
            <p className="text-lg font-bold text-tradeling-400">{recommendations.length}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
