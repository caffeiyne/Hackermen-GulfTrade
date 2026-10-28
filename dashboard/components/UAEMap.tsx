"use client";

import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Truck, AlertTriangle, Package, Warehouse } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { api } from "@/lib/api";
import { useRealTime } from "@/lib/useRealTime";
import type { InventoryOverview, Disruption, WSEvent, TransferProposal } from "@/lib/types";

/**
 * UAE Warehouse Map — stylized SVG with animated transfer flows.
 *
 * Features:
 *  - 3 warehouse nodes positioned on a simplified UAE outline
 *  - Pulsing stock levels (red = critical, yellow = warning, green = healthy)
 *  - Animated transfer routes (dashed line + moving truck icon)
 *  - Disrupted routes turn red and flash
 *  - Transfer proposals show as pending animations
 *  - Clickable pins with selected state + callback for detail panels
 *  - WAREHOUSES array is easy to extend — just add a city with x/y coords
 */

interface WarehouseNode {
  id: string;
  name: string;
  city: string;
  x: number; // SVG coordinates
  y: number;
}

/**
 * To add a new city, just append to this array with an id, name, city,
 * and x/y coordinates within the SVG viewBox (0 0 480 320).
 * Routes will auto-generate between all pairs.
 */
const WAREHOUSES: WarehouseNode[] = [
  { id: "DXB", name: "Dubai Warehouse", city: "Dubai", x: 280, y: 180 },
  { id: "AUH", name: "Abu Dhabi Warehouse", city: "Abu Dhabi", x: 140, y: 250 },
  { id: "SHJ", name: "Sharjah Warehouse", city: "Sharjah", x: 330, y: 140 },
];

// Routes between warehouses (bidirectional)
const ROUTES = [
  { from: "DXB", to: "AUH", key: "DXB-AUH" },
  { from: "DXB", to: "SHJ", key: "DXB-SHJ" },
  { from: "AUH", to: "SHJ", key: "AUH-SHJ" },
];

interface TransferAnimation {
  id: string;
  fromId: string;
  toId: string;
  sku: string;
  quantity: number;
  status: "proposed" | "approved" | "in_transit";
}

interface UAEMapProps {
  selectedWarehouse?: string | null;
  onWarehouseSelect?: (warehouseId: string) => void;
}

