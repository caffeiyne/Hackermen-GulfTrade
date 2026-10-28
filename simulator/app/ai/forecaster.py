"""
Demand Forecaster — 30-day demand per SKU/warehouse.

Method (chosen by backtest, see app/ai/backtest.py):
  * Exponentially weighted mean of daily sales, half-life 30 days
    (recent days count most; the whole 90-day window still contributes).
  * Stockout days are CENSORED — excluded from the estimate, because a zero
    on a stockout day is missing demand, not zero demand. The size of the
    distortion is reported ("raw history would understate demand by X%").
  * Days with no sales record are treated as zero sales and counted, so the
    planner can see how much of the history is unrecorded.
  * Supplied demand signals (demand_surge disruptions) scale only the listed
    SKUs and only for the overlapping days — labelled as an assumption.
  * P10/P90 from a calibrated normal band: daily noise, uncertainty in the
    level estimate, and a 5% model-error term. Backtest coverage ~80%.

Confidence is driven by the relative width of that band and by data
quality (stockout corrections, recording gaps), not by labels.
"""

from __future__ import annotations

import logging
import math
from datetime import date, timedelta

import numpy as np

from app.db import get_conn
from app.ai.planning import HORIZON_DAYS, load_context

logger = logging.getLogger(__name__)

FORECAST_HORIZON_DAYS = HORIZON_DAYS
HISTORY_DAYS = 90
HALF_LIFE_DAYS = 30
Z90 = 1.2816
NOISE_INFLATION = 1.2   # calibrated so P10–P90 covers ~80% in backtest
MODEL_ERROR = 0.05      # level/model error as share of forecast
METHOD = "ewma_hl30_censored_stockouts"


def forecast_series(sales: dict, stockout_days: set, history_start: date, as_of: date,
                    horizon_days: int = HORIZON_DAYS) -> dict:
    """
    Pure forecasting function (no DB) — used by the live engine and the backtest.
    sales: {date: qty} for days < as_of. stockout_days: dates flagged is_stockout.
    """
    days = [history_start + timedelta(days=i) for i in range((as_of - history_start).days)]
    if not days:
        return {"mean": 0.0, "sd": 0.0, "n": 0, "stockout_days": 0, "unrecorded_days": 0,
                "naive_30d": 0.0}

    obs_y, obs_age = [], []
    unrecorded = 0
    for d in days:
        if d in stockout_days:
            continue
        if d not in sales:
            unrecorded += 1
        obs_y.append(float(sales.get(d, 0)))
        obs_age.append((as_of - d).days)

    # Naive "recent average" (the case-study baseline) uses raw history incl. stockout zeros
    last30 = [float(sales.get(d, 0)) for d in days[-30:]]
    naive_30d = float(np.mean(last30) * horizon_days) if last30 else 0.0

    if not obs_y:
        return {"mean": naive_30d, "sd": naive_30d * 0.5, "n": 0,
                "stockout_days": len(stockout_days & set(days)), "unrecorded_days": unrecorded,
                "naive_30d": naive_30d}

    y = np.array(obs_y)
    w = 0.5 ** (np.array(obs_age) / HALF_LIFE_DAYS)
    daily = float(np.sum(w * y) / np.sum(w))
    resid_sd = float(np.sqrt(np.sum(w * (y - daily) ** 2) / np.sum(w)))
    n_eff = float(np.sum(w) ** 2 / np.sum(w ** 2))

    mean = daily * horizon_days
    var = ((NOISE_INFLATION * resid_sd) ** 2 * horizon_days
           + (resid_sd * horizon_days) ** 2 / max(n_eff, 1)
           + (MODEL_ERROR * mean) ** 2)
    return {
        "mean": mean,
        "sd": math.sqrt(var),
        "n": len(obs_y),
        "stockout_days": len(stockout_days & set(days)),
        "unrecorded_days": unrecorded,
        "naive_30d": naive_30d,
    }


