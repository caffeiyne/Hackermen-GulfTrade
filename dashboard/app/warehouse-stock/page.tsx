"use client";

import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Warehouse as WarehouseIcon,
  Package,
  Search,
  ChevronDown,
  AlertTriangle,
  TrendingUp,
  Layers,
  ArrowUpDown,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { api } from "@/lib/api";
import { formatNumber, formatCurrency, cn } from "@/lib/utils";
import type {
  Warehouse,
  SKU,
  StockLevel,
  InventoryOverview,
  SalesSummary,
} from "@/lib/types";

const WAREHOUSE_COLORS: Record<string, string> = {
  DXB: "#14b8a6",
  AUH: "#3b82f6",
  SHJ: "#a855f7",
  AUH_AIR: "#3b82f6",
};

const PRODUCT_COLORS = [
  "#14b8a6",
  "#3b82f6",
  "#a855f7",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#84cc16",
  "#ec4899",
];

// Dark tooltip for recharts
function DarkTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-buddy-surface border border-buddy-border rounded-lg p-3 shadow-xl text-xs">
      {label && <p className="font-medium text-buddy-text mb-1.5">{label}</p>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color || p.fill }} />
          <span className="text-buddy-muted">{p.name}:</span>
          <span className="font-medium text-buddy-text">
            {typeof p.value === "number" ? formatNumber(p.value) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

type SortKey = "available" | "reserved" | "safety" | "inbound" | "total" | "sku_id";

export default function WarehouseStockPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [skus, setSkus] = useState<SKU[]>([]);
  const [stockLevels, setStockLevels] = useState<StockLevel[]>([]);
  const [overview, setOverview] = useState<InventoryOverview[]>([]);
  const [salesSummary, setSalesSummary] = useState<SalesSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedWarehouse, setSelectedWarehouse] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("available");
  const [sortDesc, setSortDesc] = useState(true);
  const [productFilter, setProductFilter] = useState<string>("all");

  useEffect(() => {
    const load = async () => {
      try {
        const [wh, skuData, stock, ov, sales] = await Promise.all([
          api.getWarehouses(),
          api.getSkus(),
          api.getStockLevels(),
          api.getInventoryOverview(),
          api.getSalesSummary(),
        ]);
        setWarehouses(wh);
        setSkus(skuData);
        setStockLevels(stock);
        setOverview(ov);
        setSalesSummary(sales);
      } catch (err) {
        console.error("Failed to load warehouse stock data:", err);
      }
      setLoading(false);
    };
    load();
  }, []);

  // SKU lookup map
  const skuMap = useMemo(() => new Map(skus.map((s) => [s.sku_id, s])), [skus]);

  // Aggregated stacked bar data (same as analytics chart, but enriched)
  const warehouseStockData = useMemo(() => {
    const whIds = [...new Set(stockLevels.map((s) => s.warehouse_id))].sort();
    return whIds.map((whId) => {
      const whStock = stockLevels.filter((s) => s.warehouse_id === whId);
      const available = whStock.reduce((sum, s) => sum + s.available_qty, 0);
      const reserved = whStock.reduce((sum, s) => sum + s.reserved_qty, 0);
      const safety = whStock.reduce((sum, s) => sum + s.safety_stock, 0);
      const inbound = whStock.reduce((sum, s) => sum + s.inbound_qty, 0);
      return {
        warehouse: whId,
        Available: available,
        Reserved: reserved,
        Safety: safety,
        Inbound: inbound,
        total: available + reserved + safety + inbound,
        skuCount: whStock.length,
      };
    });
  }, [stockLevels]);

  // Product type breakdown per warehouse (for pie chart)
  const productTypeBreakdown = useMemo(() => {
    if (!selectedWarehouse) return [];
    const whStock = stockLevels.filter((s) => s.warehouse_id === selectedWarehouse);
    const typeMap = new Map<string, number>();
    whStock.forEach((s) => {
      const sku = skuMap.get(s.sku_id);
      const type = sku?.product_type || "unknown";
      typeMap.set(type, (typeMap.get(type) || 0) + s.available_qty);
    });
    return Array.from(typeMap.entries())
      .map(([type, qty]) => ({ name: type, value: qty }))
      .sort((a, b) => b.value - a.value);
  }, [selectedWarehouse, stockLevels, skuMap]);

  // Full SKU-level detail for selected warehouse
  const warehouseSkuDetail = useMemo(() => {
    if (!selectedWarehouse) return [];
    return stockLevels
      .filter((s) => s.warehouse_id === selectedWarehouse)
      .map((s) => {
        const sku = skuMap.get(s.sku_id);
        const sales = salesSummary.find(
          (sm) => sm.sku_id === s.sku_id && sm.warehouse_id === selectedWarehouse
        );
        const total = s.available_qty + s.reserved_qty + s.safety_stock + s.inbound_qty;
        const coverageDays =
          sales && sales.avg_daily_qty > 0
            ? Math.round(s.available_qty / sales.avg_daily_qty)
            : null;
        const belowSafety = s.available_qty < s.safety_stock;
        return {
          ...s,
          name: sku?.name || s.sku_id,
          product_type: sku?.product_type || "unknown",
          unit_price: sku?.unit_price || 0,
          unit_cost: sku?.unit_cost || 0,
          total,
          totalValue: s.available_qty * (sku?.unit_price || 0),
          avgDaily: sales?.avg_daily_qty || 0,
          revenue: Number(sales?.total_value || 0),
          txns: sales?.transaction_count || 0,
          hasStockout: sales?.has_stockout_periods || false,
          coverageDays,
          belowSafety,
        };
      })
      .filter((row) => {
        if (productFilter !== "all" && row.product_type !== productFilter) return false;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          if (
            !row.sku_id.toLowerCase().includes(q) &&
            !row.name.toLowerCase().includes(q)
          )
            return false;
        }
        return true;
      })
      .sort((a, b) => {
        const dir = sortDesc ? -1 : 1;
        const av = (a as Record<string, unknown>)[sortBy];
        const bv = (b as Record<string, unknown>)[sortBy];
        if (typeof av === "string" || typeof bv === "string") {
          return dir * String(av).localeCompare(String(bv));
        }
        return dir * (Number(av) - Number(bv));
      });
  }, [selectedWarehouse, stockLevels, skuMap, salesSummary, searchQuery, sortBy, sortDesc, productFilter]);

  const selectedWhInfo = warehouses.find((w) => w.warehouse_id === selectedWarehouse);
  const selectedWhOverview = overview.find((o) => o.warehouse_id === selectedWarehouse);

  const productTypes = useMemo(() => {
    const types = new Set(skus.map((s) => s.product_type));
    return ["all", ...Array.from(types).sort()];
  }, [skus]);

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDesc(!sortDesc);
    } else {
      setSortBy(key);
      setSortDesc(true);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-buddy-muted">Loading warehouse stock data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-buddy-text">Warehouse Stock Composition</h1>
        <p className="text-sm text-buddy-muted mt-1">
          Full SKU-level breakdown of what constitutes stock in each warehouse — click a warehouse bar to drill down
        </p>
      </div>

      {/* Overview: stacked bar chart (same as analytics, but clickable) */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Layers className="w-4 h-4 text-tradeling-400" />
          <h3 className="font-medium text-buddy-text">Stock Composition by Warehouse</h3>
          <span className="text-xs text-buddy-muted ml-auto">
            Click a bar to see full SKU breakdown
          </span>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={warehouseStockData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e242d" />
            <XAxis dataKey="warehouse" stroke="#6b7280" fontSize={12} />
            <YAxis stroke="#6b7280" fontSize={12} />
            <Tooltip content={<DarkTooltip />} cursor={{ fill: "#1e242d40" }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar
              dataKey="Available"
              stackId="a"
              fill="#14b8a6"
              radius={[0, 0, 0, 0]}
              cursor="pointer"
              onClick={(data: any) => setSelectedWarehouse(data.payload.warehouse)}
            />
            <Bar
              dataKey="Reserved"
              stackId="a"
              fill="#3b82f6"
              cursor="pointer"
              onClick={(data: any) => setSelectedWarehouse(data.payload.warehouse)}
            />
            <Bar
              dataKey="Safety"
              stackId="a"
              fill="#a855f7"
              cursor="pointer"
              onClick={(data: any) => setSelectedWarehouse(data.payload.warehouse)}
            />
            <Bar
              dataKey="Inbound"
              stackId="a"
              fill="#f59e0b"
              radius={[4, 4, 0, 0]}
              cursor="pointer"
              onClick={(data: any) => setSelectedWarehouse(data.payload.warehouse)}
            >
              {warehouseStockData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={selectedWarehouse === entry.warehouse ? "#22d3ee" : "#f59e0b"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Warehouse selector cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {warehouseStockData.map((wh) => {
          const whInfo = warehouses.find((w) => w.warehouse_id === wh.warehouse);
          const isSelected = selectedWarehouse === wh.warehouse;
          return (
            <motion.div
              key={wh.warehouse}
              whileHover={{ scale: 1.02 }}
              onClick={() => setSelectedWarehouse(wh.warehouse)}
              className={cn(
                "p-4 rounded-xl border cursor-pointer transition-colors",
                isSelected
                  ? "border-tradeling-500 bg-tradeling-950/30"
                  : "border-buddy-border bg-buddy-surface hover:border-buddy-border"
              )}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ background: WAREHOUSE_COLORS[wh.warehouse] || "#14b8a6" }}
                  />
                  <span className="font-medium text-buddy-text">{wh.warehouse}</span>
                </div>
                <Badge variant={isSelected ? "default" : "neutral"}>
                  {wh.skuCount} SKUs
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-buddy-muted">Available</p>
                  <p className="text-tradeling-400 font-medium">{formatNumber(wh.Available)}</p>
                </div>
                <div>
                  <p className="text-buddy-muted">Reserved</p>
                  <p className="text-blue-400 font-medium">{formatNumber(wh.Reserved)}</p>
                </div>
                <div>
                  <p className="text-buddy-muted">Safety</p>
                  <p className="text-purple-400 font-medium">{formatNumber(wh.Safety)}</p>
                </div>
                <div>
                  <p className="text-buddy-muted">Inbound</p>
                  <p className="text-yellow-400 font-medium">{formatNumber(wh.Inbound)}</p>
                </div>
              </div>
              {whInfo && (
                <p className="text-xs text-buddy-muted mt-2">{whInfo.city} · Cap {formatNumber(whInfo.capacity_units)}</p>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Drill-down panel for selected warehouse */}
      <AnimatePresence>
        {selectedWarehouse && (
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
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ background: `${WAREHOUSE_COLORS[selectedWarehouse]}20`, border: `1px solid ${WAREHOUSE_COLORS[selectedWarehouse]}40` }}
                  >
                    <WarehouseIcon className="w-5 h-5" style={{ color: WAREHOUSE_COLORS[selectedWarehouse] }} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-buddy-text">
                        {selectedWhInfo?.name || selectedWarehouse}
                      </h3>
                      <Badge variant="neutral">{selectedWarehouse}</Badge>
                    </div>
                    <p className="text-xs text-buddy-muted mt-0.5">
                      {selectedWhInfo?.city} · Capacity {formatNumber(selectedWhInfo?.capacity_units || 0)} units
                      {selectedWhOverview && (
                        <> · {selectedWhOverview.sku_count} SKUs · {selectedWhOverview.ageing_units} ageing units</>
                      )}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedWarehouse(null)}
                  className="text-xs text-buddy-muted hover:text-buddy-text"
                >
                  Clear
                </button>
              </div>

              {/* KPI row */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
                {[
                  { label: "Available", value: warehouseSkuDetail.reduce((s, r) => s + r.available_qty, 0), color: "text-tradeling-400" },
                  { label: "Reserved", value: warehouseSkuDetail.reduce((s, r) => s + r.reserved_qty, 0), color: "text-blue-400" },
                  { label: "Safety Stock", value: warehouseSkuDetail.reduce((s, r) => s + r.safety_stock, 0), color: "text-purple-400" },
                  { label: "Inbound", value: warehouseSkuDetail.reduce((s, r) => s + r.inbound_qty, 0), color: "text-yellow-400" },
                  { label: "Stock Value", value: warehouseSkuDetail.reduce((s, r) => s + r.totalValue, 0), color: "text-cyan-400", isCurrency: true },
                ].map((kpi) => (
                  <div key={kpi.label} className="p-3 rounded-lg bg-buddy-bg border border-buddy-border">
                    <p className="text-xs text-buddy-muted mb-1">{kpi.label}</p>
                    <p className={cn("text-lg font-bold", kpi.color)}>
                      {kpi.isCurrency ? formatCurrency(kpi.value) : formatNumber(kpi.value)}
                    </p>
                  </div>
                ))}
              </div>

              {/* Product type pie + SKU table */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Product type pie chart */}
                <div>
                  <h4 className="text-sm font-medium text-buddy-text mb-3">By Product Type</h4>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={productTypeBreakdown}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        innerRadius={40}
                        paddingAngle={2}
                      >
                        {productTypeBreakdown.map((_, i) => (
                          <Cell key={i} fill={PRODUCT_COLORS[i % PRODUCT_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<DarkTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 mt-2">
                    {productTypeBreakdown.map((pt, i) => (
                      <div key={pt.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ background: PRODUCT_COLORS[i % PRODUCT_COLORS.length] }} />
                          <span className="text-buddy-muted capitalize">{pt.name}</span>
                        </div>
                        <span className="text-buddy-text font-medium">{formatNumber(pt.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* SKU table with search + sort */}
                <div className="lg:col-span-2">
                  {/* Controls */}
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <div className="relative flex-1 min-w-[180px]">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-buddy-muted" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search SKU or name..."
                        className="w-full bg-buddy-bg border border-buddy-border rounded-lg pl-8 pr-3 py-1.5 text-sm text-buddy-text placeholder:text-buddy-muted"
                      />
                    </div>
                    <select
                      value={productFilter}
                      onChange={(e) => setProductFilter(e.target.value)}
                      className="bg-buddy-bg border border-buddy-border rounded-lg px-3 py-1.5 text-sm text-buddy-text"
                    >
                      {productTypes.map((t) => (
                        <option key={t} value={t}>
                          {t === "all" ? "All Types" : t.charAt(0).toUpperCase() + t.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto max-h-[400px] overflow-y-auto rounded-lg border border-buddy-border">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-buddy-surface z-10">
                        <tr className="border-b border-buddy-border">
                          {[
                            { key: "sku_id" as SortKey, label: "SKU", sortable: false },
                            { key: "available" as SortKey, label: "Avail", sortable: true },
                            { key: "reserved" as SortKey, label: "Resv", sortable: true },
                            { key: "safety" as SortKey, label: "Safety", sortable: true },
                            { key: "inbound" as SortKey, label: "Inbnd", sortable: true },
                            { key: "total" as SortKey, label: "Total", sortable: true },
                            { key: null, label: "Value", sortable: false },
                            { key: null, label: "Cov/d", sortable: false },
                            { key: null, label: "Status", sortable: false },
                          ].map((col) => (
                            <th
                              key={col.label}
                              className="px-3 py-2 text-left font-medium text-buddy-muted whitespace-nowrap"
                            >
                              {col.sortable ? (
                                <button
                                  onClick={() => toggleSort(col.key!)}
                                  className="flex items-center gap-1 hover:text-buddy-text"
                                >
                                  {col.label}
                                  {sortBy === col.key && (
                                    <ArrowUpDown className="w-3 h-3" />
                                  )}
                                </button>
                              ) : (
                                col.label
                              )}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {warehouseSkuDetail.map((row) => (
                          <tr
                            key={row.sku_id}
                            className="border-b border-buddy-border/30 hover:bg-buddy-bg/50"
                          >
                            <td className="px-3 py-2">
                              <div className="flex flex-col">
                                <span className="font-mono text-buddy-text">{row.sku_id}</span>
                                <span className="text-buddy-muted text-[10px] truncate max-w-[120px]">
                                  {row.name}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right text-tradeling-400 font-medium">
                              {formatNumber(row.available_qty)}
                            </td>
                            <td className="px-3 py-2 text-right text-blue-400">
                              {formatNumber(row.reserved_qty)}
                            </td>
                            <td className="px-3 py-2 text-right text-purple-400">
                              {formatNumber(row.safety_stock)}
                            </td>
                            <td className="px-3 py-2 text-right text-yellow-400">
                              {formatNumber(row.inbound_qty)}
                            </td>
                            <td className="px-3 py-2 text-right text-buddy-text font-medium">
                              {formatNumber(row.total)}
                            </td>
                            <td className="px-3 py-2 text-right text-cyan-400">
                              {formatCurrency(row.totalValue)}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {row.coverageDays !== null ? (
                                <span
                                  className={cn(
                                    row.coverageDays < 7 ? "text-red-400" :
                                    row.coverageDays < 14 ? "text-yellow-400" :
                                    "text-green-400"
                                  )}
                                >
                                  {row.coverageDays}d
                                </span>
                              ) : (
                                <span className="text-buddy-muted">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {row.belowSafety ? (
                                <Badge variant="danger">Below Safety</Badge>
                              ) : row.hasStockout ? (
                                <Badge variant="warning">Stockout</Badge>
                              ) : row.available_qty === 0 ? (
                                <Badge variant="danger">Empty</Badge>
                              ) : (
                                <Badge variant="success">OK</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                        {warehouseSkuDetail.length === 0 && (
                          <tr>
                            <td colSpan={9} className="px-3 py-8 text-center text-buddy-muted">
                              No SKUs match your filters
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-buddy-muted mt-2">
                    {warehouseSkuDetail.length} SKU{warehouseSkuDetail.length !== 1 ? "s" : ""} shown
                    {sortBy !== "sku_id" && ` · sorted by ${sortBy} (${sortDesc ? "desc" : "asc"})`}
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* All-warehouse comparison table */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Package className="w-4 h-4 text-blue-400" />
          <h3 className="font-medium text-buddy-text">Cross-Warehouse Comparison</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-buddy-border text-left">
                <th className="pb-2 pr-4 font-medium text-buddy-muted">Warehouse</th>
                <th className="pb-2 pr-4 font-medium text-buddy-muted text-right">Available</th>
                <th className="pb-2 pr-4 font-medium text-buddy-muted text-right">Reserved</th>
                <th className="pb-2 pr-4 font-medium text-buddy-muted text-right">Safety</th>
                <th className="pb-2 pr-4 font-medium text-buddy-muted text-right">Inbound</th>
                <th className="pb-2 pr-4 font-medium text-buddy-muted text-right">Total</th>
                <th className="pb-2 pr-4 font-medium text-buddy-muted text-right">SKUs</th>
                <th className="pb-2 pr-4 font-medium text-buddy-muted text-right">Capacity</th>
                <th className="pb-2 pr-4 font-medium text-buddy-muted text-right">Utilization</th>
              </tr>
            </thead>
            <tbody>
              {warehouseStockData.map((wh) => {
                const whInfo = warehouses.find((w) => w.warehouse_id === wh.warehouse);
                const capacity = whInfo?.capacity_units || 0;
                const util = capacity > 0 ? Math.round((wh.total / capacity) * 100) : 0;
                return (
                  <tr
                    key={wh.warehouse}
                    className="border-b border-buddy-border/30 hover:bg-buddy-bg/50 cursor-pointer"
                    onClick={() => setSelectedWarehouse(wh.warehouse)}
                  >
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: WAREHOUSE_COLORS[wh.warehouse] || "#14b8a6" }} />
                        <span className="font-medium text-buddy-text">{wh.warehouse}</span>
                        <span className="text-xs text-buddy-muted">{whInfo?.city}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-4 text-right text-tradeling-400 font-medium">{formatNumber(wh.Available)}</td>
                    <td className="py-2 pr-4 text-right text-blue-400">{formatNumber(wh.Reserved)}</td>
                    <td className="py-2 pr-4 text-right text-purple-400">{formatNumber(wh.Safety)}</td>
                    <td className="py-2 pr-4 text-right text-yellow-400">{formatNumber(wh.Inbound)}</td>
                    <td className="py-2 pr-4 text-right text-buddy-text font-medium">{formatNumber(wh.total)}</td>
                    <td className="py-2 pr-4 text-right text-buddy-muted">{wh.skuCount}</td>
                    <td className="py-2 pr-4 text-right text-buddy-muted">{formatNumber(capacity)}</td>
                    <td className="py-2 pr-4 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <div className="w-16 h-1.5 rounded-full bg-buddy-bg overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              util > 85 ? "bg-red-400" : util > 70 ? "bg-yellow-400" : "bg-tradeling-400"
                            )}
                            style={{ width: `${Math.min(util, 100)}%` }}
                          />
                        </div>
                        <span className={cn(
                          "text-xs font-medium",
                          util > 85 ? "text-red-400" : util > 70 ? "text-yellow-400" : "text-tradeling-400"
                        )}>
                          {util}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
