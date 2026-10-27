"use client";

import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap,
  AlertTriangle,
  ArrowRightLeft,
  Clock,
  Package,
  TrendingUp,
  Brain,
  Filter,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EventRow } from "@/components/EventRow";
import { useRealTime } from "@/lib/useRealTime";
import { api } from "@/lib/api";
import { formatDate, relativeTime } from "@/lib/utils";
import { getEventTypes } from "@/lib/eventFormatter";
import type { AuditLogEntry } from "@/lib/types";

const eventIcons: Record<string, typeof Zap> = {
  sale_recorded: Zap,
  inventory_changed: Package,
  disruption_published: AlertTriangle,
  disruption_injected: AlertTriangle,
  recommendation_generated: TrendingUp,
  recommendation_updated: TrendingUp,
  transfer_approved: ArrowRightLeft,
  transfer_rejected: ArrowRightLeft,
  transfer_in_transit: ArrowRightLeft,
  transfer_completed: ArrowRightLeft,
  transfer_proposed: ArrowRightLeft,
  sim_clock_tick: Clock,
  imbalance_detected: AlertTriangle,
  prompt_approval: ArrowRightLeft,
  simulator_started: Zap,
  simulator_paused: Clock,
  simulator_resumed: Zap,
  simulator_stopped: Clock,
  simulator_reset: Clock,
  simulator_seek: Clock,
  agent_reasoning: Brain,
  agent_error: AlertTriangle,
};

const eventColors: Record<string, string> = {
  sale_recorded: "text-tradeling-400",
  inventory_changed: "text-blue-400",
  disruption_published: "text-red-400",
  disruption_injected: "text-red-400",
  recommendation_generated: "text-purple-400",
  recommendation_updated: "text-purple-400",
  transfer_approved: "text-green-400",
  transfer_rejected: "text-red-400",
  transfer_in_transit: "text-blue-400",
  transfer_completed: "text-green-400",
  transfer_proposed: "text-purple-400",
  sim_clock_tick: "text-buddy-muted",
  imbalance_detected: "text-orange-400",
  prompt_approval: "text-blue-400",
  simulator_started: "text-tradeling-400",
  simulator_paused: "text-amber-400",
  simulator_resumed: "text-tradeling-400",
  simulator_stopped: "text-buddy-muted",
  simulator_reset: "text-buddy-muted",
  simulator_seek: "text-blue-400",
  agent_reasoning: "text-purple-400",
  agent_error: "text-red-400",
};

