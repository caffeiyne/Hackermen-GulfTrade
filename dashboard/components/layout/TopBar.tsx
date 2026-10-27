"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wifi, WifiOff, Calendar, Zap, Menu } from "lucide-react";
import { useRealTime } from "@/lib/useRealTime";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { SimulatorStatus } from "@/lib/types";

export function TopBar({ onToggleSidebar }: { onToggleSidebar?: () => void }) {
  const { isConnected } = useRealTime();
  const [simStatus, setSimStatus] = useState<SimulatorStatus | null>(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const status = await api.getSimulatorStatus();
        setSimStatus(status);
      } catch {
        // API not ready yet
      }
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="h-16 border-b border-buddy-border bg-buddy-surface/80 backdrop-blur-xl flex items-center justify-between px-3 sm:px-4 md:px-6 shrink-0 gap-2">
      {/* Left: hamburger (mobile) + sim clock */}
      <div className="flex items-center gap-3 sm:gap-6 min-w-0">
        <button
          onClick={onToggleSidebar}
          className="md:hidden p-2 -ml-1 rounded-lg hover:bg-buddy-bg text-buddy-muted hover:text-buddy-text transition-colors shrink-0"
          aria-label="Toggle menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 text-sm min-w-0">
          <Calendar className="w-4 h-4 text-buddy-muted shrink-0" />
          <span className="text-buddy-muted hidden sm:inline">Sim Date:</span>
          <span className="font-mono font-medium text-buddy-text truncate">
            {simStatus?.sim_clock ? formatDate(simStatus.sim_clock) : "—"}
          </span>
        </div>

        {simStatus?.status === "running" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-tradeling-950/60 border border-tradeling-800 shrink-0"
          >
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
            >
              <Zap className="w-3.5 h-3.5 text-tradeling-400" />
            </motion.div>
            <span className="text-xs font-medium text-tradeling-300">
              {simStatus.scenario === "B" ? "Scenario B" : "Scenario A"}
            </span>
          </motion.div>
        )}

        {simStatus?.status === "paused" && (
          <span className="hidden sm:inline text-xs font-medium text-yellow-400 px-3 py-1 rounded-full bg-yellow-950/40 border border-yellow-900 shrink-0">
            Paused
          </span>
        )}
      </div>

      {/* Connection status */}
      <div className="flex items-center gap-2 shrink-0">
        <AnimatePresence mode="wait">
          {isConnected ? (
            <motion.div
              key="connected"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 text-xs"
            >
              <Wifi className="w-4 h-4 text-tradeling-400" />
              <span className="text-tradeling-400">Live</span>
            </motion.div>
          ) : (
            <motion.div
              key="disconnected"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 text-xs"
            >
              <WifiOff className="w-4 h-4 text-red-400" />
              <span className="text-red-400">Offline</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