export function UAEMap({ selectedWarehouse, onWarehouseSelect }: UAEMapProps = {}) {
  const [overview, setOverview] = useState<InventoryOverview[]>([]);
  const [disruptions, setDisruptions] = useState<Disruption[]>([]);
  const [transfers, setTransfers] = useState<TransferProposal[]>([]);
  const [activeTransfers, setActiveTransfers] = useState<TransferAnimation[]>([]);

  const { latestEvent } = useRealTime({
    onEvent: (event: WSEvent) => {
      if (
        event.type === "transfer_approved" ||
        event.type === "transfer_completed" ||
        event.type === "disruption_injected" ||
        event.type === "disruption_published" ||
        event.type === "agent_reasoning" ||
        event.type === "inventory_changed"
      ) {
        loadData();
      }
    },
  });

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 8000);
    return () => clearInterval(interval);
  }, [latestEvent]);

  const loadData = async () => {
    try {
      const [ov, dis, tr] = await Promise.all([
        api.getInventoryOverview(),
        api.getDisruptions(true),
        api.getTransfers(),
      ]);
      setOverview(ov);
      setDisruptions(dis);
      setTransfers(tr);
    } catch {}
  };

  // Build transfer animations from pending transfers
  useEffect(() => {
    const animations: TransferAnimation[] = transfers
      .filter((t) => t.status === "approved" || t.status === "in_transit" || t.status === "proposed")
      .slice(0, 5)
      .map((t, i) => ({
        id: t.transfer_id || `transfer-${i}`,
        fromId: t.from_warehouse,
        toId: t.to_warehouse,
        sku: t.sku_id,
        quantity: t.quantity,
        status: t.status as "proposed" | "approved" | "in_transit",
      }));
    setActiveTransfers(animations);
  }, [transfers]);

  // Find disrupted routes
  const disruptedRoutes = useMemo(() => {
    const disrupted = new Set<string>();
    disruptions.forEach((d) => {
      if (d.affected_routes) {
        d.affected_routes.forEach((r) => {
          disrupted.add(r);
          // Also add reverse direction
          const parts = r.split("-");
          if (parts.length === 2) {
            disrupted.add(`${parts[1]}-${parts[0]}`);
          }
        });
      }
    });
    return disrupted;
  }, [disruptions]);

  // Get stock status for a warehouse
  const getStockStatus = (whId: string): "healthy" | "warning" | "critical" => {
    const wh = overview.find((w) => w.warehouse_id === whId);
    if (!wh) return "healthy";
    if (wh.total_available < wh.total_safety) return "critical";
    if (wh.total_available < wh.total_safety * 1.5) return "warning";
    return "healthy";
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "critical": return "#ef4444";
      case "warning": return "#facc15";
      case "healthy": return "#22c55e";
      default: return "#6b7280";
    }
  };

  const getWarehouseById = (id: string) => WAREHOUSES.find((w) => w.id === id);

  return (
    <Card delay={0.2}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-buddy-text">UAE Warehouse Network</h3>
          {onWarehouseSelect && (
            <span className="text-[10px] text-buddy-muted ml-1">click a pin to explore</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs">
          {disruptions.length > 0 && (
            <Badge variant="danger">
              <AlertTriangle className="w-3 h-3 mr-1 inline" />
              {disruptions.length} disruption{disruptions.length > 1 ? "s" : ""}
            </Badge>
          )}
          {activeTransfers.length > 0 && (
            <Badge variant="info">
              <Truck className="w-3 h-3 mr-1 inline" />
              {activeTransfers.length} transfer{activeTransfers.length > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
      </div>

      {/* SVG Map */}
      <div className="relative w-full" style={{ aspectRatio: "16 / 10" }}>
        <svg viewBox="0 0 480 320" className="w-full h-full" style={{ background: "transparent" }}>
          {/* Simplified UAE outline */}
          <path
            d="M 60 80 Q 100 60 180 70 L 280 65 Q 350 60 400 80 L 420 120 Q 415 180 390 220 L 340 280 Q 250 290 180 285 L 120 280 Q 80 270 65 230 L 55 180 Q 50 120 60 80 Z"
            fill="rgba(20, 20, 35, 0.4)"
            stroke="rgba(100, 100, 120, 0.3)"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />

          {/* Route lines */}
          {ROUTES.map((route) => {
            const from = getWarehouseById(route.from);
            const to = getWarehouseById(route.to);
            if (!from || !to) return null;
            const isDisrupted = disruptedRoutes.has(route.key);
            const hasActiveTransfer = activeTransfers.some(
              (t) =>
                (t.fromId === route.from && t.toId === route.to) ||
                (t.fromId === route.to && t.toId === route.from)
            );

            return (
              <g key={route.key}>
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={isDisrupted ? "#ef4444" : hasActiveTransfer ? "#22d3ee" : "rgba(80, 80, 100, 0.4)"}
                  strokeWidth={hasActiveTransfer ? 2.5 : 1.5}
                  strokeDasharray={isDisrupted ? "5 3" : hasActiveTransfer ? "8 4" : "none"}
                >
                  {isDisrupted && (
                    <animate
                      attributeName="stroke-opacity"
                      values="0.4;1;0.4"
                      dur="1s"
                      repeatCount="indefinite"
                    />
                  )}
                  {hasActiveTransfer && !isDisrupted && (
                    <animate
                      attributeName="stroke-dashoffset"
                      values="0;-24"
                      dur="1s"
                      repeatCount="indefinite"
                    />
                  )}
                </line>

                {/* Route label */}
                <text
                  x={(from.x + to.x) / 2}
                  y={(from.y + to.y) / 2 - 8}
                  fill={isDisrupted ? "#ef4444" : "rgba(120, 120, 140, 0.6)"}
                  fontSize="8"
                  textAnchor="middle"
                  fontFamily="monospace"
                >
                  {route.key}
                </text>
              </g>
            );
          })}

          {/* Animated transfer trucks */}
          {activeTransfers.map((transfer) => {
            const from = getWarehouseById(transfer.fromId);
            const to = getWarehouseById(transfer.toId);
            if (!from || !to) return null;

            return (
              <motion.g
                key={transfer.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <motion.circle
                  r="5"
                  fill={transfer.status === "proposed" ? "#facc15" : "#22d3ee"}
                  initial={{ cx: from.x, cy: from.y }}
                  animate={{ cx: [from.x, to.x], cy: [from.y, to.y] }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: "easeInOut",
                    repeatType: "reverse",
                  }}
                >
                  <animate attributeName="r" values="4;6;4" dur="0.8s" repeatCount="indefinite" />
                </motion.circle>
              </motion.g>
            );
          })}

          {/* Warehouse nodes */}
          {WAREHOUSES.map((wh) => {
            const status = getStockStatus(wh.id);
            const color = getStatusColor(status);
            const whData = overview.find((w) => w.warehouse_id === wh.id);
            const stock = whData?.total_available || 0;
            const isSelected = selectedWarehouse === wh.id;
            const isInteractive = !!onWarehouseSelect;

            return (
              <g
                key={wh.id}
                onClick={isInteractive ? () => onWarehouseSelect(wh.id) : undefined}
                style={isInteractive ? { cursor: "pointer" } : undefined}
              >
                {/* Pulsing aura for critical/warning */}
                {status !== "healthy" && (
                  <circle cx={wh.x} cy={wh.y} r="25" fill={color} opacity="0.15">
                    <animate
                      attributeName="r"
                      values="20;35;20"
                      dur="2s"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="opacity"
                      values="0.15;0.05;0.15"
                      dur="2s"
                      repeatCount="indefinite"
                    />
                  </circle>
                )}

                {/* Selected highlight ring */}
                {isSelected && (
                  <circle cx={wh.x} cy={wh.y} r="26" fill="none" stroke={color} strokeWidth="2" opacity="0.6">
                    <animate attributeName="r" values="22;28;22" dur="1.5s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.6;0.2;0.6" dur="1.5s" repeatCount="indefinite" />
                  </circle>
                )}

                {/* Outer ring */}
                <circle
                  cx={wh.x}
                  cy={wh.y}
                  r="18"
                  fill={isSelected ? "rgba(40, 40, 70, 0.9)" : "rgba(30, 30, 50, 0.8)"}
                  stroke={color}
                  strokeWidth={isSelected ? 3 : 2}
                />

                {/* Inner circle */}
                <circle cx={wh.x} cy={wh.y} r="12" fill={color} opacity={isSelected ? 0.35 : 0.2} />

                {/* Warehouse icon placeholder (use text for SVG) */}
                <text
                  x={wh.x}
                  y={wh.y + 4}
                  fill={color}
                  fontSize="10"
                  fontWeight="bold"
                  textAnchor="middle"
                  fontFamily="monospace"
                >
                  {wh.id}
                </text>

                {/* Warehouse name */}
                <text
                  x={wh.x}
                  y={wh.y + 35}
                  fill={isSelected ? "rgba(255, 255, 255, 0.95)" : "rgba(200, 200, 220, 0.8)"}
                  fontSize={isSelected ? 10 : 9}
                  fontWeight={isSelected ? 600 : 400}
                  textAnchor="middle"
                  fontFamily="sans-serif"
                >
                  {wh.city}
                </text>

                {/* Stock count */}
                <text
                  x={wh.x}
                  y={wh.y - 25}
                  fill={color}
                  fontSize="8"
                  textAnchor="middle"
                  fontFamily="monospace"
                >
                  {stock} units
                </text>
              </g>
            );
          })}
        </svg>

        {/* Legend overlay */}
        <div className="absolute bottom-2 right-2 flex flex-col gap-1 text-[10px] text-buddy-muted">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-green-500" /> Healthy
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-yellow-400" /> Warning
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-red-500" /> Critical
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <div className="w-3 h-0.5 bg-cyan-400" /> Active Transfer
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-red-500" style={{ borderTop: "1px dashed" }} /> Disrupted
          </div>
        </div>
      </div>
    </Card>
  );
}
