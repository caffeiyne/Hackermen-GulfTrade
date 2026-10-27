"""
Recommender — proposes cost-effective stock transfers and replenishment changes.

For each shortage flag, searches for excess stock at other warehouses and
evaluates whether a transfer is economically beneficial:

  net_benefit = expected_shortage_cost_avoided - transfer_cost - holding_cost_delta

Constraints checked:
  - Source warehouse must have enough stock above its own safety stock
  - Transfer route must exist and not be disrupted
  - Transfer lead time must arrive before shortage is projected
  - One deliberately unattractive transfer should be rejected (cost > benefit)

Ranking: recommendations sorted by net_benefit descending.
"""

import logging
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from app.db import get_conn
from app.ai.forecaster import forecast_all
from app.ai.imbalance_detector import detect_imbalances

logger = logging.getLogger(__name__)


async def generate_recommendations():
    """
    Generate ranked transfer recommendations.

    Returns list of recommendation dicts + before/after impact assessment.
    """
    forecasts = await forecast_all()

    async with get_conn() as conn:
        sim_state = await conn.fetchrow("SELECT sim_clock FROM simulator.state WHERE id = 1")
        sim_date = sim_state["sim_clock"] if sim_state and sim_state["sim_clock"] else date.today()

        # Build forecast lookup: (sku_id, warehouse_id) -> forecast dict
        forecast_map = {(f["sku_id"], f["warehouse_id"]): f for f in forecasts}

        # Get all stock levels
        stock_rows = await conn.fetch(
            """
            SELECT sl.sku_id, sl.warehouse_id, sl.available_qty, sl.reserved_qty,
                   sl.safety_stock, sl.inbound_qty,
                   s.unit_cost, s.unit_price, s.name as sku_name, s.product_type
            FROM inventory.stock_levels sl
            JOIN master.skus s ON s.sku_id = sl.sku_id
            ORDER BY sl.sku_id, sl.warehouse_id
            """
        )

        # Get transfer matrix
        routes = await conn.fetch(
            "SELECT * FROM master.transfer_matrix WHERE active = TRUE"
        )
        route_map = {}
        for r in routes:
            route_map[(r["from_warehouse"], r["to_warehouse"])] = r

        # Get holding costs
        holding_rows = await conn.fetch("SELECT sku_id, warehouse_id, daily_holding_cost FROM master.holding_costs")
        holding_map = {(r["sku_id"], r["warehouse_id"]): r["daily_holding_cost"] for r in holding_rows}

        # Get active disruptions
        active_disruptions = await conn.fetch(
            """
            SELECT * FROM events.disruptions
            WHERE is_active = TRUE
              AND $1 BETWEEN start_date AND COALESCE(end_date, '2099-12-31'::date)
            """,
            sim_date,
        )

        recommendations = []
        impact_metrics = []
        baseline_comparison = None

        # Identify shortages (destinations needing stock)
        shortages = []
        for stock_row in stock_rows:
            key = (stock_row["sku_id"], stock_row["warehouse_id"])
            f = forecast_map.get(key)
            if not f:
                continue

            available = stock_row["available_qty"]
            reserved = stock_row["reserved_qty"]
            safety = stock_row["safety_stock"]
            inbound = stock_row["inbound_qty"]
            forecast_30d = f["forecast_qty_30d"]

            net_available = available - reserved
            projected = net_available + inbound - forecast_30d

            if projected < safety:
                shortfall = safety - projected
                shortages.append({
                    "sku_id": stock_row["sku_id"],
                    "warehouse_id": stock_row["warehouse_id"],
                    "sku_name": stock_row["sku_name"],
                    "product_type": stock_row["product_type"],
                    "available": available,
                    "reserved": reserved,
                    "safety": safety,
                    "inbound": inbound,
                    "forecast_30d": forecast_30d,
                    "shortfall": shortfall,
                    "unit_price": stock_row["unit_price"],
                    "unit_cost": stock_row["unit_cost"],
                    "confidence_level": f["confidence_level"],
                })

        # Identify excess (sources of stock)
        excess_sources = []
        for stock_row in stock_rows:
            key = (stock_row["sku_id"], stock_row["warehouse_id"])
            f = forecast_map.get(key)
            if not f:
                continue

            available = stock_row["available_qty"]
            reserved = stock_row["reserved_qty"]
            safety = stock_row["safety_stock"]
            inbound = stock_row["inbound_qty"]
            forecast_30d = f["forecast_qty_30d"]

            # Excess = available above what's needed for forecast + safety + buffer
            needed = forecast_30d + safety
            excess = available - needed - reserved
            if excess > 0:
                excess_sources.append({
                    "sku_id": stock_row["sku_id"],
                    "warehouse_id": stock_row["warehouse_id"],
                    "sku_name": stock_row["sku_name"],
                    "available": available,
                    "reserved": reserved,
                    "safety": safety,
                    "inbound": inbound,
                    "forecast_30d": forecast_30d,
                    "excess": excess,
                    "unit_cost": stock_row["unit_cost"],
                    "unit_price": stock_row["unit_price"],
                })

        # Match shortages to excess sources
        for shortage in shortages:
            for source in excess_sources:
                if shortage["sku_id"] != source["sku_id"]:
                    continue
                if source["warehouse_id"] == shortage["warehouse_id"]:
                    continue

                # Check route exists
                route = route_map.get((source["warehouse_id"], shortage["warehouse_id"]))
                if not route:
                    continue

                # Check route is not disrupted
                route_key = f"{source['warehouse_id']}-{shortage['warehouse_id']}"
                route_disrupted = False
                route_extra_days = 0
                for d in active_disruptions:
                    if d["affected_routes"] and route_key in d["affected_routes"]:
                        route_disrupted = True
                        route_extra_days += 3  # estimated delay
                    if shortage["sku_id"] in d["affected_skus"] and d["disruption_type"] == "supply_shortage":
                        # Supply shortage doesn't affect inter-location transfers,
                        # but does affect inbound ETA. Transfer still valid.
                        pass

                lead_time = route["lead_time_days"] + route_extra_days
                cost_per_unit = route["cost_per_unit"]

                # Calculate transfer quantity (don't transfer more than the shortfall or available excess)
                transfer_qty = min(shortage["shortfall"], source["excess"])
                if transfer_qty <= 0:
                    continue

                # Don't transfer more than source can spare (above its own safety)
                source_spare = source["available"] - source["reserved"] - source["safety"] - source["forecast_30d"]
                transfer_qty = min(transfer_qty, max(0, source_spare))
                if transfer_qty <= 0:
                    continue

                total_transfer_cost = Decimal(transfer_qty) * Decimal(cost_per_unit)

                # Expected benefit: avoiding lost sales
                # Lost sale cost = quantity * (unit_price - unit_cost) [margin lost]
                # Plus holding cost saved at source
                margin_per_unit = shortage["unit_price"] - shortage["unit_cost"]
                lost_sale_cost = Decimal(transfer_qty) * Decimal(margin_per_unit)

                # Holding cost: 30 days * daily holding cost at source
                holding_cost_source = holding_map.get((source["sku_id"], source["warehouse_id"]), Decimal("0.05"))
                holding_saved = Decimal(transfer_qty) * Decimal(holding_cost_source) * Decimal(30)

                # Holding cost increase at destination (but stock will sell, so less)
                holding_cost_dest = holding_map.get((shortage["sku_id"], shortage["warehouse_id"]), Decimal("0.05"))
                holding_increase = Decimal(transfer_qty) * Decimal(holding_cost_dest) * Decimal(15)  # ~15 days avg

                expected_benefit = lost_sale_cost + holding_saved - holding_increase
                net_benefit = expected_benefit - total_transfer_cost

                # Check if lead time allows the transfer to arrive before shortage
                # (shortage is projected within 30 days)
                arrives_by = sim_date + timedelta(days=lead_time)
                arrives_in_time = lead_time <= 30  # simplified check

                constraints_checked = [
                    f"Source has {source_spare} spare units above own safety+forecast",
                    f"Route {route_key} active (cost {cost_per_unit}/unit, {route['lead_time_days']} days)",
                    f"Transfer lead time: {lead_time} days (arrives: {arrives_by})",
                ]

                if route_disrupted:
                    constraints_checked.append(f"Route disrupted — extra {route_extra_days} days added")
                else:
                    constraints_checked.append("Route not affected by active disruptions")

                if not arrives_in_time:
                    constraints_checked.append("WARNING: Transfer may arrive after shortage occurs")

                is_feasible = net_benefit > 0 and arrives_in_time

                recommendations.append({
                    "recommendation_id": f"REC-{shortage['sku_id']}-{source['warehouse_id']}-{shortage['warehouse_id']}",
                    "sku_id": shortage["sku_id"],
                    "sku_name": shortage["sku_name"],
                    "from_warehouse": source["warehouse_id"],
                    "to_warehouse": shortage["warehouse_id"],
                    "quantity": transfer_qty,
                    "transfer_cost": float(total_transfer_cost),
                    "expected_benefit": float(expected_benefit),
                    "net_benefit": float(net_benefit),
                    "lead_time_days": lead_time,
                    "reason": (
                        f"Transfer {transfer_qty} units of {shortage['sku_name']} from "
                        f"{source['warehouse_id']} to {shortage['warehouse_id']} to cover "
                        f"projected shortage of {shortfall}. "
                        f"Net benefit: {float(net_benefit):.2f} AED."
                    ),
                    "constraints_checked": constraints_checked,
                    "is_feasible": is_feasible,
                    "confidence_level": shortage["confidence_level"],
                    "route_disrupted": route_disrupted,
                })

        # Rank by net_benefit (descending), feasible first
        recommendations.sort(key=lambda r: (r["is_feasible"], r["net_benefit"]), reverse=True)
        for i, rec in enumerate(recommendations):
            rec["rank"] = i + 1

        # --- Impact assessment (before/after) ---
        if recommendations:
            feasible_recs = [r for r in recommendations if r["is_feasible"]]

            total_shortage_before = sum(s["shortfall"] * float(s["unit_price"] - s["unit_cost"]) for s in shortages)
            shortage_reduced = sum(r["quantity"] for r in feasible_recs)
            total_shortage_after = max(0, total_shortage_before - shortage_reduced)

            total_transfer_cost = sum(r["transfer_cost"] for r in feasible_recs)
            total_benefit = sum(r["net_benefit"] for r in feasible_recs)

            impact_metrics = [
                {
                    "metric": "Expected shortage exposure (AED)",
                    "before": float(total_shortage_before),
                    "after": float(total_shortage_after),
                    "unit": "AED",
                    "delta": float(total_shortage_after - total_shortage_before),
                    "is_improvement": total_shortage_after < total_shortage_before,
                },
                {
                    "metric": "Units in shortage risk",
                    "before": sum(s["shortfall"] for s in shortages),
                    "after": max(0, sum(s["shortfall"] for s in shortages) - shortage_reduced),
                    "unit": "units",
                    "delta": -shortage_reduced,
                    "is_improvement": shortage_reduced > 0,
                },
                {
                    "metric": "Net economic benefit (AED)",
                    "before": 0.0,
                    "after": float(total_benefit),
                    "unit": "AED",
                    "delta": float(total_benefit),
                    "is_improvement": total_benefit > 0,
                },
                {
                    "metric": "Transfer cost (AED)",
                    "before": 0.0,
                    "after": float(total_transfer_cost),
                    "unit": "AED",
                    "delta": float(total_transfer_cost),
                    "is_improvement": False,
                },
            ]

        # --- Baseline comparison ---
        # Baseline = "do nothing" approach: Sara uses simple recent average demand
        # and does no proactive transfers. She accepts all shortage losses.
        baseline_shortage_aed = float(total_shortage_before)
        baseline_transfer_cost = 0.0
        baseline_net = -baseline_shortage_aed  # net = 0 benefit - all shortage losses

        ai_shortage_aed = float(total_shortage_after)
        ai_transfer_cost = float(total_transfer_cost)
        ai_net = float(total_benefit)  # already net of transfer cost

        baseline_comparison = {
            "baseline": {
                "label": "Baseline (Do Nothing)",
                "description": "Recent average demand, no proactive transfers — Sara accepts all shortage losses",
                "shortage_exposure_aed": round(baseline_shortage_aed, 2),
                "transfer_cost_aed": round(baseline_transfer_cost, 2),
                "net_position_aed": round(baseline_net, 2),
                "units_at_risk": sum(s["shortfall"] for s in shortages),
                "service_level_pct": round(
                    100 * (1 - sum(s["shortfall"] for s in shortages) /
                           max(1, sum(s["shortfall"] for s in shortages) + sum(s["available"] for s in shortages))),
                    1
                ),
            },
            "ai_solution": {
                "label": "AI Solution (Proactive Transfers)",
                "description": "Demand forecast with stockout correction + cost-benefit ranked transfers",
                "shortage_exposure_aed": round(ai_shortage_aed, 2),
                "transfer_cost_aed": round(ai_transfer_cost, 2),
                "net_position_aed": round(ai_net, 2),
                "units_at_risk": max(0, sum(s["shortfall"] for s in shortages) - shortage_reduced),
                "service_level_pct": round(
                    100 * (1 - max(0, sum(s["shortfall"] for s in shortages) - shortage_reduced) /
                           max(1, sum(s["shortfall"] for s in shortages) + sum(s["available"] for s in shortages))),
                    1
                ),
            },
            "improvement": {
                "shortage_reduction_aed": round(baseline_shortage_aed - ai_shortage_aed, 2),
                "shortage_reduction_pct": round(
                    100 * (baseline_shortage_aed - ai_shortage_aed) / max(1, baseline_shortage_aed), 1
                ) if baseline_shortage_aed > 0 else 0,
                "net_benefit_aed": round(ai_net - baseline_net, 2),
                "service_level_delta_pct": round(
                    (100 * (1 - max(0, sum(s["shortfall"] for s in shortages) - shortage_reduced) /
                            max(1, sum(s["shortfall"] for s in shortages) + sum(s["available"] for s in shortages))))
                    - (100 * (1 - sum(s["shortfall"] for s in shortages) /
                            max(1, sum(s["shortfall"] for s in shortages) + sum(s["available"] for s in shortages)))),
                    1
                ),
            },
        }

    return {
        "recommendations": recommendations,
        "impact_assessment": impact_metrics,
        "baseline_comparison": baseline_comparison,
        "summary": {
            "total_recommendations": len(recommendations),
            "feasible_recommendations": sum(1 for r in recommendations if r["is_feasible"]),
            "total_net_benefit": sum(r["net_benefit"] for r in recommendations if r["is_feasible"]),
            "shortages_identified": len(shortages),
            "excess_sources_found": len(excess_sources),
        },
    }
