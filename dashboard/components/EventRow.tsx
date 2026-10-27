"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ExternalLink, ArrowRight, Package } from "lucide-react";
import Link from "next/link";
import { formatEvent, badgeColorClass, type FormattedEvent } from "@/lib/eventFormatter";

interface EventRowProps {
  eventType: string;
  data: Record<string, unknown> | undefined;
  simDate?: string;
  realTimestamp?: string;
  defaultExpanded?: boolean;
  compact?: boolean;
}

/**
 * Shared event row — renders a structured event with badges,
 * expandable detail fields, and contextual "jump to" links.
 *
 * Clicking a jump link navigates to:
 *  - /dashboard?warehouse=DXB  (inventory view filtered by warehouse)
 *  - /imbalances               (imbalance flags)
 *  - /actions                  (recommended actions)
 *  - /simulator                (live simulator)
 */
export function EventRow({
  eventType,
  data,
  simDate,
  realTimestamp,
  defaultExpanded = false,
  compact = false,
}: EventRowProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const fmt: FormattedEvent = formatEvent(eventType, data);
  const d = data || {};

  // Build navigation links based on event type and data
  const navLinks = buildNavLinks(eventType, d);

  return (
    <div
      className={`rounded-lg bg-buddy-bg border border-buddy-border ${
        compact ? "p-2.5" : "p-3"
      }`}
    >
      {/* Top row: title + badges */}
      <div className="flex items-start gap-2">
        <button
          onClick={() => fmt.fields.length > 0 && setExpanded(!expanded)}
          className="flex-1 min-w-0 text-left"
          disabled={fmt.fields.length === 0}
        >
          <p className={`font-medium text-buddy-text ${compact ? "text-xs" : "text-sm"}`}>
            {fmt.title}
          </p>
          {fmt.subtitle && (
            <p className="text-xs text-buddy-muted truncate mt-0.5">{fmt.subtitle}</p>
          )}
        </button>

        {/* Badges */}
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          {fmt.badges.map((badge, i) => (
            <span
              key={i}
              className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${badgeColorClass(badge.color)}`}
            >
              {badge.label}
            </span>
          ))}
          {fmt.fields.length > 0 && (
            <ChevronDown
              className={`w-3.5 h-3.5 text-buddy-muted transition-transform shrink-0 ${
                expanded ? "rotate-180" : ""
              }`}
            />
          )}
        </div>
      </div>

      {/* Expandable detail */}
      <AnimatePresence>
        {expanded && fmt.fields.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className={`grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 mt-2.5 pt-2.5 border-t border-buddy-border`}>
              {fmt.fields.map((field, i) => (
                <div key={i} className="min-w-0">
                  <span className="text-[10px] text-buddy-muted uppercase tracking-wide block">
                    {field.label}
                  </span>
                  <span className="text-xs text-buddy-text font-medium truncate block">
                    {field.value}
                  </span>
                </div>
              ))}
            </div>

            {/* Jump-to navigation links */}
            {navLinks.length > 0 && (
              <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-buddy-border flex-wrap">
                <span className="text-[10px] text-buddy-muted uppercase tracking-wide flex items-center gap-1">
                  <Package className="w-3 h-3" /> Jump to:
                </span>
                {navLinks.map((link, i) => (
                  <Link
                    key={i}
                    href={link.href}
                    className="flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-tradeling-950/40 border border-tradeling-900/50 text-tradeling-300 hover:bg-tradeling-900/40 hover:text-tradeling-200 transition-colors"
                  >
                    {link.label}
                    <ArrowRight className="w-2.5 h-2.5" />
                  </Link>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Build contextual navigation links based on the event type and its data.
 * Returns an array of { href, label } pairs.
 */
function buildNavLinks(
  eventType: string,
  data: Record<string, unknown>
): { href: string; label: string }[] {
  const links: { href: string; label: string }[] = [];
  const skuId = (data.sku_id as string) || undefined;
  const warehouseId = (data.warehouse_id as string) || undefined;
  const fromWh = (data.from_warehouse as string) || (data.from as string) || undefined;
  const toWh = (data.to_warehouse as string) || (data.to as string) || undefined;

  switch (eventType) {
    case "sale_recorded":
    case "inventory_changed":
      // Jump to the inventory map filtered by warehouse
      if (warehouseId) {
        links.push({ href: `/dashboard?warehouse=${warehouseId}`, label: `Stock at ${warehouseId}` });
      }
      if (skuId) {
        links.push({ href: `/imbalances?sku=${skuId}`, label: `Imbalances for ${skuId}` });
      }
      break;

    case "disruption_published":
    case "disruption_injected":
      // Jump to imbalances (to see impact) and actions (to see updated recs)
      links.push({ href: "/imbalances", label: "View Imbalances" });
      links.push({ href: "/actions", label: "Updated Actions" });
      break;

    case "imbalance_detected":
      // Jump to imbalances page
      links.push({ href: "/imbalances", label: "View Imbalances" });
      if (skuId) {
        links.push({ href: `/actions?sku=${skuId}`, label: "Actions for SKU" });
      }
      break;

    case "recommendation_generated":
    case "recommendation_updated":
      // Jump to actions page
      links.push({ href: "/actions", label: "View Actions" });
      if (skuId) {
        links.push({ href: `/dashboard?sku=${skuId}`, label: `Stock for ${skuId}` });
      }
      break;

    case "transfer_approved":
    case "transfer_rejected":
    case "transfer_in_transit":
    case "transfer_completed":
    case "transfer_proposed":
      // Jump to inventory map to see the affected warehouses
      links.push({ href: "/actions", label: "All Actions" });
      if (fromWh) {
        links.push({ href: `/dashboard?warehouse=${fromWh}`, label: `Stock at ${fromWh}` });
      }
      if (toWh) {
        links.push({ href: `/dashboard?warehouse=${toWh}`, label: `Stock at ${toWh}` });
      }
      break;

    case "prompt_approval":
      // Jump to actions page to approve
      links.push({ href: "/actions", label: "Review & Approve" });
      break;

    case "agent_reasoning":
      // Jump to actions and imbalances
      links.push({ href: "/actions", label: "View Actions" });
      links.push({ href: "/imbalances", label: "View Imbalances" });
      break;

    case "simulator_started":
    case "simulator_paused":
    case "simulator_resumed":
    case "simulator_stopped":
    case "simulator_reset":
    case "simulator_seek":
    case "sim_clock_tick":
      // Jump to simulator
      links.push({ href: "/simulator", label: "Simulator" });
      break;

    default:
      break;
  }

  return links;
}
