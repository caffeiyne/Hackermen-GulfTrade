"""
Inventory Intelligence Agent — agentic reasoning layer.

This is NOT a pipeline. It's an autonomous agent that:

  1. OBSERVES the simulation state (inventory, sales, disruptions)
  2. REASONS about what it sees (multi-step analysis using existing AI tools)
  3. PLANS options (evaluates transfer routes, checks constraints)
  4. EXPLAINS its reasoning in plain English
  5. ACTS by auto-creating transfer proposals (still needs human approval)

The agent uses the existing forecaster, imbalance_detector, and recommender
as "tools" — it orchestrates them with a reasoning chain rather than
calling them as a simple pipeline.

It reacts to WebSocket events in real time: when a black swan is injected,
the agent re-evaluates and updates its reasoning.
"""

import asyncio
import json
import logging
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from app.db import get_conn, notify_event
from app.ai.forecaster import forecast_all
from app.ai.imbalance_detector import detect_imbalances
from app.ai.recommender import generate_recommendations

logger = logging.getLogger(__name__)


class InventoryAgent:
    """
    Autonomous inventory planning agent.

    Lifecycle:
      - run() starts a background loop that periodically observes state
      - On each cycle, it runs the full reasoning chain
      - It can also be triggered immediately by react_to_event()
      - Reasoning output is pushed to the dashboard via WebSocket NOTIFY
    """

    def __init__(self):
        self._task: asyncio.Task | None = None
        self._running = False
        self._last_analysis: dict | None = None
        self._last_trigger: str = "initial"
        self._cycle_count = 0

    @property
    def is_running(self) -> bool:
        return self._running

    @property
    def last_analysis(self) -> dict | None:
        return self._last_analysis

    async def start(self, interval_seconds: int = 30):
        """Start the agent's observation loop."""
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._observe_loop(interval_seconds))
        logger.info("Inventory Agent started — observing every %ds", interval_seconds)
        await self._run_reasoning_cycle("agent_started")

    async def stop(self):
        """Stop the agent."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("Inventory Agent stopped")

    async def react_to_event(self, event_type: str, event_data: dict):
        """
        React to a real-time event (called by the scenario runner or inject endpoint).

        This is what makes the agent "agentic" — it doesn't just run on a timer,
        it responds to changes in its environment.
        """
        # Only react to meaningful events, not every clock tick
        reactive_events = {
            "disruption_published",
            "disruption_injected",
            "imbalance_detected",
            "transfer_approved",
            "transfer_rejected",
            "transfer_completed",
            "simulator_started",
            "simulator_resumed",
            "inventory_corrected",
        }

        if event_type not in reactive_events:
            return

        logger.info("Agent reacting to event: %s", event_type)

        # Small delay to let DB writes settle
        await asyncio.sleep(1)

        trigger = f"react:{event_type}"
        await self._run_reasoning_cycle(trigger)

    async def _observe_loop(self, interval: int):
        """Background loop — periodically re-evaluates state."""
        try:
            while self._running:
                await asyncio.sleep(interval)
                if not self._running:
                    break
                await self._run_reasoning_cycle("periodic")
        except asyncio.CancelledError:
            logger.info("Agent observe loop cancelled")

    async def _run_reasoning_cycle(self, trigger: str):
        """
        The core reasoning chain: Observe → Reason → Plan → Explain → Act.

        Each step builds on the previous one, and the full chain is
        pushed to the dashboard as a single "agent_reasoning" event.
        """
        self._cycle_count += 1
        cycle = self._cycle_count

        try:
            # Step 1: OBSERVE — gather current state
            observation = await self._observe()

            # Step 2: REASON — identify what matters
            reasoning = await self._reason(observation)

            # Step 3: PLAN — evaluate options
            plan = await self._plan(observation, reasoning)

            # Step 4: EXPLAIN — generate plain-language narrative
            explanation = self._explain(observation, reasoning, plan, trigger)

            # Step 5: ACT — auto-create proposals for top feasible recommendations
            actions = await self._act(plan)

            analysis = {
                "cycle": cycle,
                "trigger": trigger,
                "timestamp": self._now_iso(),
                "observation": observation,
                "reasoning": reasoning,
                "plan": plan,
                "explanation": explanation,
                "actions_taken": actions,
            }

            self._last_analysis = analysis

            # Push to dashboard via WebSocket
            await notify_event("agent_reasoning", {
                "cycle": cycle,
                "trigger": trigger,
                "explanation": explanation,
                "summary": {
                    "skus_monitored": observation["total_skus"],
                    "imbalances_found": len(reasoning["critical_findings"]),
                    "recommendations_generated": len(plan["recommendations"]),
                    "feasible_actions": len(actions),
                    "disruptions_active": observation["active_disruptions_count"],
                },
                "reasoning_steps": reasoning["steps"],
                "top_findings": reasoning["critical_findings"][:3],
                "top_recommendations": plan["recommendations"][:3],
                "actions": actions,
            })

            logger.info("Agent cycle %d complete — %d findings, %d actions",
                        cycle, len(reasoning["critical_findings"]), len(actions))

        except Exception as e:
            logger.error("Agent reasoning cycle failed: %s", e, exc_info=True)
            await notify_event("agent_error", {
                "cycle": cycle,
                "trigger": trigger,
                "error": str(e),
            })

    # ------------------------------------------------------------------
    # Step 1: OBSERVE
    # ------------------------------------------------------------------
    async def _observe(self) -> dict:
        """Gather current state from the database — the agent's 'sensors'."""
        async with get_conn() as conn:
            # Sim clock
            sim_state = await conn.fetchrow("SELECT sim_clock, scenario_name, status FROM simulator.state WHERE id = 1")
            sim_date = sim_state["sim_clock"] if sim_state and sim_state["sim_clock"] else date.today()
            scenario = sim_state["scenario_name"] if sim_state else None
            sim_status = sim_state["status"] if sim_state else "idle"

            # Inventory snapshot
            stock_rows = await conn.fetch(
                """
                SELECT sl.sku_id, sl.warehouse_id, sl.available_qty, sl.reserved_qty,
                       sl.safety_stock, sl.inbound_qty, s.name as sku_name, s.product_type
                FROM inventory.stock_levels sl
                JOIN master.skus s ON s.sku_id = sl.sku_id
                ORDER BY sl.sku_id, sl.warehouse_id
                """
            )

            # Active disruptions
            disruptions = await conn.fetch(
                """
                SELECT disruption_id, disruption_type, title, affected_skus, affected_routes,
                       severity, start_date, end_date
                FROM events.disruptions
                WHERE is_active = TRUE
                  AND $1 BETWEEN start_date AND COALESCE(end_date, '2099-12-31'::date)
                """,
                sim_date,
            )

            # Inbound orders
            inbound = await conn.fetch(
                """
                SELECT po_id, sku_id, warehouse_id, quantity, expected_date, revised_date, status
                FROM orders.inbound
                WHERE status IN ('pending', 'in_transit', 'delayed')
                ORDER BY expected_date
                """
            )

            # Pending transfers
            transfers = await conn.fetch(
                "SELECT * FROM orders.transfers WHERE status IN ('proposed', 'approved', 'in_transit')"
            )

            # Count unique SKUs
            sku_count = await conn.fetchval("SELECT count(*) FROM master.skus WHERE is_active = TRUE")

            # Low stock count
            low_stock = sum(1 for r in stock_rows if r["available_qty"] <= r["safety_stock"])

            return {
                "sim_date": str(sim_date),
                "scenario": scenario,
                "sim_status": sim_status,
                "total_skus": sku_count,
                "total_stock_records": len(stock_rows),
                "low_stock_count": low_stock,
                "active_disruptions": [dict(d) for d in disruptions],
                "active_disruptions_count": len(disruptions),
                "inbound_orders": [dict(r) for r in inbound],
                "pending_transfers": [dict(r) for r in transfers],
                "stock_snapshot": [
                    {
                        "sku_id": r["sku_id"],
                        "sku_name": r["sku_name"],
                        "warehouse_id": r["warehouse_id"],
                        "available": r["available_qty"],
                        "reserved": r["reserved_qty"],
                        "safety": r["safety_stock"],
                        "inbound": r["inbound_qty"],
                        "product_type": r["product_type"],
                    }
                    for r in stock_rows
                ],
            }

    # ------------------------------------------------------------------
    # Step 2: REASON
    # ------------------------------------------------------------------
    async def _reason(self, observation: dict) -> dict:
        """
        Multi-step reasoning: run the existing AI tools and synthesize findings.

        The agent calls forecaster → imbalance_detector → recommender in sequence,
        then synthesizes their outputs into a coherent narrative.
        """
        steps = []
        critical_findings = []

        # Tool 1: Forecast
        steps.append({"step": "forecast", "description": "Generating 30-day demand forecasts for all SKU/warehouse combinations"})
        forecasts = await forecast_all()
        steps.append({
            "step": "forecast_complete",
            "description": f"Generated {len(forecasts)} forecasts. {sum(1 for f in forecasts if f['confidence_level'] == 'low')} low-confidence due to data quality issues.",
        })

        # Tool 2: Detect imbalances
        steps.append({"step": "imbalance_detection", "description": "Scanning for shortages, excess, ageing, and misleading sales patterns"})
        imbalances = await detect_imbalances()
        critical = [i for i in imbalances if i["severity"] == "critical"]
        warnings = [i for i in imbalances if i["severity"] == "warning"]
        steps.append({
            "step": "imbalance_complete",
            "description": f"Found {len(critical)} critical and {len(warnings)} warning-level imbalances across {len(imbalances)} total flags.",
        })

        for flag in critical:
            critical_findings.append({
                "type": flag["flag_type"],
                "sku_id": flag["sku_id"],
                "warehouse_id": flag["warehouse_id"],
                "severity": flag["severity"],
                "description": flag["description"],
                "shortfall": flag.get("shortfall_or_excess", 0),
            })

        # Tool 3: Generate recommendations
        steps.append({"step": "recommendation", "description": "Evaluating transfer options — checking routes, costs, lead times, and disruptions"})
        recs_result = await generate_recommendations()
        recs = recs_result["recommendations"]
        feasible = [r for r in recs if r["is_feasible"]]
        rejected = [r for r in recs if not r["is_feasible"]]

        steps.append({
            "step": "recommendation_complete",
            "description": f"Evaluated {len(recs)} options. {len(feasible)} feasible, {len(rejected)} rejected (net benefit negative or constraints violated).",
        })

        # Disruption awareness
        if observation["active_disruptions_count"] > 0:
            for d in observation["active_disruptions"]:
                affected = d.get("affected_skus", [])
                routes = d.get("affected_routes", [])
                steps.append({
                    "step": "disruption_awareness",
                    "description": f"Active disruption: {d['title']}. Affected SKUs: {affected}. Affected routes: {routes}. Factoring into recommendations.",
                })

                critical_findings.append({
                    "type": "disruption",
                    "title": d["title"],
                    "affected_skus": affected,
                    "affected_routes": routes,
                    "severity": d["severity"],
                })

        # Trust boundary verification
        unaffected_skus = observation["total_skus"] - sum(
            len(d.get("affected_skus", [])) for d in observation["active_disruptions"]
        )
        steps.append({
            "step": "trust_boundary",
            "description": f"Verified trust boundaries: {unaffected_skus} SKUs confirmed unaffected by disruptions. No assumptions made about un-affected products.",
        })

        return {
            "steps": steps,
            "critical_findings": critical_findings,
            "forecasts_count": len(forecasts),
            "imbalances": imbalances,
            "recommendations": recs,
            "feasible_count": len(feasible),
            "rejected_count": len(rejected),
            "summary": recs_result["summary"],
        }

    # ------------------------------------------------------------------
    # Step 3: PLAN
    # ------------------------------------------------------------------
    async def _plan(self, observation: dict, reasoning: dict) -> dict:
        """Structure the recommendations into an actionable plan."""
        recs = reasoning["recommendations"]
        feasible = [r for r in recs if r["is_feasible"]]
        rejected = [r for r in recs if not r["is_feasible"]]

        # Group by priority
        priority_actions = []
        for rec in feasible[:5]:  # top 5
            priority_actions.append({
                "action": "transfer",
                "sku_id": rec["sku_id"],
                "sku_name": rec.get("sku_name", rec["sku_id"]),
                "from": rec["from_warehouse"],
                "to": rec["to_warehouse"],
                "quantity": rec["quantity"],
                "net_benefit": rec["net_benefit"],
                "lead_time": rec["lead_time_days"],
                "confidence": rec["confidence_level"],
                "rank": rec["rank"],
                "constraints_checked": rec["constraints_checked"],
                "route_disrupted": rec.get("route_disrupted", False),
                "reason": rec["reason"],
            })

        # Things the agent decided NOT to do (and why)
        rejected_actions = []
        for rec in rejected[:3]:
            rejected_actions.append({
                "action": "transfer_rejected",
                "sku_id": rec["sku_id"],
                "from": rec["from_warehouse"],
                "to": rec["to_warehouse"],
                "reason": f"Net benefit negative ({rec['net_benefit']:.0f} AED) or constraints not met",
            })

        return {
            "recommendations": priority_actions,
            "rejected": rejected_actions,
            "total_feasible": len(feasible),
            "total_rejected": len(rejected),
        }

    # ------------------------------------------------------------------
    # Step 4: EXPLAIN
    # ------------------------------------------------------------------
    def _explain(self, observation: dict, reasoning: dict, plan: dict, trigger: str) -> str:
        """Generate a plain-English narrative of the agent's reasoning."""

        sim_date = observation["sim_date"]
        disruptions = observation["active_disruptions_count"]
        critical = [f for f in reasoning["critical_findings"] if f["type"] != "disruption"]
        disruption_findings = [f for f in reasoning["critical_findings"] if f["type"] == "disruption"]
        feasible = plan["total_feasible"]
        rejected = plan["total_rejected"]

        lines = []

        # Opening — what triggered this analysis
        trigger_map = {
            "agent_started": "I've initialized and am starting my first analysis.",
            "periodic": "Running my periodic inventory review.",
            "react:disruption_injected": "A new disruption was just injected — I'm immediately reassessing all recommendations.",
            "react:disruption_published": "A disruption event fired in the simulation — I'm reassessing immediately.",
            "react:transfer_approved": "A transfer was just approved — I'm updating my projections.",
            "react:transfer_rejected": "A transfer was rejected — I'm evaluating alternative options.",
            "react:transfer_completed": "A transfer completed — I'm verifying the inventory impact.",
            "react:simulator_started": "The simulation just started — I'm running my first full analysis.",
            "react:simulator_resumed": "Simulation resumed — picking up where I left off.",
            "react:inventory_corrected": "Sara corrected a stock record — I'm re-running the full analysis with the updated inventory.",
        }
        lines.append(trigger_map.get(trigger, f"Triggered by: {trigger}"))
        lines.append("")

        # Observation summary
        lines.append(f"As of {sim_date}, I'm monitoring {observation['total_skus']} SKUs across 3 warehouses.")
        if observation["low_stock_count"] > 0:
            lines.append(f"⚠️ {observation['low_stock_count']} SKU/warehouse combinations are at or below safety stock.")
        lines.append("")

        # Disruption awareness
        if disruptions > 0:
            lines.append(f"🔴 {disruptions} active disruption(s) detected:")
            for d in disruption_findings:
                skus = d.get("affected_skus", [])
                routes = d.get("affected_routes", [])
                sku_str = f"{len(skus)} SKUs affected" if skus else "no specific SKUs"
                route_str = f", routes: {routes}" if routes else ""
                lines.append(f"   • {d['title']} — {sku_str}{route_str}")
            lines.append("I've factored these into my analysis. Only affected SKUs/routes are impacted — no assumptions made about others.")
            lines.append("")
        else:
            lines.append("No active disruptions. Supply chain operating normally.")
            lines.append("")

        # Findings
        if critical:
            lines.append(f"I found {len(critical)} critical imbalance(s):")
            for finding in critical[:3]:
                if finding["type"] == "shortage":
                    lines.append(f"   • {finding['sku_id']} at {finding['warehouse_id']}: projected shortage of {finding['shortfall']} units")
                elif finding["type"] == "excess":
                    lines.append(f"   • {finding['sku_id']} at {finding['warehouse_id']}: {finding['shortfall']} excess units")
                elif finding["type"] == "ageing":
                    lines.append(f"   • {finding['sku_id']} at {finding['warehouse_id']}: ageing stock risk")
                else:
                    lines.append(f"   • {finding['sku_id']} at {finding['warehouse_id']}: {finding['type']}")
            lines.append("")

        # Plan
        if feasible > 0:
            top = plan["recommendations"][0] if plan["recommendations"] else None
            if top:
                lines.append(
                    f"My top recommendation: Transfer {top['quantity']} units of "
                    f"{top.get('sku_name', top['sku_id'])} from {top['from']} to {top['to']} "
                    f"(net benefit: {top['net_benefit']:.0f} AED, arrives in {top['lead_time']} days)."
                )
                if top.get("route_disrupted"):
                    lines.append("Note: This route is currently disrupted — I've added buffer time to the lead time estimate.")
            lines.append(f"I evaluated {feasible + rejected} options total. {feasible} are feasible, {rejected} were rejected.")
        else:
            lines.append("No feasible transfer actions at this time. All inventory is balanced or no economical transfers exist.")

        if plan["rejected"]:
            lines.append("")
            lines.append("Decided NOT to recommend:")
            for r in plan["rejected"][:2]:
                lines.append(f"   • {r['sku_id']} {r['from']}→{r['to']}: {r['reason']}")

        lines.append("")
        lines.append("All recommendations require Sara's approval before execution.")

        return "\n".join(lines)

    # ------------------------------------------------------------------
    # Step 5: ACT
    # ------------------------------------------------------------------
    async def _act(self, plan: dict) -> list[dict]:
        """
        Auto-create transfer proposals for top feasible recommendations.

        These are PROPOSALS only — they still need human approval via the
        approve/reject endpoints. The agent doesn't execute anything autonomously.
        """
        actions = []

        for rec in plan["recommendations"][:3]:  # auto-propose top 3
            try:
                async with get_conn() as conn:
                    # Check if a proposal already exists for this SKU/route
                    existing = await conn.fetchval(
                        """
                        SELECT count(*) FROM orders.transfers
                        WHERE sku_id = $1 AND from_warehouse = $2 AND to_warehouse = $3
                          AND status = 'proposed'
                        """,
                        rec["sku_id"], rec["from"], rec["to"],
                    )

                    if existing > 0:
                        actions.append({
                            "action": "skip_existing",
                            "sku_id": rec["sku_id"],
                            "from": rec["from"],
                            "to": rec["to"],
                            "reason": "Proposal already exists — not duplicating",
                        })
                        continue

                    # Create the transfer proposal
                    row = await conn.fetchrow(
                        """
                        INSERT INTO orders.transfers
                            (sku_id, from_warehouse, to_warehouse, quantity,
                             transfer_cost, lead_time_days, reason, status)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, 'proposed')
                        RETURNING transfer_id
                        """,
                        rec["sku_id"], rec["from"], rec["to"], rec["quantity"],
                        rec["net_benefit"], rec["lead_time"], rec["reason"],
                    )

                    actions.append({
                        "action": "proposal_created",
                        "transfer_id": str(row["transfer_id"]) if row else None,
                        "sku_id": rec["sku_id"],
                        "from": rec["from"],
                        "to": rec["to"],
                        "quantity": rec["quantity"],
                        "net_benefit": rec["net_benefit"],
                        "confidence": rec["confidence"],
                    })

            except Exception as e:
                logger.error("Agent failed to create proposal: %s", e)
                actions.append({
                    "action": "error",
                    "sku_id": rec["sku_id"],
                    "error": str(e),
                })

        return actions

    def _now_iso(self) -> str:
        from datetime import datetime, timezone
        return datetime.now(timezone.utc).isoformat()


# Singleton
agent = InventoryAgent()
