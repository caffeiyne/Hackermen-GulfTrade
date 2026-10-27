/**
 * Event formatter — converts raw WSEvent / AuditLogEntry data into
 * structured, human-readable detail for the live feed and audit log.
 *
 * Each event type has a dedicated renderer that extracts the meaningful
 * fields and returns a structured object (title, subtitle, badges, fields).
 */

import type { WSEvent } from "./types";

export interface EventBadge {
  label: string;
  color: "red" | "orange" | "amber" | "blue" | "green" | "purple" | "gray";
}

export interface FormattedEvent {
  title: string;
  subtitle: string;
  badges: EventBadge[];
  fields: { label: string; value: string }[];
}

function safeStr(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "string") return val;
  if (typeof val === "number") return val.toLocaleString();
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (Array.isArray(val)) return val.length > 0 ? val.join(", ") : "None";
  try {
    return JSON.stringify(val);
  } catch {
    return "—";
  }
}

function getNum(val: unknown): number | null {
  if (typeof val === "number") return val;
  if (typeof val === "string" && !isNaN(Number(val))) return Number(val);
  return null;
}

function formatAED(val: unknown): string {
  const n = getNum(val);
  if (n === null) return safeStr(val);
  return `${Math.round(n).toLocaleString()} AED`;
}

/**
 * Main entry point — given an event type and its data payload,
 * return a structured representation.
 */
