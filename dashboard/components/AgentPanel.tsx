"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  RefreshCw,
  Eye,
  Lightbulb,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { useRealTime } from "@/lib/useRealTime";
import type { AgentAnalysis, WSEvent } from "@/lib/types";

/**
 * Agent Reasoning Panel — shows the AI agent's live reasoning chain.
 *
 * Displays:
 *  - The agent's plain-English explanation of what it observed and decided
 *  - The multi-step reasoning chain (observe → reason → plan → explain → act)
 *  - Actions the agent auto-proposed (still need human approval)
 *  - A "thinking" animation when the agent is processing
 */
export function AgentPanel() {
  const [analysis, setAnalysis] = useState<AgentAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [isThinking, setIsThinking] = useState(false);
  const { latestEvent } = useRealTime({
    onEvent: (event: WSEvent) => {
      if (event.type === "agent_reasoning") {
        setIsThinking(false);
        loadAnalysis();
      } else if (
        event.type === "disruption_injected" ||
        event.type === "disruption_published" ||
        event.type === "simulator_started"
      ) {
        setIsThinking(true);
      }
    },
  });

  useEffect(() => {
    loadAnalysis();
    const interval = setInterval(loadAnalysis, 15000);
    return () => clearInterval(interval);
  }, [latestEvent]);

  const loadAnalysis = async () => {
    try {
      const a = await api.getAgentAnalysis();
      if (a && "cycle" in a) {
        setAnalysis(a as AgentAnalysis);
      }
    } catch {
      // Agent not ready yet
    } finally {
      setLoading(false);
    }
  };

  const handleTrigger = async () => {
    setIsThinking(true);
    try {
      await api.triggerAgent();
    } catch {
      setIsThinking(false);
    }
  };

  return (
    <Card delay={0.1}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <motion.div
            animate={isThinking ? {
              scale: [1, 1.1, 1],
              rotate: [0, 3, -3, 0],
            } : {}}
            transition={{ repeat: isThinking ? Infinity : 0, duration: 1.5 }}
            className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              isThinking
                ? "bg-tradeling-950/60 border border-tradeling-700"
                : "bg-buddy-bg border border-buddy-border"
            }`}
          >
            <Brain className={`w-5 h-5 ${isThinking ? "text-tradeling-400" : "text-buddy-muted"}`} />
          </motion.div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-buddy-text">Inventory Agent</h3>
              {isThinking ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <Badge variant="info">
                    <Sparkles className="w-3 h-3 mr-1 inline" /> Thinking...
                  </Badge>
                </motion.div>
              ) : analysis ? (
                <Badge variant="success">Active</Badge>
              ) : (
                <Badge variant="neutral">Idle</Badge>
              )}
            </div>
            <p className="text-xs text-buddy-muted mt-0.5">
              {analysis
                ? `Cycle ${analysis.cycle} · ${formatTrigger(analysis.trigger)}`
                : "Waiting for first analysis..."}
            </p>
          </div>
        </div>
        <Button onClick={handleTrigger} variant="secondary" size="sm" disabled={isThinking}>
          <RefreshCw className={`w-3.5 h-3.5 ${isThinking ? "animate-spin" : ""}`} /> Re-run
        </Button>
      </div>

      {/* Thinking animation */}
      <AnimatePresence>
        {isThinking && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-4"
          >
            <div className="flex items-center gap-2 p-3 rounded-lg bg-tradeling-950/30 border border-tradeling-900">
              <motion.div
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ repeat: Infinity, duration: 0.8 }}
                className="w-2 h-2 rounded-full bg-tradeling-400"
              />
              <motion.div
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ repeat: Infinity, duration: 0.8, delay: 0.15 }}
                className="w-2 h-2 rounded-full bg-tradeling-400"
              />
              <motion.div
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ repeat: Infinity, duration: 0.8, delay: 0.3 }}
                className="w-2 h-2 rounded-full bg-tradeling-400"
              />
              <span className="text-xs text-tradeling-300 ml-2">
                Agent is observing state, running forecasts, and evaluating options...
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Explanation */}
      {analysis?.explanation && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-4 p-4 rounded-lg bg-buddy-bg border border-buddy-border"
        >
          <div className="flex items-start gap-2 mb-2">
            <Lightbulb className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
            <p className="text-xs font-medium text-buddy-muted">Agent's Assessment</p>
          </div>
          <pre className="text-xs text-buddy-text whitespace-pre-wrap font-sans leading-relaxed">
            {analysis.explanation}
          </pre>
        </motion.div>
      )}

      {/* Reasoning steps */}
      {analysis?.reasoning?.steps && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Eye className="w-3.5 h-3.5 text-buddy-muted" />
            <p className="text-xs font-medium text-buddy-muted">Reasoning Chain</p>
          </div>
          <div className="space-y-1.5">
            {analysis.reasoning.steps.slice(-6).map((step, i) => (
              <motion.div
                key={`${step.step}-${i}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-start gap-2 text-xs"
              >
                <span className="text-buddy-muted font-mono shrink-0 mt-0.5">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-buddy-text">{step.description}</span>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Actions taken */}
      {analysis?.actions_taken && analysis.actions_taken.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <ArrowRight className="w-3.5 h-3.5 text-buddy-muted" />
            <p className="text-xs font-medium text-buddy-muted">Actions Auto-Proposed</p>
          </div>
          <div className="space-y-2">
            {analysis.actions_taken.map((action, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className="flex items-center justify-between p-2.5 rounded-lg bg-buddy-bg border border-buddy-border"
              >
                <div className="flex items-center gap-2">
                  {action.action === "proposal_created" ? (
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                  ) : action.action === "skip_existing" ? (
                    <ArrowRight className="w-4 h-4 text-buddy-muted" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-400" />
                  )}
                  <div>
                    <p className="text-xs font-medium text-buddy-text">
                      {action.action === "proposal_created"
                        ? `Transfer ${action.quantity} ${action.sku_id}: ${action.from} → ${action.to}`
                        : action.reason || action.action}
                    </p>
                    {action.net_benefit !== undefined && (
                      <p className="text-[10px] text-green-400">
                        Net benefit: +{action.net_benefit?.toFixed(0)} AED
                      </p>
                    )}
                  </div>
                </div>
                {action.action === "proposal_created" && (
                  <Badge variant="warning">Needs Approval</Badge>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!analysis && !loading && !isThinking && (
        <div className="text-center py-8">
          <Brain className="w-8 h-8 text-buddy-muted mx-auto mb-2 opacity-50" />
          <p className="text-sm text-buddy-muted">
            Agent will start reasoning when the simulator begins.
          </p>
        </div>
      )}
    </Card>
  );
}

function formatTrigger(trigger: string): string {
  const map: Record<string, string> = {
    agent_started: "Initial scan",
    periodic: "Routine check",
    manual_trigger: "Manual trigger",
    "react:disruption_injected": "Reacting to black swan",
    "react:disruption_published": "Reacting to disruption",
    "react:transfer_approved": "Post-approval update",
    "react:transfer_rejected": "Post-rejection update",
    "react:transfer_completed": "Transfer completed",
    "react:simulator_started": "Sim started",
    "react:simulator_resumed": "Sim resumed",
  };
  return map[trigger] || trigger;
}
