"""
Sales routes — historical transactions, summaries, data quality insights.
"""

from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Query

from app.db import get_conn
from app.models import SalesTransaction, SalesSummary

sales_router = APIRouter()


@sales_router.get("/history", response_model=list[SalesTransaction])
async def list_sales_history(
    sku_id: Optional[str] = None,
    warehouse_id: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    limit: int = Query(default=1000, le=5000),
    include_stockouts: bool = True,
):
    """
    Get historical sales transactions (90 days).
    Optionally exclude stockout-period records to see "clean" demand.
    """
    query = "SELECT * FROM sales.transactions"
    conditions = []
    params = []
    idx = 1

    if sku_id:
        conditions.append(f"sku_id = ${idx}")
        params.append(sku_id)
        idx += 1
    if warehouse_id:
        conditions.append(f"warehouse_id = ${idx}")
        params.append(warehouse_id)
        idx += 1
    if start_date:
        conditions.append(f"txn_date >= ${idx}")
        params.append(start_date)
        idx += 1
    if end_date:
        conditions.append(f"txn_date <= ${idx}")
        params.append(end_date)
        idx += 1
    if not include_stockouts:
        conditions.append("is_stockout = FALSE")

    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += f" ORDER BY txn_date DESC LIMIT ${idx}"
    params.append(limit)

    async with get_conn() as conn:
        rows = await conn.fetch(query, *params)
    return [dict(r) for r in rows]


@sales_router.get("/summary", response_model=list[SalesSummary])
async def sales_summary(
    sku_id: Optional[str] = None,
    warehouse_id: Optional[str] = None,
):
    """
    Aggregated sales summary per SKU/warehouse.
    Shows total qty, avg daily, value, and whether stockout periods exist.
    """
    query = """
        SELECT
            sku_id,
            warehouse_id,
            SUM(quantity) as total_qty,
            SUM(total_value) as total_value,
            ROUND(AVG(quantity)::numeric, 2) as avg_daily_qty,
            COUNT(*) as transaction_count,
            BOOL_OR(is_stockout) as has_stockout_periods
        FROM sales.transactions
    """
    conditions = []
    params = []
    idx = 1
    if sku_id:
        conditions.append(f"sku_id = ${idx}")
        params.append(sku_id)
        idx += 1
    if warehouse_id:
        conditions.append(f"warehouse_id = ${idx}")
        params.append(warehouse_id)
        idx += 1
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " GROUP BY sku_id, warehouse_id ORDER BY sku_id, warehouse_id"

    async with get_conn() as conn:
        rows = await conn.fetch(query, *params)
    return [dict(r) for r in rows]


@sales_router.get("/daily")
async def daily_sales(
    sku_id: Optional[str] = None,
    warehouse_id: Optional[str] = None,
):
    """
    Daily aggregated sales — for charting.
    Returns date, sku, warehouse, qty, is_stockout.
    """
    query = """
        SELECT
            txn_date,
            sku_id,
            warehouse_id,
            SUM(quantity) as quantity,
            SUM(total_value) as total_value,
            BOOL_OR(is_stockout) as has_stockout
        FROM sales.transactions
    """
    conditions = []
    params = []
    idx = 1
    if sku_id:
        conditions.append(f"sku_id = ${idx}")
        params.append(sku_id)
        idx += 1
    if warehouse_id:
        conditions.append(f"warehouse_id = ${idx}")
        params.append(warehouse_id)
        idx += 1
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " GROUP BY txn_date, sku_id, warehouse_id ORDER BY txn_date"

    async with get_conn() as conn:
        rows = await conn.fetch(query, *params)
    return [dict(r) for r in rows]


@sales_router.get("/data-quality")
async def data_quality_report():
    """
    Reports data quality issues in the sales history:
    - Stockout periods (suppressed demand)
    - Missing observation days (gaps)
    - SKUs with zero or very low recorded sales
    """
    async with get_conn() as conn:
        # Stockout periods
        stockouts = await conn.fetch(
            """
            SELECT
                sku_id,
                warehouse_id,
                MIN(txn_date) as start_date,
                MAX(txn_date) as end_date,
                COUNT(*) as days,
                SUM(quantity) as total_qty_during_stockout
            FROM sales.transactions
            WHERE is_stockout = TRUE
            GROUP BY sku_id, warehouse_id
            ORDER BY sku_id, warehouse_id
            """
        )

        # Missing observation days (check expected vs actual)
        gaps = await conn.fetch(
            """
            WITH date_range AS (
                SELECT generate_series(
                    MIN(txn_date), MAX(txn_date), '1 day'::interval
                )::date as d
                FROM sales.transactions
            ),
            expected AS (
                SELECT d.d as txn_date, s.sku_id, w.warehouse_id
                FROM date_range d
                CROSS JOIN (SELECT DISTINCT sku_id FROM sales.transactions) s
                CROSS JOIN (SELECT DISTINCT warehouse_id FROM sales.transactions) w
            ),
            actual AS (
                SELECT txn_date, sku_id, warehouse_id
                FROM sales.transactions
                WHERE is_stockout = FALSE
            )
            SELECT
                e.sku_id,
                e.warehouse_id,
                COUNT(*) as missing_days
            FROM expected e
            LEFT JOIN actual a
                ON a.txn_date = e.txn_date
                AND a.sku_id = e.sku_id
                AND a.warehouse_id = e.warehouse_id
            WHERE a.txn_date IS NULL
            GROUP BY e.sku_id, e.warehouse_id
            HAVING COUNT(*) > 2
            ORDER BY missing_days DESC
            LIMIT 20
            """
        )

    return {
        "stockout_periods": [dict(r) for r in stockouts],
        "missing_observation_gaps": [dict(r) for r in gaps],
        "summary": {
            "stockout_periods_count": len(stockouts),
            "skus_with_gaps": len(gaps),
            "note": "Stockout periods contain suppressed demand. "
                    "Missing gaps may indicate data entry failures or days with no transactions.",
        },
    }