export default function TimelinePage() {
  const [history, setHistory] = useState<AuditLogEntry[]>([]);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const { events, isConnected, clearEvents } = useRealTime({ maxEvents: 50 });

  useEffect(() => {
    async function loadHistory() {
      try {
        const entries = await api.getTimeline(100);
        setHistory(entries);
      } catch (err) {
        console.error(err);
      }
    }
    loadHistory();
    const interval = setInterval(loadHistory, 5000);
    return () => clearInterval(interval);
  }, []);

  // Build filter list from both live events and history
  const allTypes = useMemo(() => {
    const liveTypes = getEventTypes(events);
    const historyTypes = getEventTypes(history.map((h) => ({ type: h.event_type })));
    return Array.from(new Set([...liveTypes, ...historyTypes])).sort();
  }, [events, history]);

  const filteredLiveEvents = useMemo(() => {
    if (!activeFilter) return events;
    return events.filter((e) => e.type === activeFilter);
  }, [events, activeFilter]);

  const filteredHistory = useMemo(() => {
    if (!activeFilter) return history;
    return history.filter((h) => h.event_type === activeFilter);
  }, [history, activeFilter]);

  // Stats
  const liveCount = events.length;
  const agentEvents = events.filter((e) => e.type === "agent_reasoning").length;
  const disruptionEvents = events.filter(
    (e) => e.type === "disruption_published" || e.type === "disruption_injected"
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-buddy-text">Event Timeline</h1>
          <p className="text-sm text-buddy-muted mt-1">
            Real-time simulation events and historical audit log — click any event for full detail
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={isConnected ? "success" : "danger"}>
            {isConnected ? "WebSocket Live" : "Offline"}
          </Badge>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-tradeling-950/40 border border-tradeling-800 flex items-center justify-center">
              <Zap className="w-5 h-5 text-tradeling-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-buddy-text">{liveCount}</p>
              <p className="text-xs text-buddy-muted">Live Events</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-950/40 border border-purple-900 flex items-center justify-center">
              <Brain className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-buddy-text">{agentEvents}</p>
              <p className="text-xs text-buddy-muted">Agent Cycles</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-950/40 border border-red-900 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-buddy-text">{disruptionEvents}</p>
              <p className="text-xs text-buddy-muted">Disruptions</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filter bar */}
      {allTypes.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              setShowFilters(!showFilters);
              setActiveFilter(null);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              activeFilter
                ? "bg-tradeling-950/40 border-tradeling-800 text-tradeling-300"
                : "bg-buddy-bg border-buddy-border text-buddy-muted hover:text-buddy-text"
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            {activeFilter ? `Filter: ${activeFilter}` : "Filter"}
            {activeFilter && (
              <X
                className="w-3 h-3 ml-1"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveFilter(null);
                }}
              />
            )}
          </button>
          {showFilters && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {allTypes.map((type) => (
                <button
                  key={type}
                  onClick={() => setActiveFilter(activeFilter === type ? null : type)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors ${
                    activeFilter === type
                      ? "bg-tradeling-600 text-white border-tradeling-600"
                      : "bg-buddy-bg text-buddy-muted border-buddy-border hover:text-buddy-text"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Live events */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h3 className="font-medium text-buddy-text">Live Stream</h3>
            <motion.div
              animate={isConnected ? { opacity: [1, 0.4, 1] } : {}}
              transition={{ repeat: Infinity, duration: 2 }}
              className={`w-2 h-2 rounded-full ${isConnected ? "bg-tradeling-400" : "bg-red-400"}`}
            />
          </div>
          {liveCount > 0 && (
            <button
              onClick={clearEvents}
              className="text-xs text-buddy-muted hover:text-buddy-text transition-colors"
            >
              Clear
            </button>
          )}
        </div>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          <AnimatePresence initial={false}>
            {filteredLiveEvents.map((event, i) => {
              const Icon = eventIcons[event.type] || Zap;
              const colorClass = eventColors[event.type] || "text-blue-400";
              return (
                <motion.div
                  key={`${event.timestamp}-${i}`}
                  initial={{ opacity: 0, x: -20, height: 0 }}
                  animate={{ opacity: 1, x: 0, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-start gap-2.5"
                >
                  <Icon className={`w-4 h-4 mt-2.5 shrink-0 ${colorClass}`} />
                  <div className="flex-1 min-w-0">
                    <EventRow
                      eventType={event.type}
                      data={event.data as Record<string, unknown>}
                      simDate={event.sim_date}
                      compact
                    />
                  </div>
                  {event.sim_date && (
                    <span className="text-[10px] text-buddy-muted font-mono shrink-0 mt-3">
                      {formatDate(event.sim_date)}
                    </span>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
          {filteredLiveEvents.length === 0 && (
            <p className="text-sm text-buddy-muted text-center py-8">
              {activeFilter
                ? `No "${activeFilter}" events in the live stream.`
                : "Waiting for events... Start a simulation to see real-time activity."}
            </p>
          )}
        </div>
      </Card>

      {/* Historical audit log */}
      <Card delay={0.1}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium text-buddy-text">
            Audit Log History
            <span className="text-xs text-buddy-muted ml-2">
              {filteredHistory.length} {filteredHistory.length === 1 ? "entry" : "entries"}
            </span>
          </h3>
        </div>
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {filteredHistory.map((entry, i) => {
            const Icon = eventIcons[entry.event_type] || Zap;
            const colorClass = eventColors[entry.event_type] || "text-buddy-muted";
            return (
              <motion.div
                key={entry.log_id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: Math.min(i * 0.02, 0.5) }}
                className="flex items-start gap-2.5"
              >
                <Icon className={`w-4 h-4 mt-2.5 shrink-0 ${colorClass}`} />
                <div className="flex-1 min-w-0">
                  <EventRow
                    eventType={entry.event_type}
                    data={entry.event_data as Record<string, unknown>}
                    simDate={entry.sim_timestamp}
                    realTimestamp={entry.real_timestamp}
                    compact
                  />
                  <div className="flex items-center gap-2 mt-1 ml-0.5">
                    <span className="text-[10px] text-buddy-muted font-mono">
                      {formatDate(entry.sim_timestamp)}
                    </span>
                    <span className="text-[10px] text-buddy-muted">·</span>
                    <span className="text-[10px] text-buddy-muted">
                      {relativeTime(entry.real_timestamp)}
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })}
          {filteredHistory.length === 0 && (
            <p className="text-sm text-buddy-muted text-center py-8">
              {activeFilter
                ? `No "${activeFilter}" entries in the audit log.`
                : "No historical events. Run a simulation to populate the audit log."}
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
