"""
Disruptions routes — active and historical disruption signals.
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.db import get_conn
from app.models import Disruption

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
