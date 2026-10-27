"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  X,
  ArrowRight,
  Bomb,
  Flame,
  Truck,
  PackageX,
  Waves,
  Biohazard,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRealTime } from "@/lib/useRealTime";
import { api } from "@/lib/api";
import type { Disruption, WSEvent } from "@/lib/types";

interface ActiveAlert extends Disruption {
  alertId: string;
  triggeredAt: number;
}

// Map disruption titles to icons (best-effort matching by keyword)
function getDisruptionIcon(title: string) {
  const lower = title.toLowerCase();
  if (lower.includes("fire") || lower.includes("bomb")) return Bomb;
  if (lower.includes("flood")) return Waves;
  if (lower.includes("port") || lower.includes("strike")) return PackageX;
  if (lower.includes("road") || lower.includes("highway") || lower.includes("closure")) return Truck;
  if (lower.includes("demand") || lower.includes("spike") || lower.includes("viral")) return Flame;
  if (lower.includes("chip") || lower.includes("semiconductor")) return Biohazard;
  return AlertTriangle;
}

const severityConfig: Record<string, { bg: string; border: string; text: string; label: string }> = {
  high: {
    bg: "bg-red-950/40",
    border: "border-red-800",
    text: "text-red-400",
    label: "CRITICAL",
  },
  medium: {
    bg: "bg-orange-950/40",
    border: "border-orange-800",
    text: "text-orange-400",
    label: "WARNING",
  },
  low: {
    bg: "bg-yellow-950/40",
    border: "border-yellow-800",
    text: "text-yellow-400",
    label: "ADVISORY",
  },
};

