"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  Pause,
  Square,
  RotateCcw,
  FastForward,
  Zap,
  AlertTriangle,
  Clock,
  Bomb,
  Flame,
  Truck,
  PackageX,
  Waves,
  Biohazard,
  Brain,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EventRow } from "@/components/EventRow";
import { api } from "@/lib/api";
import { useRealTime } from "@/lib/useRealTime";
import { formatDate } from "@/lib/utils";
import type { SimulatorStatus, ScenarioInfo, WSEvent } from "@/lib/types";

// --- Pre-built "Black Swan" disruption presets for one-click demo injection ---
interface BlackSwanPreset {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  title: string;
  disruption_type: "supply_shortage" | "shipping_delay";
  affected_skus: string[];
  severity: "low" | "medium" | "high";
  duration_days: number;
  color: string;
  description: string;
}

const BLACK_SWANS: BlackSwanPreset[] = [
  {
    id: "gan-chip-shortage",
    icon: Biohazard,
    label: "Chip Shortage",
    title: "Semiconductor shortage — GaN charger supply cut",
    disruption_type: "supply_shortage",
    affected_skus: ["CHG-UC-002", "CHG-UC-003"],
    severity: "high",
    duration_days: 21,
    color: "red",
    description: "Supplier can't fulfill GaN charger POs for 3 weeks",
  },
  {
    id: "port-strike",
    icon: PackageX,
    label: "Port Strike",
    title: "Jebel Ali port strike — all Dubai inbound delayed",
    disruption_type: "shipping_delay",
    affected_skus: ["CHG-UC-001", "CHG-UC-002", "CHG-UC-003", "CHG-UC-004"],
    severity: "high",
    duration_days: 14,
    color: "orange",
    description: "Dubai port operations halted — inbound containers stuck",
  },
  {
    id: "road-closure",
    icon: Truck,
    label: "Road Closure",
    title: "DXB-AUH highway closure — transfer route blocked",
    disruption_type: "shipping_delay",
    affected_skus: [],
    severity: "medium",
    duration_days: 5,
    color: "amber",
    description: "Major highway closed for 5 days — inter-warehouse transfers frozen",
  },
  {
    id: "demand-spike",
    icon: Flame,
    label: "Demand Spike",
    title: "Viral social media surge — earbuds demand 5x",
    disruption_type: "supply_shortage",
    affected_skus: ["EB-WS-001", "EB-WS-002"],
    severity: "medium",
    duration_days: 10,
    color: "purple",
    description: "TikTok trend causes unexpected demand spike across all warehouses",
  },
  {
    id: "warehouse-fire",
    icon: Bomb,
    label: "Warehouse Fire",
    title: "Sharjah warehouse fire — stock destroyed",
    disruption_type: "supply_shortage",
    affected_skus: ["PB-PW-001", "PB-PW-002", "PB-PW-003", "PB-PW-004"],
    severity: "high",
    duration_days: 30,
    color: "red",
    description: "Fire damages Sharjah power bank inventory — emergency replenishment needed",
  },
  {
    id: "flood",
    icon: Waves,
    label: "Flash Flood",
    title: "Flash floods — DXB-SHJ corridor impassable",
    disruption_type: "shipping_delay",
    affected_skus: [],
    severity: "high",
    duration_days: 7,
    color: "blue",
    description: "Unprecedented flooding blocks all transfers between Dubai and Sharjah",
  },
];

