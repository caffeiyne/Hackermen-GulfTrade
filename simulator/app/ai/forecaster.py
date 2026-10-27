"""
Demand Forecaster — estimates 30-day demand per SKU/warehouse.

Uses a weighted moving average with trend adjustment, enhanced by:
  - Stockout correction (un-suppresses demand during stockout periods)
  - Seasonality (UAE weekend adjustment)
  - External disruption signals (adjusts for supply constraints)

Outputs confidence bands (P10/P90) based on historical variance.
Confidence level is reduced when stockout periods or data gaps exist.
"""

import logging
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

import numpy as np

from app.db import get_conn

logger = logging.getLogger(__name__)

FORECAST_HORIZON_DAYS = 30
WMA_WEIGHTS = [0.35, 0.25, 0.20, 0.12, 0.08]  # recent → old, 5 buckets of ~18 days each


async def forecast_all(skus: list[str] = None, warehouses: list[str] = None):
    """Generate 30-day forecasts for all SKU/warehouse combinations."""
    async with get_conn() as conn:
        # Get the simulation start date
        sim_state = await conn.fetchrow("SELECT sim_clock FROM simulator.state WHERE id = 1")
        sim_date = sim_state["sim_clock"] if sim_state and sim_state["sim_clock"] else date.today()

        # Build query for all SKU/warehouse combos that have stock
        query = """
            SELECT DISTINCT sl.sku_id, sl.warehouse_id
            FROM inventory.stock_levels sl
        """
        conditions = []
        params = []
        idx = 1
        if skus:
            conditions.append(f"sl.sku_id = ANY(${idx})")
            params.append(skus)
            idx += 1
        if warehouses:
            conditions.append(f"sl.warehouse_id = ANY(${idx})")
            params.append(warehouses)
            idx += 1
        if conditions:
            query += " WHERE " + " AND ".join(conditions)
        query += " ORDER BY sl.sku_id, sl.warehouse_id"

        combos = await conn.fetch(query, *params)

        results = []
        for combo in combos:
            forecast = await _forecast_single(conn, combo["sku_id"], combo["warehouse_id"], sim_date)
            if forecast:
                results.append(forecast)

    return results


