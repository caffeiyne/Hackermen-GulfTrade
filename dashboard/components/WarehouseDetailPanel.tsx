"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Package, AlertCircle, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import type { StockLevel, SKU, SalesSummary } from "@/lib/types";

interface WarehouseDetailPanelProps {
  warehouseId: string | null;
  warehouseName?: string;
  onClose?: () => void;
}

interface DetailRow {
  sku_id: string;
  name: string;
  product_type: string;
  available: number;
  reserved: number;
  safety: number;
  inbound: number;
  unitsSold: number;
  revenue: number;
  avgDaily: number;
}

export function WarehouseDetailPanel({
  warehouseId,
  warehouseName,
  onClose,
}: WarehouseDetailPanelProps) {
  const [stock, setStock] = useState<StockLevel[]>([]);
  const [skus, setSkus] = useState<SKU[]>([]);
  const [sales, setSales] = useState<SalesSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!warehouseId) return;
    setLoading(true);
    async function load() {
      try {
        const [stk, skuData, salesData] = await Promise.all([
          api.getStockLevels(warehouseId!),
          api.getSkus(),
          api.getSalesSummary(undefined, warehouseId!),
        ]);
        setStock(stk);
        setSkus(skuData);
        setSales(salesData);
      } catch (err) {
        console.error("Failed to load warehouse detail:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
  }, [warehouseId]);

  const skuMap = new Map(skus.map((s) => [s.sku_id, s]));

  const rows: DetailRow[] = stock
    .map((s) => {
      const sku = skuMap.get(s.sku_id);
      const sale = sales.find(
        (x) => x.sku_id === s.sku_id && x.warehouse_id === warehouseId
      );
      return {
        sku_id: s.sku_id,
        name: sku?.name || s.sku_id,
        product_type: sku?.product_type || "—",
        available: s.available_qty,
        reserved: s.reserved_qty,
        safety: s.safety_stock,
        inbound: s.inbound_qty,
        unitsSold: sale?.total_qty ?? 0,
        revenue: sale ? Number(sale.total_value) : 0,
        avgDaily: sale?.avg_daily_qty ?? 0,
      };
    })
    .sort((a, b) => b.available + b.inbound - (a.available + a.inbound));

  const totalAvailable = rows.reduce((s, r) => s + r.available, 0);
  const totalReserved = rows.reduce((s, r) => s + r.reserved, 0);
  const totalInbound = rows.reduce((s, r) => s + r.inbound, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);

  return (
    <AnimatePresence>
      {warehouseId && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Card delay={0}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-tradeling-400" />
                <h3 className="font-medium text-buddy-text">
                  {warehouseName || warehouseId} — SKU Breakdown
                </h3>
                <Badge variant="neutral">{rows.length} SKUs</Badge>
              </div>
              {onClose && (
                <button
                  onClick={onClose}
                  className="text-buddy-muted hover:text-buddy-text transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-4 gap-3 mb-4">
              <div className="p-2 rounded-lg bg-buddy-bg">
                <p className="text-xs text-buddy-muted">Available</p>
                <p className="text-sm font-medium text-tradeling-400">
                  {formatNumber(totalAvailable)}
                </p>
              </div>
              <div className="p-2 rounded-lg bg-buddy-bg">
                <p className="text-xs text-buddy-muted">Reserved</p>
                <p className="text-sm font-medium text-buddy-text">
                  {formatNumber(totalReserved)}
                </p>
              </div>
              <div className="p-2 rounded-lg bg-buddy-bg">
                <p className="text-xs text-buddy-muted">Inbound</p>
                <p className="text-sm font-medium text-blue-400">
                  {formatNumber(totalInbound)}
                </p>
              </div>
              <div className="p-2 rounded-lg bg-buddy-bg">
                <p className="text-xs text-buddy-muted">Revenue (30d)</p>
                <p className="text-sm font-medium text-green-400">
                  {formatNumber(totalRevenue)}
                </p>
              </div>
            </div>

            {/* SKU table */}
            {loading ? (
              <div className="h-32 rounded-lg bg-buddy-bg shimmer" />
            ) : rows.length === 0 ? (
              <p className="text-sm text-buddy-muted text-center py-6">
                No stock data for this warehouse
              </p>
            ) : (
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-buddy-surface">
                    <tr className="text-left border-b border-buddy-border">
                      <th className="pb-2 pr-4 font-medium text-buddy-muted">SKU</th>
                      <th className="pb-2 pr-4 font-medium text-buddy-muted">Product</th>
                      <th className="pb-2 pr-4 font-medium text-buddy-muted text-right">Available</th>
                      <th className="pb-2 pr-4 font-medium text-buddy-muted text-right">Safety</th>
                      <th className="pb-2 pr-4 font-medium text-buddy-muted text-right">Inbound</th>
                      <th className="pb-2 pr-4 font-medium text-buddy-muted text-right">Sold (30d)</th>
                      <th className="pb-2 font-medium text-buddy-muted">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const netAvail = r.available - r.reserved;
                      const isLow = netAvail < r.safety;
                      const isExcess = r.available > r.safety * 5;
                      return (
                        <motion.tr
                          key={r.sku_id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.03 }}
                          className="border-b border-buddy-border/50 hover:bg-buddy-bg"
                        >
                          <td className="py-2 pr-4 font-mono text-xs">{r.sku_id}</td>
                          <td className="py-2 pr-4 text-xs text-buddy-muted">
                            {r.product_type}
                          </td>
                          <td className="py-2 pr-4 text-right font-medium text-tradeling-400">
                            {formatNumber(r.available)}
                          </td>
                          <td className="py-2 pr-4 text-right text-buddy-muted">
                            {formatNumber(r.safety)}
                          </td>
                          <td className="py-2 pr-4 text-right text-blue-400">
                            {formatNumber(r.inbound)}
                          </td>
                          <td className="py-2 pr-4 text-right text-buddy-text">
                            {formatNumber(r.unitsSold)}
                          </td>
                          <td className="py-2">
                            {isLow ? (
                              <Badge variant="danger">
                                <AlertCircle className="w-3 h-3" /> Low
                              </Badge>
                            ) : isExcess ? (
                              <Badge variant="warning">
                                <TrendingUp className="w-3 h-3" /> Excess
                              </Badge>
                            ) : (
                              <Badge variant="success">OK</Badge>
                            )}
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