export default function SimulatorPage() {
  const [status, setStatus] = useState<SimulatorStatus | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioInfo[]>([]);
  const [selectedScenario, setSelectedScenario] = useState("A");
  const [speed, setSpeed] = useState(1);
  const [loading, setLoading] = useState(false);
  const [injecting, setInjecting] = useState(false);
  const [injectResult, setInjectResult] = useState<string | null>(null);
  const [showCustomPanel, setShowCustomPanel] = useState(false);
  const { events, isConnected } = useRealTime({ maxEvents: 20 });

  useEffect(() => {
    loadStatus();
    loadScenarios();
    const interval = setInterval(loadStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const loadStatus = async () => {
    try {
      const s = await api.getSimulatorStatus();
      setStatus(s);
    } catch {}
  };

  const loadScenarios = async () => {
    try {
      const s = await api.getScenarios();
      setScenarios(s);
    } catch {}
  };

  const handleStart = async () => {
    setLoading(true);
    try {
      await api.startSimulator(selectedScenario, speed);
      await loadStatus();
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  // Quick-start: Scenario B at 4x for immediate demo
  const handleQuickStart = async () => {
    setLoading(true);
    try {
      setSelectedScenario("B");
      setSpeed(4);
      await api.startSimulator("B", 4);
      await loadStatus();
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const handlePause = async () => {
    await api.pauseSimulator();
    await loadStatus();
  };

  const handleResume = async () => {
    await api.resumeSimulator();
    await loadStatus();
  };

  const handleReset = async () => {
    if (!confirm("This will clear ALL simulation data and restore initial stock levels.\n\nContinue?")) return;
    setLoading(true);
    try {
      await api.resetSimulator();
      await loadStatus();
    } finally {
      setLoading(false);
    }
  };

  // --- One-click Black Swan injection ---
  const handleInject = async (preset: BlackSwanPreset) => {
    setInjecting(true);
    setInjectResult(null);
    try {
      await api.injectDisruption({
        disruption_type: preset.disruption_type,
        title: preset.title,
        affected_skus: preset.affected_skus,
        severity: preset.severity,
        duration_days: preset.duration_days,
      });
      setInjectResult(`Injected: ${preset.title}`);
      setTimeout(() => setInjectResult(null), 4000);
    } catch (err) {
      setInjectResult(`Failed: ${(err as Error).message}`);
      setTimeout(() => setInjectResult(null), 4000);
    }
    setInjecting(false);
  };

  // --- Custom disruption injection ---
  const [customForm, setCustomForm] = useState({
    disruption_type: "supply_shortage" as string,
    title: "",
    affected_skus: "",
    severity: "medium" as string,
    duration_days: 14,
  });

  const handleCustomInject = async () => {
    if (!customForm.title.trim()) return;
    setInjecting(true);
    setInjectResult(null);
    try {
      await api.injectDisruption({
        disruption_type: customForm.disruption_type,
        title: customForm.title,
        affected_skus: customForm.affected_skus
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        severity: customForm.severity,
        duration_days: customForm.duration_days,
      });
      setInjectResult(`Injected: ${customForm.title}`);
      setCustomForm({ ...customForm, title: "", affected_skus: "" });
      setShowCustomPanel(false);
      setTimeout(() => setInjectResult(null), 4000);
    } catch (err) {
      setInjectResult(`Failed: ${(err as Error).message}`);
      setTimeout(() => setInjectResult(null), 4000);
    }
    setInjecting(false);
  };

  const isRunning = status?.status === "running";
  const isPaused = status?.status === "paused";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-buddy-text">Scenario Simulator</h1>
        <p className="text-sm text-buddy-muted mt-1">
          Run fictional inventory scenarios in real time — generate events, trigger disruptions, test the AI
        </p>
      </div>

      {/* Simulator status banner */}
      <Card>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 sm:gap-6 flex-wrap">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                isRunning ? "bg-tradeling-950/60 border border-tradeling-800" :
                isPaused ? "bg-yellow-950/40 border border-yellow-900" :
                "bg-buddy-bg border border-buddy-border"
              }`}>
                {isRunning ? (
                  <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}>
                    <Zap className="w-6 h-6 text-tradeling-400" />
                  </motion.div>
                ) : isPaused ? (
                  <Pause className="w-6 h-6 text-yellow-400" />
                ) : (
                  <Play className="w-6 h-6 text-buddy-muted" />
                )}
              </div>
              <div>
                <p className="text-lg font-semibold text-buddy-text">
                  {isRunning ? "Running" : isPaused ? "Paused" : "Idle"}
                </p>
                <p className="text-xs text-buddy-muted">
                  {status?.scenario ? `Scenario ${status.scenario}` : "No scenario loaded"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4 text-buddy-muted" />
              <span className="text-buddy-muted">Sim Clock:</span>
              <span className="font-mono font-medium text-buddy-text">
                {status?.sim_clock ? formatDate(status.sim_clock) : "—"}
              </span>
            </div>
          </div>

          <Badge variant={isConnected ? "success" : "danger"}>
            {isConnected ? "WebSocket Live" : "Offline"}
          </Badge>
        </div>
      </Card>

      {/* Idle hint — shows when simulator hasn't started yet */}
      {!isRunning && !isPaused && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl border border-tradeling-800/50 bg-tradeling-950/20 flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <motion.div
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
            >
              <Zap className="w-5 h-5 text-tradeling-400" />
            </motion.div>
            <div>
              <p className="text-sm font-medium text-buddy-text">Ready to simulate?</p>
              <p className="text-xs text-buddy-muted">
                Pick a scenario below, or quick-start Scenario B (with disruptions) at 4x speed to see emergency alerts in action.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={handleQuickStart} disabled={loading} size="md">
              <Zap className="w-4 h-4" /> Quick-Start Demo
            </Button>
            <Button onClick={handleReset} variant="secondary" size="sm" disabled={loading}>
              <RotateCcw className="w-3.5 h-3.5" /> {loading ? "Resetting..." : "Reset Demo Data"}
            </Button>
          </div>
        </motion.div>
      )}

      {/* Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Scenario selection + start */}
        <Card delay={0.1}>
          <h3 className="font-medium text-buddy-text mb-4">Scenario Selection</h3>
          <div className="space-y-3 mb-4">
            {scenarios.map((sc) => (
              <motion.div
                key={sc.name}
                whileHover={{ scale: 1.01 }}
                onClick={() => setSelectedScenario(sc.name)}
                className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                  selectedScenario === sc.name
                    ? "border-tradeling-500 bg-tradeling-950/30"
                    : "border-buddy-border bg-buddy-bg hover:border-buddy-border"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${sc.name === "B" ? "bg-red-400" : "bg-tradeling-400"}`} />
                    <span className="font-medium text-buddy-text">Scenario {sc.name}</span>
                  </div>
                  <Badge variant={sc.disruptions > 0 ? "danger" : "success"}>
                    {sc.disruptions > 0 ? `${sc.disruptions} disruptions` : "Normal"}
                  </Badge>
                </div>
                <p className="text-xs text-buddy-muted">{sc.title}</p>
                <p className="text-xs text-buddy-muted mt-1">{sc.description}</p>
              </motion.div>
            ))}
          </div>

          {/* Speed selector */}
          <div className="mb-4">
            <label className="text-xs text-buddy-muted block mb-2">Speed Multiplier</label>
            <div className="flex gap-2">
              {[1, 2, 4, 8].map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    speed === s
                      ? "bg-tradeling-600 text-white"
                      : "bg-buddy-bg text-buddy-muted hover:text-buddy-text"
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 flex-wrap">
            {!isRunning && !isPaused && (
              <Button onClick={handleStart} disabled={loading} size="md">
                <Play className="w-4 h-4" /> Start Simulation
              </Button>
            )}
            {isRunning && (
              <Button onClick={handlePause} variant="secondary" size="md">
                <Pause className="w-4 h-4" /> Pause
              </Button>
            )}
            {isPaused && (
              <Button onClick={handleResume} size="md">
                <Play className="w-4 h-4" /> Resume
              </Button>
            )}
            {(isRunning || isPaused) && (
              <Button onClick={handleReset} variant="danger" size="md" disabled={loading}>
                <RotateCcw className="w-4 h-4" /> {loading ? "Resetting..." : "Reset"}
              </Button>
            )}
            {!isRunning && !isPaused && (
              <Button onClick={handleReset} variant="secondary" size="sm" disabled={loading}>
                <RotateCcw className="w-3.5 h-3.5" /> {loading ? "Resetting..." : "Reset Demo Data"}
              </Button>
            )}
          </div>
        </Card>

        {/* Live event feed */}
        <Card delay={0.2}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h3 className="font-medium text-buddy-text">Live Event Feed</h3>
              <span className="text-xs text-buddy-muted">{events.length} events</span>
            </div>
            <motion.div
              animate={isConnected ? { opacity: [1, 0.4, 1] } : {}}
              transition={{ repeat: Infinity, duration: 2 }}
              className={`w-2 h-2 rounded-full ${isConnected ? "bg-tradeling-400" : "bg-red-400"}`}
            />
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            <AnimatePresence initial={false}>
              {events.map((event, i) => (
                <motion.div
                  key={`${event.timestamp}-${i}`}
                  initial={{ opacity: 0, x: -20, height: 0 }}
                  animate={{ opacity: 1, x: 0, height: "auto" }}
                  exit={{ opacity: 0 }}
                  className="flex items-start gap-2.5"
                >
                  <div className="mt-2.5 shrink-0">
                    {event.type === "disruption_published" || event.type === "disruption_injected" ? (
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                    ) : event.type === "sim_clock_tick" ? (
                      <Clock className="w-4 h-4 text-buddy-muted" />
                    ) : event.type === "sale_recorded" ? (
                      <Zap className="w-4 h-4 text-tradeling-400" />
                    ) : event.type === "agent_reasoning" ? (
                      <Brain className="w-4 h-4 text-purple-400" />
                    ) : (
                      <FastForward className="w-4 h-4 text-blue-400" />
                    )}
                  </div>
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
              ))}
            </AnimatePresence>
            {events.length === 0 && (
              <p className="text-sm text-buddy-muted text-center py-8">
                No events yet. Start a simulation to see real-time activity.
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* Black Swan Injection Panel */}
      <Card delay={0.3}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-950/40 border border-red-900 flex items-center justify-center">
              <Bomb className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h3 className="font-medium text-buddy-text">Black Swan Events</h3>
              <p className="text-xs text-buddy-muted">
                Inject unexpected disruptions mid-simulation — one click
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {injectResult && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-xs px-3 py-1.5 rounded-lg bg-tradeling-950/40 border border-tradeling-800 text-tradeling-300"
              >
                {injectResult}
              </motion.div>
            )}
            <Button
              onClick={() => setShowCustomPanel(!showCustomPanel)}
              variant="secondary"
              size="sm"
            >
              Custom
            </Button>
          </div>
        </div>

        {/* Preset buttons grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {BLACK_SWANS.map((swan, i) => {
            const Icon = swan.icon;
            const colorClasses: Record<string, string> = {
              red: "border-red-900/60 hover:border-red-700 hover:bg-red-950/30 text-red-400",
              orange: "border-orange-900/60 hover:border-orange-700 hover:bg-orange-950/30 text-orange-400",
              amber: "border-amber-900/60 hover:border-amber-700 hover:bg-amber-950/30 text-amber-400",
              purple: "border-purple-900/60 hover:border-purple-700 hover:bg-purple-950/30 text-purple-400",
              blue: "border-blue-900/60 hover:border-blue-700 hover:bg-blue-950/30 text-blue-400",
            };
            return (
              <motion.button
                key={swan.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                disabled={injecting}
                onClick={() => handleInject(swan)}
                className={`group relative p-4 rounded-xl border bg-buddy-bg transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed ${colorClasses[swan.color]}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="w-5 h-5" />
                  <span className="text-sm font-semibold text-buddy-text">{swan.label}</span>
                </div>
                <p className="text-xs text-buddy-muted leading-relaxed">{swan.description}</p>
                <div className="flex items-center gap-2 mt-3">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-buddy-border/50 text-buddy-muted uppercase">
                    {swan.severity}
                  </span>
                  <span className="text-[10px] text-buddy-muted">
                    {swan.duration_days}d
                  </span>
                  {swan.affected_skus.length > 0 && (
                    <span className="text-[10px] text-buddy-muted">
                      {swan.affected_skus.length} SKUs
                    </span>
                  )}
                </div>
              </motion.button>
            );
          })}
        </div>

        {/* Custom disruption panel */}
        <AnimatePresence>
          {showCustomPanel && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-4 p-4 rounded-xl border border-buddy-border bg-buddy-bg space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-buddy-text">Custom Disruption</h4>
                  <button onClick={() => setShowCustomPanel(false)}>
                    <X className="w-4 h-4 text-buddy-muted hover:text-buddy-text" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-buddy-muted block mb-1">Type</label>
                    <select
                      value={customForm.disruption_type}
                      onChange={(e) => setCustomForm({ ...customForm, disruption_type: e.target.value })}
                      className="w-full bg-buddy-bg border border-buddy-border rounded-lg px-3 py-2 text-sm text-buddy-text"
                    >
                      <option value="supply_shortage">Supply Shortage</option>
                      <option value="shipping_delay">Shipping Delay</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-buddy-muted block mb-1">Severity</label>
                    <select
                      value={customForm.severity}
                      onChange={(e) => setCustomForm({ ...customForm, severity: e.target.value })}
                      className="w-full bg-buddy-bg border border-buddy-border rounded-lg px-3 py-2 text-sm text-buddy-text"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-buddy-muted block mb-1">Title</label>
                  <input
                    type="text"
                    value={customForm.title}
                    onChange={(e) => setCustomForm({ ...customForm, title: e.target.value })}
                    placeholder="e.g. Cargo plane diverted — AUH inbound lost"
                    className="w-full bg-buddy-bg border border-buddy-border rounded-lg px-3 py-2 text-sm text-buddy-text"
                  />
                </div>

                <div>
                  <label className="text-xs text-buddy-muted block mb-1">
                    Affected SKUs (comma-separated, e.g. CHG-UC-001,CHG-UC-002)
                  </label>
                  <input
                    type="text"
                    value={customForm.affected_skus}
                    onChange={(e) => setCustomForm({ ...customForm, affected_skus: e.target.value })}
                    placeholder="CHG-UC-001, EB-WS-002"
                    className="w-full bg-buddy-bg border border-buddy-border rounded-lg px-3 py-2 text-sm text-buddy-text"
                  />
                </div>

                <div>
                  <label className="text-xs text-buddy-muted block mb-1">Duration (days)</label>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={customForm.duration_days}
                    onChange={(e) => setCustomForm({ ...customForm, duration_days: Number(e.target.value) })}
                    className="w-full bg-buddy-bg border border-buddy-border rounded-lg px-3 py-2 text-sm text-buddy-text"
                  />
                </div>

                <Button onClick={handleCustomInject} disabled={injecting || !customForm.title.trim()} size="md">
                  <AlertTriangle className="w-4 h-4" /> Inject Custom Disruption
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </div>
  );
}
