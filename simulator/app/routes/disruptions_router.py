"""
Disruptions routes — active and historical disruption signals.
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException

import json

from app.db import get_conn, notify_event
from app.models import Disruption, DisruptionUpdate

disruptions_router = APIRouter()


@disruptions_router.get("", response_model=list[Disruption])
async def list_disruptions(active_only: bool = False):
    """Get all disruption signals. Optionally filter to active only."""
    async with get_conn() as conn:
        if active_only:
            rows = await conn.fetch(
                "SELECT * FROM events.disruptions WHERE is_active = TRUE ORDER BY start_date"
            )
        else:
            rows = await conn.fetch("SELECT * FROM events.disruptions ORDER BY start_date DESC")
    return [dict(r) for r in rows]


@disruptions_router.get("/{disruption_id}", response_model=Disruption)
async def get_disruption(disruption_id: UUID):
    async with get_conn() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM events.disruptions WHERE disruption_id = $1",
            disruption_id,
        )
    if not row:
        raise HTTPException(status_code=404, detail="Disruption not found")
    return dict(row)


@disruptions_router.post("", response_model=Disruption)
async def create_disruption(d: Disruption):
    """Create a new disruption signal (market event / supplier notice / logistics alert)."""
    async with get_conn() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO events.disruptions
                (disruption_type, title, description, affected_skus, affected_routes,
                 start_date, end_date, severity, source, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *
            """,
            d.disruption_type, d.title, d.description, d.affected_skus, d.affected_routes,
            d.start_date, d.end_date, d.severity, d.source, d.is_active,
        )
    return dict(row)


@disruptions_router.patch("/{disruption_id}", response_model=Disruption)
async def update_disruption(disruption_id: UUID, u: DisruptionUpdate):
    """
    Change a disruption assumption once (deactivate it, change severity or end date,
    narrow the affected SKUs/routes). Forecast, imbalances, recommendations and the
    impact estimate are all recomputed from the new assumption.
    """
    fields = {k: v for k, v in u.model_dump().items()
              if k not in ("changed_by", "note") and v is not None}
    if not fields:
        raise HTTPException(status_code=400, detail="Nothing to change")
    async with get_conn() as conn:
        before = await conn.fetchrow("SELECT * FROM events.disruptions WHERE disruption_id = $1", disruption_id)
        if not before:
            raise HTTPException(status_code=404, detail="Disruption not found")
        sets, params = [], []
        for i, (k, v) in enumerate(fields.items(), start=1):
            sets.append(f"{k} = ${i}")
            params.append(v.value if hasattr(v, "value") else v)
        params.append(disruption_id)
        row = await conn.fetchrow(
            f"UPDATE events.disruptions SET {', '.join(sets)} WHERE disruption_id = ${len(params)} RETURNING *",
            *params,
        )
        await conn.execute(
            "INSERT INTO events.audit_log (event_type, event_data, sim_timestamp) VALUES ('assumption_changed', $1, CURRENT_DATE)",
            json.dumps({
                "disruption_id": str(disruption_id), "title": before["title"], "changed_by": u.changed_by,
                "note": u.note,
                "before": {k: (str(before[k]) if before[k] is not None else None) for k in fields},
                "after": {k: (str(row[k]) if row[k] is not None else None) for k in fields},
            }),
        )

    await notify_event("assumption_changed", {"disruption_id": str(disruption_id), "title": row["title"], "changes": list(fields)})
    from app.ai.agent import agent
    import asyncio
    asyncio.create_task(agent.react_to_event("assumption_changed", {"disruption_id": str(disruption_id)}))
    return dict(row)
