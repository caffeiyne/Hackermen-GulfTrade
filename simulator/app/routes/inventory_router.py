"""
Inventory routes — stock levels, stock age, summary views.

IMPORTANT: Route order matters in FastAPI. Specific literal paths
(/age/all, /summary/overview) MUST be registered BEFORE parameterized
paths (/{sku_id}/{warehouse_id}), otherwise FastAPI matches the
parameter route first and the query fails.
"""

from datetime import date
from typing import Optional

import asyncio
import json

from fastapi import APIRouter, HTTPException, Query

from app.db import get_conn, notify_event
from app.models import StockLevel, StockAge, StockCorrection

inventory_router = APIRouter()


@inventory_router.get("", response_model=list[StockLevel])
async def list_stock_levels(
    warehouse_id: Optional[str] = Query(None, description="Filter by warehouse"),
    sku_id: Optional[str] = Query(None, description="Filter by SKU"),
):
    """Get current stock levels across all warehouses (with optional filters)."""
    query = "SELECT * FROM inventory.stock_levels"
    conditions = []
    params = []
    idx = 1

    if warehouse_id:
        conditions.append(f"warehouse_id = ${idx}")
        params.append(warehouse_id)
        idx += 1
    if sku_id:
        conditions.append(f"sku_id = ${idx}")
        params.append(sku_id)
        idx += 1

    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY sku_id, warehouse_id"

    async with get_conn() as conn:
        rows = await conn.fetch(query, *params)
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Specific literal paths — MUST come before /{sku_id}/{warehouse_id}
# ---------------------------------------------------------------------------

@inventory_router.get("/age/all", response_model=list[StockAge])
async def list_stock_age(
    warehouse_id: Optional[str] = None,
    sku_id: Optional[str] = None,
):
    """Get stock age buckets. Flags ageing inventory."""
    query = "SELECT * FROM inventory.stock_age"
    conditions = []
    params = []
    idx = 1
    if warehouse_id:
        conditions.append(f"warehouse_id = ${idx}")
        params.append(warehouse_id)
        idx += 1
    if sku_id:
        conditions.append(f"sku_id = ${idx}")
        params.append(sku_id)
        idx += 1
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY sku_id, warehouse_id, age_bucket"

    async with get_conn() as conn:
        rows = await conn.fetch(query, *params)
    return [dict(r) for r in rows]


@inventory_router.get("/summary/overview")
async def inventory_overview():
    """
    Dashboard overview: aggregated stock metrics per warehouse.
    Returns total available, reserved, safety, inbound, and ageing counts.
    """
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT
                sl.warehouse_id,
                w.name as warehouse_name,
                SUM(sl.available_qty) as total_available,
                SUM(sl.reserved_qty) as total_reserved,
                SUM(sl.safety_stock) as total_safety,
                SUM(sl.inbound_qty) as total_inbound,
                SUM(sl.available_qty + sl.reserved_qty) as total_stock,
                COUNT(DISTINCT sl.sku_id) as sku_count,
                COALESCE(SUM(CASE WHEN sa.age_bucket IN ('61-90','90+') THEN sa.qty ELSE 0 END), 0) as ageing_units
            FROM inventory.stock_levels sl
            JOIN master.warehouses w ON w.warehouse_id = sl.warehouse_id
            LEFT JOIN inventory.stock_age sa ON sa.sku_id = sl.sku_id AND sa.warehouse_id = sl.warehouse_id
            GROUP BY sl.warehouse_id, w.name
            ORDER BY sl.warehouse_id
            """
        )
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Parameterized path — MUST come last
# ---------------------------------------------------------------------------

@inventory_router.get("/{sku_id}/{warehouse_id}", response_model=StockLevel)
async def get_stock_level(sku_id: str, warehouse_id: str):
    """Get stock level for a specific SKU at a specific warehouse."""
    async with get_conn() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM inventory.stock_levels WHERE sku_id = $1 AND warehouse_id = $2",
            sku_id, warehouse_id,
        )
    if not row:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"No stock record for {sku_id} at {warehouse_id}")
    return dict(row)


@inventory_router.patch("/{sku_id}/{warehouse_id}", response_model=StockLevel)
async def correct_stock_record(sku_id: str, warehouse_id: str, c: StockCorrection):
    """
    Correct a stock record once; the agent recomputes forecast-dependent
    imbalances, recommendations and impact from the corrected value.
    Every correction is written to the audit log with before/after values.
    """
    fields = {k: v for k, v in c.model_dump().items()
              if k not in ("corrected_by", "note") and v is not None}
    if not fields:
        raise HTTPException(status_code=400, detail="Nothing to correct")
    async with get_conn() as conn:
        before = await conn.fetchrow(
            "SELECT * FROM inventory.stock_levels WHERE sku_id = $1 AND warehouse_id = $2",
            sku_id, warehouse_id,
        )
        if not before:
            raise HTTPException(status_code=404, detail=f"No stock record for {sku_id} at {warehouse_id}")
        sets, params = [], []
        for i, (k, v) in enumerate(fields.items(), start=1):
            sets.append(f"{k} = ${i}")
            params.append(v)
        params += [sku_id, warehouse_id]
        row = await conn.fetchrow(
            f"UPDATE inventory.stock_levels SET {', '.join(sets)}, updated_at = now() "
            f"WHERE sku_id = ${len(params) - 1} AND warehouse_id = ${len(params)} RETURNING *",
            *params,
        )
        await conn.execute(
            "INSERT INTO events.audit_log (event_type, event_data, sim_timestamp) VALUES ('record_corrected', $1, CURRENT_DATE)",
            json.dumps({
                "sku_id": sku_id, "warehouse_id": warehouse_id, "corrected_by": c.corrected_by, "note": c.note,
                "before": {k: before[k] for k in fields}, "after": {k: row[k] for k in fields},
            }),
        )

    await notify_event("record_corrected", {"sku_id": sku_id, "warehouse_id": warehouse_id, "fields": list(fields)})
    from app.ai.agent import agent
    asyncio.create_task(agent.react_to_event("record_corrected", {"sku_id": sku_id, "warehouse_id": warehouse_id}))
    return dict(row)
