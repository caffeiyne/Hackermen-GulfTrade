"""
Orders routes — inbound POs, transfer proposals, approve/reject workflow.
"""

import json
from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.db import get_conn, notify_event
from app.models import InboundOrder, TransferProposal, TransferDecision

orders_router = APIRouter()


@orders_router.get("/inbound", response_model=list[InboundOrder])
async def list_inbound_orders(status: Optional[str] = None):
    """Get all inbound purchase orders."""
    async with get_conn() as conn:
        if status:
            rows = await conn.fetch(
                "SELECT * FROM orders.inbound WHERE status = $1 ORDER BY expected_date",
                status,
            )
        else:
            rows = await conn.fetch("SELECT * FROM orders.inbound ORDER BY expected_date")
    return [dict(r) for r in rows]


@orders_router.get("/transfers", response_model=list[TransferProposal])
async def list_transfers(status: Optional[str] = None):
    """List transfer proposals (default: all statuses)."""
    async with get_conn() as conn:
        if status:
            rows = await conn.fetch(
                "SELECT * FROM orders.transfers WHERE status = $1 ORDER BY created_at DESC",
                status,
            )
        else:
            rows = await conn.fetch("SELECT * FROM orders.transfers ORDER BY created_at DESC")
    return [dict(r) for r in rows]