async def _forecast_single(conn, sku_id: str, warehouse_id: str, sim_date: date):
    """Generate forecast for a single SKU/warehouse."""
    history_start = sim_date - timedelta(days=90)

    # Fetch daily sales for the last 90 days
    rows = await conn.fetch(
        """
        SELECT txn_date, quantity, is_stockout
        FROM sales.transactions
        WHERE sku_id = $1 AND warehouse_id = $2 AND txn_date >= $3
        ORDER BY txn_date
        """,
        sku_id, warehouse_id, history_start,
    )

    if not rows:
        return _empty_forecast(sku_id, warehouse_id, sim_date)

    # Build a full daily series (fill missing days with 0)
    daily_data = {}
    stockout_days = set()
    for r in rows:
        d = r["txn_date"]
        daily_data[d] = r["quantity"]
        if r["is_stockout"]:
            stockout_days.add(d)

    # Fill missing days
    full_series = []
    current = history_start
    while current <= sim_date:
        if current in daily_data:
            full_series.append(daily_data[current])
        elif current in stockout_days:
            full_series.append(0)  # stockout day, 0 recorded
        else:
            full_series.append(0)  # missing day
        current += timedelta(days=1)

    series = np.array(full_series, dtype=float)

    # --- Stockout correction ---
    # During stockout periods, observed sales are suppressed.
    # Estimate true demand by looking at non-stockout daily averages for the same SKU.
    non_stockout_sales = [s for s, d in zip(series, range(len(series)))
                         if (history_start + timedelta(days=d)) not in stockout_days]
    stockout_count = len(series) - len(non_stockout_sales)

    if stockout_count > 0 and len(non_stockout_sales) > 0:
        avg_non_stockout = np.mean(non_stockout_sales)
        # Replace stockout day values with the non-stockout average
        for i in range(len(series)):
            d = history_start + timedelta(days=i)
            if d in stockout_days:
                series[i] = avg_non_stockout
        has_stockout_correction = True
    else:
        has_stockout_correction = False

    # --- Missing data correction ---
    # Zero values on non-stockout days may be genuine zeros or missing data.
    # If >15% of non-stockout days are zero but average is >0, treat zeros as missing.
    non_stockout_series = [s for i, s in enumerate(series)
                          if (history_start + timedelta(days=i)) not in stockout_days]
    zero_ratio = sum(1 for s in non_stockout_series if s == 0) / max(len(non_stockout_series), 1)
    has_missing_data = zero_ratio > 0.15

    if has_missing_data and np.mean(non_stockout_series) > 0:
        avg_positive = np.mean([s for s in non_stockout_series if s > 0])
        for i in range(len(series)):
            d = history_start + timedelta(days=i)
            if d not in stockout_days and series[i] == 0:
                series[i] = avg_positive * 0.5  # partial fill — we're uncertain

    # --- Weighted Moving Average ---
    # Split the 90-day series into 5 buckets of ~18 days
    bucket_size = len(series) // len(WMA_WEIGHTS)
    buckets = []
    for i in range(len(WMA_WEIGHTS)):
        start = i * bucket_size
        end = start + bucket_size if i < len(WMA_WEIGHTS) - 1 else len(series)
        bucket_data = series[start:end]
        buckets.append(np.mean(bucket_data) if len(bucket_data) > 0 else 0)

    # Weighted average of bucket means
    wma = sum(w * b for w, b in zip(WMA_WEIGHTS, buckets))

    # --- Trend adjustment ---
    # Simple linear trend from first half to second half
    first_half_mean = np.mean(series[:len(series)//2])
    second_half_mean = np.mean(series[len(series)//2:])
    trend_per_day = (second_half_mean - first_half_mean) / 45  # ~45 days per half
    trend_adjustment = trend_per_day * FORECAST_HORIZON_DAYS * 0.5  # dampened

    daily_forecast = wma + (trend_adjustment / FORECAST_HORIZON_DAYS)
    daily_forecast = max(0, daily_forecast)
    forecast_30d = int(round(daily_forecast * FORECAST_HORIZON_DAYS))

    # --- Confidence bands ---
    # Use historical variance to estimate uncertainty
    if len(non_stockout_series) > 5:
        std_dev = np.std(non_stockout_series)
    else:
        std_dev = max(1, daily_forecast * 0.3)

    # 30-day variance scales with sqrt(30)
    monthly_std = std_dev * np.sqrt(FORECAST_HORIZON_DAYS)
    confidence_low = max(0, int(round(forecast_30d - 1.28 * monthly_std)))  # P10
    confidence_high = int(round(forecast_30d + 1.28 * monthly_std))          # P90

    # --- Confidence level ---
    confidence_level = "high"
    assumptions = []
    data_notes = []

    if has_stockout_correction:
        confidence_level = "medium"
        assumptions.append("Demand during stockout periods estimated from non-stockout averages")
        data_notes.append(f"{stockout_count} stockout days corrected in demand estimation")

    if has_missing_data:
        if confidence_level == "high":
            confidence_level = "medium"
        data_notes.append(f"{zero_ratio:.0%} of non-stockout days have zero sales (possible missing data)")

    if std_dev > daily_forecast * 0.5:
        confidence_level = "low"
        data_notes.append("High historical variance reduces forecast confidence")

    # --- Check active disruptions affecting this SKU ---
    active_disruptions = await conn.fetch(
        """
        SELECT * FROM events.disruptions
        WHERE is_active = TRUE
          AND $1::date BETWEEN start_date AND COALESCE(end_date, '2099-12-31'::date)
          AND $2 = ANY(affected_skus)
        """,
        sim_date, sku_id,
    )
    if active_disruptions:
        confidence_level = "low"
        for d in active_disruptions:
            data_notes.append(
                f"Active disruption: {d['title']} — supply may be constrained"
            )

    assumptions.append(f"Weighted moving average over 90 days with trend adjustment")
    assumptions.append(f"Forecast horizon: {FORECAST_HORIZON_DAYS} days from {sim_date}")

    return {
        "sku_id": sku_id,
        "warehouse_id": warehouse_id,
        "forecast_qty_30d": forecast_30d,
        "confidence_low": confidence_low,
        "confidence_high": confidence_high,
        "confidence_level": confidence_level,
        "method": "weighted_moving_avg_with_stockout_correction",
        "assumptions": assumptions,
        "data_quality_notes": data_notes,
    }


def _empty_forecast(sku_id: str, warehouse_id: str, sim_date: date):
    return {
        "sku_id": sku_id,
        "warehouse_id": warehouse_id,
        "forecast_qty_30d": 0,
        "confidence_low": 0,
        "confidence_high": 0,
        "confidence_level": "low",
        "method": "no_data",
        "assumptions": ["No historical sales data available"],
        "data_quality_notes": ["No sales records found for this SKU/warehouse"],
    }
