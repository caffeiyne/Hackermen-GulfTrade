"""
Imbalance Detector — flags shortages, excess stock, ageing, and misleading sales.

For each SKU/warehouse it compares the planning position
    usable stock = available - reserved + inbound landing within the horizon
                   (ETAs adjusted for supplied disruptions)
against the 30-day forecast distribution (P50 and P90).

  shortage          usable - P50 forecast < safety stock
                    (critical when expected to run out: usable < P50)
  excess            usable > P90 forecast + safety stock  (cautious: only
                    stock beyond plausible high demand counts as excess)
  ageing            >25% of age-tracked stock is 61+ days old,
                    or >50 units at >15%
  misleading_sales  sales history contains stockout days (censored demand)
"""

import logging

from app.db import get_conn
from app.ai.forecaster import forecast_all
from app.ai.planning import load_context, expected_short, HORIZON_DAYS

logger = logging.getLogger(__name__)


async def detect_imbalances(skus: list[str] = None, warehouses: list[str] = None,
                            ctx: dict = None, forecasts: list = None):
    async with get_conn() as conn:
        if ctx is None:
            ctx = await load_context(conn)
        if forecasts is None:
            forecasts = await forecast_all(skus, warehouses, ctx=ctx)

        age_rows = await conn.fetch("SELECT sku_id, warehouse_id, age_bucket, qty FROM inventory.stock_age")
    ages = {}
    for r in age_rows:
        ages.setdefault((r["sku_id"], r["warehouse_id"]), []).append(r)

    flags = []
    for f in forecasts:
        key = (f["sku_id"], f["warehouse_id"])
        st = ctx["stock"].get(key)
        if not st:
            continue
        sku_id, warehouse_id = key
        mu, sd = f["forecast_qty_30d"], f.get("forecast_sd", 0)
        p90 = f["confidence_high"]
        inb = ctx["inbound"][key]
        net = st["available_qty"] - st["reserved_qty"]
        usable = net + inb["in_horizon"]
        safety = st["safety_stock"]
        base = {
            "sku_id": sku_id,
            "warehouse_id": warehouse_id,
            "sku_name": st["sku_name"],
            "current_qty": st["available_qty"],
            "forecast_qty": mu,
            "safety_stock": safety,
            "confidence_level": f["confidence_level"],
            "data_as_of": str(st.get("updated_at")) if st.get("updated_at") else None,
        }

        # --- Shortage ---
        projected = usable - mu
        if projected < safety:
            exp_short = expected_short(mu, sd, usable)
            daily = mu / HORIZON_DAYS if mu else 0
            cover = (net / daily) if daily > 0 else None
            severity = "critical" if projected < 0 else "warning"
            desc = (
                f"Projected stock {projected} after 30 days vs safety stock {safety}. "
                f"Available {st['available_qty']}, reserved {st['reserved_qty']}, "
                f"inbound in horizon {inb['in_horizon']}, forecast {mu} (P10–P90 {f['confidence_low']}–{p90}). "
                f"Expected units short: {exp_short:.0f}."
            )
            if cover is not None:
                desc += f" On-hand covers ~{cover:.0f} days."
            if inb["notes"]:
                desc += " " + " ".join(inb["notes"])
            flags.append({
                **base,
                "flag_type": "shortage",
                "severity": severity,
                "shortfall_or_excess": int(safety - projected),
                "expected_units_short": round(exp_short, 1),
                "description": desc,
                "recommended_action": "Review transfer from a location with true excess, or expedite inbound.",
            })

        # --- Excess (beyond plausible high demand) ---
        excess_threshold = p90 + safety
        if usable > excess_threshold and mu > 0:
            excess = usable - excess_threshold
            flags.append({
                **base,
                "flag_type": "excess",
                "severity": "info",
                "shortfall_or_excess": int(excess),
                "description": (
                    f"Usable stock {usable} exceeds P90 demand {p90} + safety {safety}. "
                    f"~{excess} units are surplus even in a high-demand month "
                    f"(holding ~{excess * st['daily_holding_cost'] * HORIZON_DAYS:.0f} AED/30d)."
                ),
                "recommended_action": "Candidate source for transfers; review reorders for this location.",
            })

        # --- Ageing ---
        rows = ages.get(key, [])
        ageing_qty = sum(r["qty"] for r in rows if r["age_bucket"] in ("61-90", "90+"))
        total_age_qty = sum(r["qty"] for r in rows)
        if ageing_qty > 0 and total_age_qty > 0:
            ratio = ageing_qty / total_age_qty
            if ratio > 0.25 or (ageing_qty > 50 and ratio > 0.15):
                flags.append({
                    **base,
                    "flag_type": "ageing",
                    "severity": "warning" if ratio > 0.4 else "info",
                    "shortfall_or_excess": ageing_qty,
                    "confidence_level": "high",
                    "description": (
                        f"{ageing_qty} units are 61+ days old ({ratio:.0%} of age-tracked stock); "
                        f"tied-up value ~{ageing_qty * st['unit_cost']:.0f} AED at cost."
                    ),
                    "recommended_action": "Sell or transfer oldest stock first; pause reorders here.",
                })

        # --- Misleading sales history ---
        stockout_notes = [n for n in f["data_quality_notes"] if "stockout" in n.lower() or "understate" in n.lower()]
        if stockout_notes:
            flags.append({
                **base,
                "flag_type": "misleading_sales",
                "severity": "warning",
                "shortfall_or_excess": max(0, mu - f.get("naive_forecast_30d", mu)),
                "description": (
                    "Sales history contains stockout periods that hide true demand. "
                    f"Corrected forecast {mu} vs raw recent average {f.get('naive_forecast_30d')}. "
                    + "; ".join(stockout_notes)
                ),
                "recommended_action": "Use the corrected forecast; verify the stockout dates with the warehouse.",
            })

    severity_order = {"critical": 0, "warning": 1, "info": 2}
    flags.sort(key=lambda x: severity_order.get(x["severity"], 3))
    return flags