export function EmergencyAlertSystem() {
  const [activeAlerts, setActiveAlerts] = useState<ActiveAlert[]>([]);
  const [toasts, setToasts] = useState<ActiveAlert[]>([]);
  const dismissedRef = useRef<Set<string>>(new Set());

  // Listen to WS events for disruption injections/publications
  const handleEvent = useCallback((event: WSEvent) => {
    if (event.type === "disruption_injected" || event.type === "disruption_published") {
      const data = event.data as Record<string, any>;
      const alertId = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const severity = (data.severity as string) || "high";

      const alert: ActiveAlert = {
        alertId,
        disruption_id: data.disruption_id,
        disruption_type: (data.type as "supply_shortage" | "shipping_delay") || "supply_shortage",
        title: data.title || "Unknown Disruption",
        description: data.description || null,
        affected_skus: data.affected_skus || [],
        affected_routes: data.affected_routes || null,
        start_date: event.sim_date || new Date().toISOString(),
        end_date: null,
        severity: severity as "low" | "medium" | "high",
        source: "live",
        is_active: true,
        triggeredAt: Date.now(),
      };

      // Add to persistent banner list (only high/medium)
      if (severity === "high" || severity === "medium") {
        setActiveAlerts((prev) => [alert, ...prev].slice(0, 5));
      }

      // Always add a toast notification
      setToasts((prev) => [alert, ...prev].slice(0, 3));
    }
  }, []);

  useRealTime({ onEvent: handleEvent, maxEvents: 5 });

  // Also poll active disruptions from the API on mount (catch pre-existing ones)
  useEffect(() => {
    const loadActive = async () => {
      try {
        const disruptions = await api.getDisruptions(true);
        disruptions.forEach((d) => {
          if (!dismissedRef.current.has(d.disruption_id || d.title)) {
            const alert: ActiveAlert = {
              ...d,
              alertId: `api-${d.disruption_id || d.title}`,
              triggeredAt: Date.now(),
            };
            setActiveAlerts((prev) => {
              // Avoid duplicates
              const exists = prev.some(
                (a) => a.disruption_id === alert.disruption_id || a.title === alert.title
              );
              return exists ? prev : [alert, ...prev].slice(0, 5);
            });
          }
        });
      } catch {
        // API might not be ready
      }
    };
    loadActive();
    const interval = setInterval(loadActive, 15000);
    return () => clearInterval(interval);
  }, []);

  // Auto-dismiss toasts after 10 seconds
  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) =>
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.alertId !== t.alertId));
      }, 10000)
    );
    return () => timers.forEach(clearTimeout);
  }, [toasts]);

  const dismissAlert = (alertId: string, disruptionId?: string) => {
    setActiveAlerts((prev) => prev.filter((a) => a.alertId !== alertId));
    if (disruptionId) dismissedRef.current.add(disruptionId);
  };

  const dismissToast = (alertId: string) => {
    setToasts((prev) => prev.filter((x) => x.alertId !== alertId));
  };

  return (
    <>
      {/* Persistent Alert Banner — slides in under TopBar */}
      <AnimatePresence>
        {activeAlerts.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden border-b border-buddy-border bg-buddy-surface/60"
          >
            <div className="px-6 py-2 space-y-2">
              <AnimatePresence>
                {activeAlerts.map((alert) => {
                  const Icon = getDisruptionIcon(alert.title);
                  const cfg = severityConfig[alert.severity] || severityConfig.high;
                  return (
                    <motion.div
                      key={alert.alertId}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      layout
                      className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border ${cfg.bg} ${cfg.border}`}
                    >
                      {/* Pulsing icon */}
                      <motion.div
                        animate={{ scale: [1, 1.15, 1] }}
                        transition={{ repeat: Infinity, duration: 1.2 }}
                        className="shrink-0"
                      >
                        <Icon className={`w-5 h-5 ${cfg.text}`} />
                      </motion.div>

                      {/* Severity badge */}
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text} border ${cfg.border} shrink-0`}>
                        {cfg.label}
                      </span>

                      {/* Title + affected SKUs */}
                      <div className="flex-1 min-w-0 flex items-center gap-3">
                        <span className="text-sm font-medium text-buddy-text truncate">
                          {alert.title}
                        </span>
                        {alert.affected_skus.length > 0 && (
                          <span className="text-xs text-buddy-muted hidden sm:inline">
                            {alert.affected_skus.length} SKU{alert.affected_skus.length > 1 ? "s" : ""} affected
                          </span>
                        )}
                        <span className="text-xs text-buddy-muted hidden md:inline">
                          {alert.disruption_type === "supply_shortage" ? "Supply Shortage" : "Shipping Delay"}
                        </span>
                      </div>

                      {/* Quick links */}
                      <div className="flex items-center gap-2 shrink-0">
                        <Link
                          href="/actions"
                          className={`text-xs ${cfg.text} hover:opacity-80 flex items-center gap-1`}
                        >
                          Actions <ArrowRight className="w-3 h-3" />
                        </Link>
                        <Link
                          href="/imbalances"
                          className="text-xs text-buddy-muted hover:text-buddy-text flex items-center gap-1"
                        >
                          Imbalances <ArrowRight className="w-3 h-3" />
                        </Link>
                        <button
                          onClick={() => dismissAlert(alert.alertId, alert.disruption_id)}
                          className="p-1 rounded hover:bg-buddy-bg text-buddy-muted hover:text-buddy-text transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast Notifications — slide in from bottom-right */}
      <div className="fixed bottom-6 right-6 z-50 space-y-3 pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => {
            const Icon = getDisruptionIcon(toast.title);
            const cfg = severityConfig[toast.severity] || severityConfig.high;
            return (
              <motion.div
                key={toast.alertId}
                initial={{ opacity: 0, x: 100, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 100, scale: 0.9 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className={`pointer-events-auto w-80 rounded-xl border ${cfg.bg} ${cfg.border} shadow-2xl backdrop-blur-xl p-4`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ repeat: Infinity, duration: 1 }}
                    >
                      <Icon className={`w-5 h-5 ${cfg.text}`} />
                    </motion.div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
                          {cfg.label}
                        </span>
                        <span className="text-xs text-buddy-muted uppercase tracking-wide">
                          Emergency Alert
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => dismissToast(toast.alertId)}
                    className="p-1 rounded hover:bg-buddy-bg text-buddy-muted hover:text-buddy-text transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Body */}
                <p className="text-sm font-medium text-buddy-text mb-1">{toast.title}</p>
                {toast.description && (
                  <p className="text-xs text-buddy-muted mb-2">{toast.description}</p>
                )}

                {/* Affected SKUs */}
                {toast.affected_skus.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {toast.affected_skus.slice(0, 4).map((sku) => (
                      <span
                        key={sku}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-buddy-bg text-buddy-muted border border-buddy-border"
                      >
                        {sku}
                      </span>
                    ))}
                    {toast.affected_skus.length > 4 && (
                      <span className="text-[10px] text-buddy-muted">
                        +{toast.affected_skus.length - 4} more
                      </span>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Link
                    href="/actions"
                    className={`text-xs ${cfg.text} hover:opacity-80 flex items-center gap-1 font-medium`}
                  >
                    Review Actions <ArrowRight className="w-3 h-3" />
                  </Link>
                  <span className="text-buddy-muted">·</span>
                  <Link
                    href="/imbalances"
                    className="text-xs text-buddy-muted hover:text-buddy-text"
                  >
                    View Impact
                  </Link>
                </div>

                {/* Progress bar (auto-dismiss countdown) */}
                <motion.div
                  initial={{ width: "100%" }}
                  animate={{ width: "0%" }}
                  transition={{ duration: 10, ease: "linear" }}
                  className={`h-0.5 mt-3 rounded-full ${cfg.text} opacity-30`}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </>
  );
}