async def forecast_all(skus: list[str] = None, warehouses: list[str] = None, ctx: dict = None):
    """Generate 30-day forecasts for all SKU/warehouse combinations."""
    async with get_conn() as conn:
        if ctx is None:
            ctx = await load_context(conn)
        sim_date = ctx["sim_date"]
        history_start = sim_date - timedelta(days=HISTORY_DAYS)

        rows = await conn.fetch(
            """
            SELECT sku_id, warehouse_id, txn_date, SUM(quantity) AS qty,
                   BOOL_OR(is_stockout) AS stockout, MAX(recorded_at) AS last_loaded
            FROM sales.transactions
            WHERE txn_date >= $1 AND txn_date < $2
            GROUP BY sku_id, warehouse_id, txn_date
            """,
            history_start, sim_date,
        )

    series: dict = {}
    for r in rows:
        key = (r["sku_id"], r["warehouse_id"])
        s = series.setdefault(key, {"sales": {}, "stockouts": set(), "last_loaded": None})
        d = r["txn_date"] if isinstance(r["txn_date"], date) else date.fromisoformat(str(r["txn_date"]))
        s["sales"][d] = int(r["qty"])
        if r["stockout"]:
            s["stockouts"].add(d)
        if r["last_loaded"] and (s["last_loaded"] is None or str(r["last_loaded"]) > str(s["last_loaded"])):
            s["last_loaded"] = r["last_loaded"]

    supply_hit = {}
    for d in ctx["disruptions"]:
        if d["disruption_type"] == "supply_shortage":
            for sku in d["affected_skus"]:
                supply_hit.setdefault(sku, []).append(d["title"])

    results = []
    for key in ctx["stock"]:
        sku_id, warehouse_id = key
        if skus and sku_id not in skus:
            continue
        if warehouses and warehouse_id not in warehouses:
            continue
        s = series.get(key)
        if not s:
            results.append(_empty_forecast(sku_id, warehouse_id, sim_date))
            continue

        f = forecast_series(s["sales"], s["stockouts"], history_start, sim_date)
        mean, sd = f["mean"], f["sd"]
        assumptions = [
            f"Exponentially weighted average of daily sales (half-life {HALF_LIFE_DAYS}d) over {HISTORY_DAYS} days",
            f"Horizon: {HORIZON_DAYS} days from {sim_date}",
        ]
        notes = []

        # Supplied demand signals only
        for sig in ctx["surges"].get(sku_id, []):
            if sig["days"] <= 0:
                continue
            extra = mean / HORIZON_DAYS * sig["days"] * (sig["multiplier"] - 1)
            mean += extra
            sd = math.sqrt(sd ** 2 + (0.5 * extra) ** 2)  # signal itself is uncertain
            assumptions.append(
                f"Supplied signal '{sig['title']}': x{sig['multiplier']} for {sig['days']} days "
                f"(+{extra:.0f} units) — assumption, not observed demand"
            )

        if f["stockout_days"]:
            raw_gap = (mean - f["naive_30d"]) / mean if mean > 0 else 0
            notes.append(f"{f['stockout_days']} stockout days excluded from estimation (censored demand)")
            if raw_gap > 0.05:
                notes.append(f"Raw recent average would understate demand by {raw_gap:.0%}")
            assumptions.append("Demand on stockout days assumed similar to non-stockout days")

        total_days = HISTORY_DAYS
        if f["unrecorded_days"] / total_days > 0.15 and mean / HORIZON_DAYS >= 1:
            notes.append(f"{f['unrecorded_days']} of {total_days} days have no sales record — treated as zero (may hide missing data)")

        cv = sd / mean if mean > 0 else 1.0
        level = "high" if cv < 0.15 else ("medium" if cv < 0.30 else "low")
        if f["stockout_days"] and level == "high":
            level = "medium"
        if sku_id in supply_hit:
            level = "low"
            for t in supply_hit[sku_id]:
                notes.append(f"Supply disruption '{t}' affects this SKU — replenishment at risk")

        last_loaded = s["last_loaded"]
        results.append({
            "sku_id": sku_id,
            "warehouse_id": warehouse_id,
            "forecast_qty_30d": int(round(mean)),
            "forecast_sd": round(sd, 2),
            "confidence_low": max(0, int(round(mean - Z90 * sd))),
            "confidence_high": int(round(mean + Z90 * sd)),
            "naive_forecast_30d": int(round(f["naive_30d"])),
            "confidence_level": level,
            "method": METHOD,
            "assumptions": assumptions,
            "data_quality_notes": notes,
            "data_source": "sales.transactions",
            "history_window": f"{history_start} to {sim_date - timedelta(days=1)}",
            "data_as_of": str(last_loaded) if last_loaded else None,
        })
    return results


def _empty_forecast(sku_id: str, warehouse_id: str, sim_date: date):
    return {
        "sku_id": sku_id,
        "warehouse_id": warehouse_id,
        "forecast_qty_30d": 0,
        "forecast_sd": 0,
        "confidence_low": 0,
        "confidence_high": 0,
        "naive_forecast_30d": 0,
        "confidence_level": "low",
        "method": "no_data",
        "assumptions": ["No historical sales data available"],
        "data_quality_notes": ["No sales records found for this SKU/warehouse — not forecast, not assumed"],
        "data_source": "sales.transactions",
        "history_window": None,
        "data_as_of": None,
    }

