"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Package, AlertCircle, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { UAEMap } from "@/components/UAEMap";
import { WarehouseDetailPanel } from "@/components/WarehouseDetailPanel";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import type { StockLevel, Warehouse, InventoryOverview } from "@/lib/types";

const warehouseColors: Record<string, string> = {
  DXB: "from-tradeling-400 to-tradeling-600",
  AUH: "from-blue-400 to-blue-600",
  SHJ: "from-purple-400 to-purple-600",
};

function InventoryMapPageInner() {
  const searchParams = useSearchParams();
  const queryWarehouse = searchParams.get("warehouse");
  const querySku = searchParams.get("sku");

  const [stock, setStock] = useState<StockLevel[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [overview, setOverview] = useState<InventoryOverview[]>([]);
  const [selectedWh, setSelectedWh] = useState<string | null>(queryWarehouse);
  const [skuFilter, setSkuFilter] = useState<string | null>(querySku);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [stk, whs, ov] = await Promise.all([
          api.getStockLevels(),
          api.getWarehouses(),
          api.getInventoryOverview(),
        ]);
        setStock(stk);
        setWarehouses(whs);
        setOverview(ov);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  const filteredStock = stock.filter((s) => {
    if (selectedWh && s.warehouse_id !== selectedWh) return false;
    if (skuFilter && s.sku_id !== skuFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-buddy-text">Inventory Map</h1>
        <p className="text-sm text-buddy-muted mt-1">Real-time stock across UAE warehouses</p>
      </div>

      {/* Warehouse cards with UAE map layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {warehouses.map((wh, i) => {
          const ov = overview.find((o) => o.warehouse_id === wh.warehouse_id);
          const isSelected = selectedWh === wh.warehouse_id;
          const total = ov?.total_available || 0;
          const capacity = wh.capacity_units;
          const utilization = (total / capacity) * 100;

          return (
            <motion.div
              key={wh.warehouse_id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              onClick={() => setSelectedWh(isSelected ? null : wh.warehouse_id)}
            >
              <Card hover className={isSelected ? "border-tradeling-500 ring-1 ring-tradeling-500/30" : ""}>
                {/* Warehouse header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${warehouseColors[wh.warehouse_id]} flex items-center justify-center`}>
                      <MapPin className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-medium text-buddy-text">{wh.city}</h3>
                      <p className="text-xs text-buddy-muted">{wh.warehouse_id} · {wh.name}</p>
                    </div>
                  </div>
                  <Badge variant="neutral">{formatNumber(total)} units</Badge>
                </div>

                {/* Utilization bar */}
                <div className="mb-3">
                  <div className="flex justify-between text-xs text-buddy-muted mb-1">
                    <span>Capacity utilization</span>
                    <span>{utilization.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-buddy-bg overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(utilization, 100)}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                      className={`h-full rounded-full bg-gradient-to-r ${
                        utilization > 80 ? "from-red-500 to-red-400" :
                        utilization > 50 ? "from-yellow-500 to-yellow-400" :
                        `from-tradeling-500 to-tradeling-400`
                      }`}
                    />
                  </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded-lg bg-buddy-bg">
                    <p className="text-buddy-muted">Available</p>
                    <p className="font-medium text-tradeling-400">{formatNumber(ov?.total_available || 0)}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-buddy-bg">
                    <p className="text-buddy-muted">Reserved</p>
                    <p className="font-medium text-buddy-text">{formatNumber(ov?.total_reserved || 0)}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-buddy-bg">
                    <p className="text-buddy-muted">Inbound</p>
                    <p className="font-medium text-blue-400">{formatNumber(ov?.total_inbound || 0)}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-buddy-bg">
                    <p className="text-buddy-muted">Ageing</p>
                    <p className={`font-medium ${(ov?.ageing_units || 0) > 100 ? "text-yellow-400" : "text-buddy-text"}`}>
                      {formatNumber(ov?.ageing_units || 0)}
                    </p>
                  </div>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* UAE Map with animated transfers */}
      <UAEMap
        selectedWarehouse={selectedWh}
        onWarehouseSelect={(id) => setSelectedWh(id === selectedWh ? null : id)}
      />
      <WarehouseDetailPanel
        warehouseId={selectedWh}
        warehouseName={warehouses.find((w) => w.warehouse_id === selectedWh)?.name}
        onClose={() => setSelectedWh(null)}
      />

      {/* SKU-level stock table */}
      <Card delay={0.3}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium text-buddy-text">
            SKU Stock Levels
            {selectedWh ? ` — ${selectedWh}` : ""}
            {skuFilter ? ` · SKU: ${skuFilter}` : ""}
            {!selectedWh && !skuFilter ? " — All Warehouses" : ""}
          </h3>
          {(selectedWh || skuFilter) && (
            <button
              onClick={() => {
                setSelectedWh(null);
                setSkuFilter(null);
              }}
              className="text-xs text-tradeling-400 hover:text-tradeling-300"
            >
              Clear filter
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-buddy-border">
                <th className="pb-2 pr-4 font-medium text-buddy-muted">SKU</th>
                <th className="pb-2 pr-4 font-medium text-buddy-muted">Warehouse</th>
                <th className="pb-2 pr-4 font-medium text-buddy-muted text-right">Available</th>
                <th className="pb-2 pr-4 font-medium text-buddy-muted text-right">Reserved</th>
                <th className="pb-2 pr-4 font-medium text-buddy-muted text-right">Safety</th>
                <th className="pb-2 pr-4 font-medium text-buddy-muted text-right">Inbound</th>
                <th className="pb-2 font-medium text-buddy-muted">Status</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {filteredStock.map((s, i) => {
                  const netAvail = s.available_qty - s.reserved_qty;
                  const isLow = netAvail < s.safety_stock;
                  const isExcess = s.available_qty > s.safety_stock * 5;
                  return (
                    <motion.tr
                      key={`${s.sku_id}-${s.warehouse_id}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ delay: i * 0.02 }}
                      className="border-b border-buddy-border/50 hover:bg-buddy-bg"
                    >
                      <td className="py-2 pr-4 font-mono text-xs">{s.sku_id}</td>
                      <td className="py-2 pr-4">
                        <Badge variant="neutral">{s.warehouse_id}</Badge>
                      </td>
                      <td className="py-2 pr-4 text-right font-medium text-tradeling-400">{s.available_qty}</td>
                      <td className="py-2 pr-4 text-right text-buddy-text">{s.reserved_qty}</td>
                      <td className="py-2 pr-4 text-right text-buddy-muted">{s.safety_stock}</td>
                      <td className="py-2 pr-4 text-right text-blue-400">{s.inbound_qty}</td>
                      <td className="py-2">
                        {isLow ? (
                          <Badge variant="danger"><AlertCircle className="w-3 h-3" /> Low</Badge>
                        ) : isExcess ? (
                          <Badge variant="warning"><Package className="w-3 h-3" /> Excess</Badge>
                        ) : (
                          <Badge variant="success">OK</Badge>
                        )}
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export default function InventoryMapPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-buddy-muted">Loading...</div>}>
      <InventoryMapPageInner />
    </Suspense>
  );
}