@orders_router.post("/transfers", response_model=TransferProposal)
async def create_transfer(t: TransferProposal):
    """Create a new transfer proposal."""
    async with get_conn() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO orders.transfers
                (sku_id, from_warehouse, to_warehouse, quantity,
                 transfer_cost, lead_time_days, reason, expected_benefit, net_benefit, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'proposed')
            RETURNING *
            """,
            t.sku_id, t.from_warehouse, t.to_warehouse, t.quantity,
            t.transfer_cost, t.lead_time_days, t.reason,
            t.expected_benefit, t.net_benefit,
        )
    return dict(row)


@orders_router.post("/transfers/{transfer_id}/approve")
async def approve_transfer(transfer_id: UUID, decision: TransferDecision):
    """Approve a transfer — Sara authorizes the action."""
    async with get_conn() as conn:
        row = await conn.fetchrow(
            """
            UPDATE orders.transfers
            SET status = 'approved', approved_by = $1, approved_at = now(),
                updated_at = now()
            WHERE transfer_id = $2 AND status = 'proposed'
            RETURNING *
            """,
            decision.approved_by, transfer_id,
        )
    if not row:
        raise HTTPException(status_code=404, detail="Transfer not found or not in 'proposed' status")

    # Notify
    await notify_event("transfer_approved", {
        "transfer_id": str(row["transfer_id"]),
        "sku_id": row["sku_id"],
        "from_warehouse": row["from_warehouse"],
        "to_warehouse": row["to_warehouse"],
        "quantity": row["quantity"],
        "net_benefit": float(row["net_benefit"]) if row["net_benefit"] else 0,
        "sim_clock": str(row["approved_at"]),
    })

    return {"status": "approved", "transfer": dict(row)}


@orders_router.post("/transfers/{transfer_id}/reject")
async def reject_transfer(transfer_id: UUID, decision: TransferDecision):
    """Reject a transfer — with reason."""
    async with get_conn() as conn:
        row = await conn.fetchrow(
            """
            UPDATE orders.transfers
            SET status = 'rejected', approved_by = $1, approved_at = now(),
                rejection_reason = $2, updated_at = now()
            WHERE transfer_id = $3 AND status = 'proposed'
            RETURNING *
            """,
            decision.approved_by, decision.rejection_reason, transfer_id,
        )
    if not row:
        raise HTTPException(status_code=404, detail="Transfer not found or not in 'proposed' status")

    await notify_event("transfer_rejected", {
        "transfer_id": str(row["transfer_id"]),
        "sku_id": row["sku_id"],
        "from_warehouse": row["from_warehouse"],
        "to_warehouse": row["to_warehouse"],
        "quantity": row["quantity"],
        "reason": decision.rejection_reason,
        "sim_clock": str(row["approved_at"]),
    })

    return {"status": "rejected", "transfer": dict(row)}


@orders_router.post("/recommendations/{recommendation_id}/approve")
async def approve_recommendation(recommendation_id: str, decision: TransferDecision):
    """
    Approve a recommendation directly — creates a transfer proposal,
    immediately marks it approved, and executes the stock movement.

    This is the flow used by the Actions page: the planner sees a ranked
    recommendation and clicks Approve. The system:
      1. Creates a transfer record (status = approved)
      2. Moves stock from source → destination
      3. Marks the transfer as completed
      4. Emits audit events + WebSocket notifications
    """
    # Parse recommendation_id: REC-{sku}-{from}-{to}
    parts = recommendation_id.split("-")
    if len(parts) < 4:
        raise HTTPException(status_code=400, detail="Invalid recommendation_id format")

    # recommendation_id format: REC-CHG-UC-002-DXB-AUH
    # We need to reconstruct sku_id, from, to from the parts after "REC-"
    # sku_id can contain dashes, so we need the last 2 parts as from/to
    from_wh = parts[-2]
    to_wh = parts[-1]
    sku_id = "-".join(parts[1:-2])

    async with get_conn() as conn:
        # Check source has enough stock
        source_stock = await conn.fetchrow(
            """
            SELECT available_qty, reserved_qty, safety_stock
            FROM inventory.stock_levels
            WHERE sku_id = $1 AND warehouse_id = $2
            """,
            sku_id, from_wh,
        )
        if not source_stock:
            raise HTTPException(status_code=404, detail=f"No stock record for {sku_id} at {from_wh}")

        # Get the recommendation details from the transfers table or re-derive
        # Check if a proposal already exists
        existing = await conn.fetchrow(
            """
            SELECT * FROM orders.transfers
            WHERE sku_id = $1 AND from_warehouse = $2 AND to_warehouse = $3
              AND status IN ('proposed', 'approved', 'in_transit', 'completed')
            ORDER BY created_at DESC LIMIT 1
            """,
            sku_id, from_wh, to_wh,
        )

        if existing:
            if existing["status"] == "proposed":
                # Approve the existing proposal
                transfer = await conn.fetchrow(
                    """
                    UPDATE orders.transfers
                    SET status = 'approved', approved_by = $1, approved_at = now(),
                        updated_at = now()
                    WHERE transfer_id = $2
                    RETURNING *
                    """,
                    decision.approved_by, existing["transfer_id"],
                )
            else:
                raise HTTPException(
                    status_code=409,
                    detail=f"Transfer already {existing['status']}"
                )
        else:
            # Create a new approved transfer directly
            transfer = await conn.fetchrow(
                """
                INSERT INTO orders.transfers
                    (sku_id, from_warehouse, to_warehouse, quantity,
                     transfer_cost, lead_time_days, reason, status,
                     approved_by, approved_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, 'approved', $8, now())
                RETURNING *
                """,
                sku_id, from_wh, to_wh,
                source_stock["available_qty"] - source_stock["safety_stock"],  # max transferable
                0,  # cost — will be updated if route exists
                f"Approved from Actions page by {decision.approved_by}",
                decision.approved_by,
            )

        qty = transfer["quantity"]
        transfer_id = transfer["transfer_id"]

        # --- Execute the stock movement ---
        # Reduce source
        await conn.execute(
            """
            UPDATE inventory.stock_levels
            SET available_qty = GREATEST(0, available_qty - $1),
                updated_at = now()
            WHERE sku_id = $2 AND warehouse_id = $3
            """,
            qty, sku_id, from_wh,
        )

        # Increase destination
        await conn.execute(
            """
            INSERT INTO inventory.stock_levels
                (sku_id, warehouse_id, available_qty, reserved_qty, safety_stock, inbound_qty)
            VALUES ($1, $2, $3, 0, 0, 0)
            ON CONFLICT (sku_id, warehouse_id)
            DO UPDATE SET available_qty = inventory.stock_levels.available_qty + $3,
                          updated_at = now()
            """,
            sku_id, to_wh, qty,
        )

        # Mark transfer as completed
        await conn.execute(
            """
            UPDATE orders.transfers
            SET status = 'completed', updated_at = now()
            WHERE transfer_id = $1
            """,
            transfer_id,
        )

        # Audit log — approved
        await conn.execute(
            """
            INSERT INTO events.audit_log (event_type, event_data, sim_timestamp)
            VALUES ('transfer_approved', $1, $2)
            """,
            json.dumps({
                "transfer_id": str(transfer_id),
                "sku_id": sku_id,
                "from_warehouse": from_wh,
                "to_warehouse": to_wh,
                "quantity": qty,
                "approved_by": decision.approved_by,
            }),
            date.today(),
        )

        # Audit log — completed
        await conn.execute(
            """
            INSERT INTO events.audit_log (event_type, event_data, sim_timestamp)
            VALUES ('transfer_completed', $1, $2)
            """,
            json.dumps({
                "transfer_id": str(transfer_id),
                "sku_id": sku_id,
                "from_warehouse": from_wh,
                "to_warehouse": to_wh,
                "quantity": qty,
            }),
            date.today(),
        )

    # Notify via WebSocket
    await notify_event("transfer_approved", {
        "transfer_id": str(transfer_id),
        "sku_id": sku_id,
        "from_warehouse": from_wh,
        "to_warehouse": to_wh,
        "quantity": qty,
        "approved_by": decision.approved_by,
    })

    await notify_event("transfer_completed", {
        "transfer_id": str(transfer_id),
        "sku_id": sku_id,
        "from_warehouse": from_wh,
        "to_warehouse": to_wh,
        "quantity": qty,
    })

    return {
        "status": "completed",
        "transfer_id": str(transfer_id),
        "sku_id": sku_id,
        "from_warehouse": from_wh,
        "to_warehouse": to_wh,
        "quantity_moved": qty,
        "message": f"Transfer approved and executed: {qty} units of {sku_id} moved from {from_wh} to {to_wh}",
    }


@orders_router.post("/recommendations/{recommendation_id}/reject")
async def reject_recommendation(recommendation_id: str, decision: TransferDecision):
    """Reject a recommendation — records the decision."""
    parts = recommendation_id.split("-")
    if len(parts) < 4:
        raise HTTPException(status_code=400, detail="Invalid recommendation_id format")

    from_wh = parts[-2]
    to_wh = parts[-1]
    sku_id = "-".join(parts[1:-2])

    async with get_conn() as conn:
        # Check if a proposal exists
        existing = await conn.fetchrow(
            """
            SELECT * FROM orders.transfers
            WHERE sku_id = $1 AND from_warehouse = $2 AND to_warehouse = $3
              AND status = 'proposed'
            ORDER BY created_at DESC LIMIT 1
            """,
            sku_id, from_wh, to_wh,
        )

        if existing:
            await conn.execute(
                """
                UPDATE orders.transfers
                SET status = 'rejected', approved_by = $1, approved_at = now(),
                    rejection_reason = $2, updated_at = now()
                WHERE transfer_id = $3
                """,
                decision.approved_by, decision.rejection_reason, existing["transfer_id"],
            )

        # Audit log
        await conn.execute(
            """
            INSERT INTO events.audit_log (event_type, event_data, sim_timestamp)
            VALUES ('transfer_rejected', $1, $2)
            """,
            json.dumps({
                "sku_id": sku_id,
                "from_warehouse": from_wh,
                "to_warehouse": to_wh,
                "reason": decision.rejection_reason,
                "rejected_by": decision.approved_by,
            }),
            date.today(),
        )

    await notify_event("transfer_rejected", {
        "sku_id": sku_id,
        "from_warehouse": from_wh,
        "to_warehouse": to_wh,
        "quantity": 0,
        "reason": decision.rejection_reason,
    })

    return {
        "status": "rejected",
        "sku_id": sku_id,
        "from_warehouse": from_wh,
        "to_warehouse": to_wh,
        "message": f"Transfer rejected: {decision.rejection_reason or 'No reason given'}",
    }

