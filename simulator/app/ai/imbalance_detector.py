"""
Imbalance Detector — flags shortages, excess stock, ageing, and misleading sales.

For each SKU/warehouse, compares:
  - Current available stock vs 30-day forecast demand
  - Current stock vs safety stock
  - Stock age distribution (ageing risk)
  - Whether observed sales history is distorted by stockouts

Output: list of ImbalanceFlag objects with severity and recommended action.
"""

import logging
from datetime import date, timedelta
from typing import Optional

from app.db import get_conn
from app.ai.forecaster import forecast_all

logger = logging.getLogger(__name__)


async def detect_imbalances(skus: list[str] = None, warehouses: list[str] = None):
    """
    Scan all SKU/warehouse combinations and flag imbalances.
    """
    forecasts = await forecast_all(skus, warehouses)

    async with get_conn() as conn:
        sim_state = await conn.fetchrow("SELECT sim_clock FROM simulator.state WHERE id = 1")
        sim_date = sim_state["sim_clock"] if sim_state and sim_state["sim_clock"] else date.today()

        flags = []
        for f in forecasts:
            sku_id = f["sku_id"]
            warehouse_id = f["warehouse_id"]
            forecast_30d = f["forecast_qty_30d"]

            # Get current stock
            stock = await conn.fetchrow(
                """
                SELECT available_qty, reserved_qty, safety_stock, inbound_qty
                FROM inventory.stock_levels
                WHERE sku_id = $1 AND warehouse_id = $2
                """,
                sku_id, warehouse_id,
            )
            if not stock:
                continue

            available = stock["available_qty"]
            reserved = stock["reserved_qty"]
            safety = stock["safety_stock"]
            inbound = stock["inbound_qty"]

            # Net available = what's on hand minus reserved plus what's arriving
            net_available = available - reserved  # inbound counted separately

            # --- Shortage detection ---
            # Projected stock = net_available + inbound - forecast demand
            projected_stock = net_available + inbound - forecast_30d

            if projected_stock < safety:
                shortfall = safety - projected_stock
                severity = "critical" if projected_stock < 0 else "warning"
                flags.append({
                    "sku_id": sku_id,
                    "warehouse_id": warehouse_id,
                    "flag_type": "shortage",
                    "severity": severity,
                    "current_qty": available,
                    "forecast_qty": forecast_30d,
                    "safety_stock": safety,
                    "shortfall_or_excess": shortfall,
                    "description": (
                        f"Projected stock ({projected_stock}) falls below safety stock ({safety}). "
                        f"Available: {available}, Reserved: {reserved}, Inbound: {inbound}, "
                        f"30d forecast: {forecast_30d}."
                    ),
                    "recommended_action": "Review transfer from a warehouse with excess, or expedite inbound.",
                    "confidence_level": f["confidence_level"],
                })

            # --- Excess stock detection ---
            # If available stock greatly exceeds forecast + safety buffer
            excess_threshold = forecast_30d + safety + (forecast_30d * 0.5)  # 50% buffer above demand+safety
            if available > excess_threshold and forecast_30d > 0:
                excess = available - excess_threshold
                flags.append({
                    "sku_id": sku_id,
                    "warehouse_id": warehouse_id,
                    "flag_type": "excess",
                    "severity": "info",
                    "current_qty": available,
                    "forecast_qty": forecast_30d,
                    "safety_stock": safety,
                    "shortfall_or_excess": excess,
                    "description": (
                        f"Excess stock: {available} available vs {forecast_30d} forecast + {safety} safety. "
                        f"~{excess} units could be transferred elsewhere."
                    ),
                    "recommended_action": "Consider transferring excess to a warehouse with shortage risk.",
                    "confidence_level": f["confidence_level"],
                })

            # --- Ageing stock detection ---
            age_rows = await conn.fetch(
                """
                SELECT age_bucket, qty
                FROM inventory.stock_age
                WHERE sku_id = $1 AND warehouse_id = $2
                """,
                sku_id, warehouse_id,
            )
            ageing_qty = sum(r["qty"] for r in age_rows if r["age_bucket"] in ("61-90", "90+"))
            total_age_qty = sum(r["qty"] for r in age_rows)
            if ageing_qty > 0 and total_age_qty > 0:
                ageing_ratio = ageing_qty / total_age_qty
                if ageing_ratio > 0.25 or (ageing_qty > 50 and ageing_ratio > 0.15):
                    flags.append({
                        "sku_id": sku_id,
                        "warehouse_id": warehouse_id,
                        "flag_type": "ageing",
                        "severity": "warning" if ageing_ratio > 0.4 else "info",
                        "current_qty": available,
                        "forecast_qty": forecast_30d,
                        "safety_stock": safety,
                        "shortfall_or_excess": ageing_qty,
                        "description": (
                            f"Ageing stock: {ageing_qty} units are 61+ days old "
                            f"({ageing_ratio:.0%} of total age-tracked stock). "
                            f"Holding cost risk and obsolescence risk."
                        ),
                        "recommended_action": "Prioritize selling or transferring older stock. Review reorder timing.",
                        "confidence_level": "high",
                    })

            # --- Misleading sales history detection ---
            if f["data_quality_notes"]:
                stockout_notes = [n for n in f["data_quality_notes"] if "stockout" in n.lower()]
                if stockout_notes:
                    flags.append({
                        "sku_id": sku_id,
                        "warehouse_id": warehouse_id,
                        "flag_type": "misleading_sales",
                        "severity": "warning",
                        "current_qty": available,
                        "forecast_qty": forecast_30d,
                        "safety_stock": safety,
                        "shortfall_or_excess": 0,
                        "description": (
                            f"Sales history contains stockout periods that suppress true demand. "
                            f"Forecast has been corrected, but confidence is reduced. "
                            + "; ".join(f["data_quality_notes"])
                        ),
                        "recommended_action": "Use corrected forecast with caution. Verify supplier reliability.",
                        "confidence_level": f["confidence_level"],
                    })

        # Sort by severity
        severity_order = {"critical": 0, "warning": 1, "info": 2}
        flags.sort(key=lambda x: severity_order.get(x["severity"], 3))

    return flags
