"""
Master data routes — SKUs, warehouses, transfer matrix, holding costs.
"""

from typing import Optional

from fastapi import APIRouter, Query

from app.db import get_conn
from app.models import SKU, Warehouse, TransferRoute, ProductType

master_router = APIRouter()


@master_router.get("/skus", response_model=list[SKU])
async def list_skus(product_type: Optional[ProductType] = None):
    """List all SKUs, optionally filtered by product type."""
    async with get_conn() as conn:
        if product_type:
            rows = await conn.fetch(
                "SELECT * FROM master.skus WHERE product_type = $1 AND is_active = TRUE ORDER BY sku_id",
                product_type.value,
            )
        else:
            rows = await conn.fetch(
                "SELECT * FROM master.skus WHERE is_active = TRUE ORDER BY sku_id"
            )
    return [dict(r) for r in rows]


@master_router.get("/skus/{sku_id}", response_model=SKU)
async def get_sku(sku_id: str):
    async with get_conn() as conn:
        row = await conn.fetchrow("SELECT * FROM master.skus WHERE sku_id = $1", sku_id)
    if not row:
        return {"error": "SKU not found"}
    return dict(row)


@master_router.get("/warehouses", response_model=list[Warehouse])
async def list_warehouses():
    async with get_conn() as conn:
        rows = await conn.fetch("SELECT * FROM master.warehouses ORDER BY warehouse_id")
    return [dict(r) for r in rows]


@master_router.get("/transfer-matrix", response_model=list[TransferRoute])
async def list_transfer_routes():
    """Get inter-location transfer cost + lead time matrix."""
    async with get_conn() as conn:
        rows = await conn.fetch(
            "SELECT * FROM master.transfer_matrix WHERE active = TRUE ORDER BY from_warehouse, to_warehouse"
        )
    return [dict(r) for r in rows]


@master_router.get("/holding-costs")
async def list_holding_costs(sku_id: Optional[str] = None):
    """Get daily holding costs. Optionally filter by SKU."""
    async with get_conn() as conn:
        if sku_id:
            rows = await conn.fetch(
                "SELECT * FROM master.holding_costs WHERE sku_id = $1 ORDER BY warehouse_id",
                sku_id,
            )
        else:
            rows = await conn.fetch("SELECT * FROM master.holding_costs ORDER BY sku_id, warehouse_id")
    return [dict(r) for r in rows]