export function formatEvent(
  eventType: string,
  data: Record<string, unknown> | undefined
): FormattedEvent {
  const d = data || {};

  switch (eventType) {
    // --- Sales ---
    case "sale_recorded": {
      const qty = getNum(d.quantity);
      const price = getNum(d.unit_price);
      const value = qty !== null && price !== null ? qty * price : null;
      return {
        title: "Sale Recorded",
        subtitle: `${safeStr(d.sku_id)} · ${safeStr(d.warehouse_id)}`,
        badges: [
          { label: `${qty ?? "—"} units`, color: "green" as EventBadge["color"] },
          ...(value !== null ? [{ label: formatAED(value), color: "gray" as EventBadge["color"] }] : []),
        ],
        fields: [
          { label: "SKU", value: safeStr(d.sku_id) },
          { label: "Warehouse", value: safeStr(d.warehouse_id) },
          { label: "Quantity", value: `${qty ?? "—"} units` },
          { label: "Unit Price", value: formatAED(d.unit_price) },
          { label: "Total Value", value: value !== null ? formatAED(value) : "—" },
          { label: "Buyer", value: safeStr(d.buyer_id) },
        ],
      };
    }

    // --- Inventory ---
    case "inventory_changed": {
      return {
        title: "Inventory Changed",
        subtitle: `${safeStr(d.sku_id)} · ${safeStr(d.warehouse_id)}`,
        badges: [{ label: "Updated", color: "blue" }],
        fields: [
          { label: "SKU", value: safeStr(d.sku_id) },
          { label: "Warehouse", value: safeStr(d.warehouse_id) },
        ],
      };
    }

    // --- Disruptions ---
    case "disruption_published":
    case "disruption_injected": {
      const skus = Array.isArray(d.affected_skus) ? d.affected_skus as string[] : [];
      const routes = Array.isArray(d.affected_routes) ? d.affected_routes as string[] : [];
      const severity = (d.severity as string) || "medium";
      const severityColor: EventBadge["color"] =
        severity === "high" ? "red" : severity === "medium" ? "orange" : "amber";
      return {
        title: eventType === "disruption_injected" ? "Disruption Injected" : "Disruption Published",
        subtitle: safeStr(d.title),
        badges: [
          { label: severity.toUpperCase(), color: severityColor },
          { label: safeStr(d.type || d.disruption_type), color: "purple" },
          ...(skus.length > 0 ? [{ label: `${skus.length} SKUs`, color: "gray" as EventBadge["color"] }] : []),
          ...(routes.length > 0 ? [{ label: `${routes.length} routes`, color: "gray" as EventBadge["color"] }] : []),
        ],
        fields: [
          { label: "Title", value: safeStr(d.title) },
          { label: "Type", value: safeStr(d.type || d.disruption_type) },
          { label: "Severity", value: severity },
          { label: "Affected SKUs", value: skus.length > 0 ? skus.join(", ") : "None" },
          { label: "Affected Routes", value: routes.length > 0 ? routes.join(", ") : "None" },
          { label: "Sim Date", value: safeStr(d.sim_clock || d.sim_date) },
        ],
      };
    }

    // --- Agent reasoning ---
    case "agent_reasoning": {
      const summary = (d.summary || {}) as Record<string, unknown>;
      const topRecs = Array.isArray(d.top_recommendations)
        ? (d.top_recommendations as Record<string, unknown>[])
        : [];
      const topRec = topRecs[0];
      const actions = Array.isArray(d.actions) ? d.actions : [];
      const feasibleCount = getNum(summary.feasible_actions) ?? 0;
      return {
        title: `Agent Cycle ${safeStr(d.cycle)}`,
        subtitle: safeStr(d.trigger),
        badges: [
          { label: `${getNum(summary.imbalances_found) ?? 0} findings`, color: "amber" },
          { label: `${feasibleCount} actions`, color: feasibleCount > 0 ? "green" : "gray" },
          ...(getNum(summary.disruptions_active) ?? 0 > 0
            ? [{ label: "Disruption active", color: "red" as EventBadge["color"] }]
            : []),
        ],
        fields: [
          { label: "Cycle", value: safeStr(d.cycle) },
          { label: "Trigger", value: safeStr(d.trigger) },
          { label: "SKUs Monitored", value: safeStr(summary.skus_monitored) },
          { label: "Imbalances Found", value: safeStr(summary.imbalances_found) },
          { label: "Recommendations", value: safeStr(summary.recommendations_generated) },
          { label: "Feasible Actions", value: safeStr(summary.feasible_actions) },
          { label: "Disruptions Active", value: safeStr(summary.disruptions_active) },
          ...(topRec
            ? [
                { label: "Top Rec", value: `${safeStr(topRec.quantity)} units ${safeStr(topRec.from)}→${safeStr(topRec.to)}` },
                { label: "Net Benefit", value: formatAED(topRec.net_benefit) },
              ]
            : []),
        ],
      };
    }

    case "agent_error": {
      return {
        title: "Agent Error",
        subtitle: `Cycle ${safeStr(d.cycle)}`,
        badges: [{ label: "ERROR", color: "red" }],
        fields: [
          { label: "Cycle", value: safeStr(d.cycle) },
          { label: "Trigger", value: safeStr(d.trigger) },
          { label: "Error", value: safeStr(d.error) },
        ],
      };
    }

    // --- Recommendations ---
    case "recommendation_generated":
    case "recommendation_updated": {
      return {
        title: eventType === "recommendation_generated" ? "Recommendation Generated" : "Recommendation Updated",
        subtitle: safeStr(d.description),
        badges: [
          { label: "AI", color: "purple" },
        ],
        fields: [
          { label: "Description", value: safeStr(d.description) },
          { label: "Sim Day", value: safeStr(d.sim_day) },
          { label: "Sim Date", value: safeStr(d.sim_clock) },
        ],
      };
    }

    // --- Imbalance ---
    case "imbalance_detected": {
      return {
        title: "Imbalance Detected",
        subtitle: safeStr(d.description),
        badges: [{ label: "Warning", color: "orange" }],
        fields: [
          { label: "Description", value: safeStr(d.description) },
          { label: "Sim Day", value: safeStr(d.sim_day) },
          { label: "Sim Date", value: safeStr(d.sim_clock) },
        ],
      };
    }

    // --- Transfers ---
    case "transfer_approved":
    case "transfer_rejected":
    case "transfer_in_transit":
    case "transfer_completed":
    case "transfer_proposed": {
      const statusMap: Record<string, string> = {
        transfer_approved: "Approved",
        transfer_rejected: "Rejected",
        transfer_in_transit: "In Transit",
        transfer_completed: "Completed",
        transfer_proposed: "Proposed",
      };
      const status = statusMap[eventType] || "Transfer";
      const colorMap: Record<string, EventBadge["color"]> = {
        transfer_approved: "green",
        transfer_rejected: "red",
        transfer_in_transit: "blue",
        transfer_completed: "green",
        transfer_proposed: "purple",
      };
      return {
        title: `Transfer ${status}`,
        subtitle: `${safeStr(d.sku_id)} · ${safeStr(d.from_warehouse || d.from)}→${safeStr(d.to_warehouse || d.to)}`,
        badges: [
          { label: status, color: colorMap[eventType] || "gray" },
          ...(d.quantity ? [{ label: `${safeStr(d.quantity)} units`, color: "gray" as EventBadge["color"] }] : []),
        ],
        fields: [
          { label: "SKU", value: safeStr(d.sku_id) },
          { label: "From", value: safeStr(d.from_warehouse || d.from) },
          { label: "To", value: safeStr(d.to_warehouse || d.to) },
          { label: "Quantity", value: `${safeStr(d.quantity)} units` },
          { label: "Net Benefit", value: formatAED(d.net_benefit) },
        ],
      };
    }

    case "prompt_approval": {
      return {
        title: "Approval Prompted",
        subtitle: safeStr(d.description),
        badges: [{ label: "Human", color: "blue" }],
        fields: [
          { label: "Description", value: safeStr(d.description) },
          { label: "Sim Day", value: safeStr(d.sim_day) },
          { label: "Sim Date", value: safeStr(d.sim_clock) },
        ],
      };
    }

    // --- Simulator control ---
    case "sim_clock_tick": {
      return {
        title: `Sim Day ${safeStr(d.sim_day)}`,
        subtitle: safeStr(d.sim_clock),
        badges: [{ label: "Clock", color: "gray" }],
        fields: [
          { label: "Sim Day", value: safeStr(d.sim_day) },
          { label: "Sim Date", value: safeStr(d.sim_clock) },
          { label: "Scenario", value: safeStr(d.scenario) },
        ],
      };
    }

    case "simulator_started": {
      return {
        title: "Simulation Started",
        subtitle: `Scenario ${safeStr(d.scenario)}`,
        badges: [{ label: "Running", color: "green" }],
        fields: [
          { label: "Scenario", value: safeStr(d.scenario) },
          { label: "Title", value: safeStr(d.title) },
          { label: "Sim Date", value: safeStr(d.sim_clock) },
          { label: "Speed", value: `${safeStr(d.speed)}x` },
        ],
      };
    }

    case "simulator_paused": {
      return {
        title: "Simulation Paused",
        subtitle: safeStr(d.sim_clock),
        badges: [{ label: "Paused", color: "amber" }],
        fields: [{ label: "Sim Date", value: safeStr(d.sim_clock) }],
      };
    }

    case "simulator_resumed": {
      return {
        title: "Simulation Resumed",
        subtitle: safeStr(d.sim_clock),
        badges: [{ label: "Running", color: "green" }],
        fields: [{ label: "Sim Date", value: safeStr(d.sim_clock) }],
      };
    }

    case "simulator_stopped": {
      return {
        title: "Simulation Stopped",
        subtitle: safeStr(d.sim_clock),
        badges: [{ label: "Stopped", color: "gray" }],
        fields: [{ label: "Sim Date", value: safeStr(d.sim_clock) }],
      };
    }

    case "simulator_reset": {
      return {
        title: "Simulation Reset",
        subtitle: safeStr(d.sim_clock),
        badges: [{ label: "Reset", color: "gray" }],
        fields: [{ label: "Sim Date", value: safeStr(d.sim_clock) }],
      };
    }

    case "simulator_seek": {
      return {
        title: "Simulation Seek",
        subtitle: safeStr(d.sim_clock),
        badges: [{ label: "Seek", color: "blue" }],
        fields: [{ label: "Sim Date", value: safeStr(d.sim_clock) }],
      };
    }

    case "connected": {
      return {
        title: "WebSocket Connected",
        subtitle: "Real-time stream active",
        badges: [{ label: "Live", color: "green" }],
        fields: [],
      };
    }

    // --- Fallback ---
    default: {
      return {
        title: eventType,
        subtitle: "",
        badges: [],
        fields: Object.entries(d)
          .slice(0, 6)
          .map(([key, val]) => ({ label: key, value: safeStr(val) })),
      };
    }
  }
}

/**
 * Get the badge color class for a given color name.
 */
export function badgeColorClass(color: EventBadge["color"]): string {
  const map: Record<EventBadge["color"], string> = {
    red: "bg-red-950/40 border-red-900/60 text-red-400",
    orange: "bg-orange-950/40 border-orange-900/60 text-orange-400",
    amber: "bg-amber-950/40 border-amber-900/60 text-amber-400",
    blue: "bg-blue-950/40 border-blue-900/60 text-blue-400",
    green: "bg-green-950/40 border-green-900/60 text-green-400",
    purple: "bg-purple-950/40 border-purple-900/60 text-purple-400",
    gray: "bg-buddy-border/40 border-buddy-border text-buddy-muted",
  };
  return map[color] || map.gray;
}

/**
 * Get all unique event types from a list of events (for filter UI).
 */
export function getEventTypes(events: { type: string }[]): string[] {
  const types = new Set<string>();
  for (const e of events) {
    if (e.type) types.add(e.type);
  }
  return Array.from(types).sort();
}
