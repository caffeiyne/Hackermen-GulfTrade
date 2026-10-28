"""
Simulator control routes — start, pause, resume, reset, seek, inject.
"""

from datetime import date

from fastapi import APIRouter, HTTPException

from app.db import get_conn, notify_event
from app.engine.scenario_runner import runner
from app.models import StartSimulatorRequest, InjectDisruptionRequest
from app.ai.agent import agent

simulator_router = APIRouter()


@simulator_router.get("/status")
async def get_status():
    """Get current simulator state."""
    state = await runner.get_state()
    return {
        "status": state.get("status", "idle"),
        "scenario": state.get("scenario_name"),
        "sim_clock": state.get("sim_clock"),
        "sim_start_date": state.get("sim_start_date"),
        "speed": state.get("speed_multiplier", 1),
        "started_at": state.get("started_at"),
        "is_paused": runner.is_paused,
    }


@simulator_router.post("/start")
async def start_simulator(req: StartSimulatorRequest):
    """Start a scenario."""
    try:
        await runner.start(req.scenario, req.speed)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"status": "running", "scenario": req.scenario, "speed": req.speed}


@simulator_router.post("/pause")
async def pause_simulator():
    """Pause the running simulation."""
    await runner.pause()
    return {"status": "paused"}


@simulator_router.post("/resume")
async def resume_simulator():
    """Resume a paused simulation."""
    await runner.resume()
    return {"status": "running"}


@simulator_router.post("/reset")
async def reset_simulator():
    """
    Full demo reset — stops the simulation, clears all generated data,
    and restores the initial case-study stock levels.
    No need to re-run setup.py or any scripts.
    """
    await runner.reset()

    async with get_conn() as conn:
        # Clear all simulation-generated transactional data
        await conn.execute("DELETE FROM sales.transactions")
        await conn.execute("DELETE FROM orders.transfers")
        await conn.execute("DELETE FROM events.disruptions")
        await conn.execute("DELETE FROM events.audit_log")
        await conn.execute("DELETE FROM inventory.stock_age")

        # Reset simulator state to idle at start date
        await conn.execute(
            "UPDATE simulator.state "
            "SET status = 'idle', sim_clock = sim_start_date, "
            "scenario_name = NULL, speed_multiplier = 1, "
            "started_at = NULL, updated_at = now() "
            "WHERE id = 1"
        )

        # Restore initial stock levels (upsert)
        await conn.execute("""
            INSERT INTO inventory.stock_levels (sku_id, warehouse_id, available_qty, reserved_qty, safety_stock, inbound_qty)
            SELECT
                s.sku_id,
                w.warehouse_id,
                CASE
                    WHEN s.sku_id = 'CHG-UC-001' AND w.warehouse_id = 'DXB' THEN 500
                    WHEN s.sku_id = 'CHG-UC-001' AND w.warehouse_id = 'AUH' THEN 100
                    WHEN s.sku_id = 'CHG-UC-001' AND w.warehouse_id = 'SHJ' THEN 300
                    WHEN s.sku_id = 'CHG-UC-002' AND w.warehouse_id = 'DXB' THEN 320
                    WHEN s.sku_id = 'CHG-UC-002' AND w.warehouse_id = 'AUH' THEN 80
                    WHEN s.sku_id = 'CHG-UC-002' AND w.warehouse_id = 'SHJ' THEN 180
                    WHEN s.sku_id = 'CHG-UC-003' AND w.warehouse_id = 'DXB' THEN 150
                    WHEN s.sku_id = 'CHG-UC-003' AND w.warehouse_id = 'AUH' THEN 60
                    WHEN s.sku_id = 'CHG-UC-003' AND w.warehouse_id = 'SHJ' THEN 90
                    WHEN s.sku_id = 'CHG-UC-004' AND w.warehouse_id = 'DXB' THEN 400
                    WHEN s.sku_id = 'CHG-UC-004' AND w.warehouse_id = 'AUH' THEN 120
                    WHEN s.sku_id = 'CHG-UC-004' AND w.warehouse_id = 'SHJ' THEN 200
                    WHEN s.product_type = 'cable'     AND w.warehouse_id = 'DXB' THEN 250
                    WHEN s.product_type = 'cable'     AND w.warehouse_id = 'AUH' THEN 90
                    WHEN s.product_type = 'cable'     AND w.warehouse_id = 'SHJ' THEN 140
                    WHEN s.product_type = 'power_bank' AND w.warehouse_id = 'DXB' THEN 120
                    WHEN s.product_type = 'power_bank' AND w.warehouse_id = 'AUH' THEN 45
                    WHEN s.product_type = 'power_bank' AND w.warehouse_id = 'SHJ' THEN 70
                    WHEN s.product_type = 'earbuds'   AND w.warehouse_id = 'DXB' THEN 90
                    WHEN s.product_type = 'earbuds'   AND w.warehouse_id = 'AUH' THEN 30
                    WHEN s.product_type = 'earbuds'   AND w.warehouse_id = 'SHJ' THEN 50
                    WHEN s.product_type = 'mouse'     AND w.warehouse_id = 'DXB' THEN 110
                    WHEN s.product_type = 'mouse'     AND w.warehouse_id = 'AUH' THEN 40
                    WHEN s.product_type = 'mouse'     AND w.warehouse_id = 'SHJ' THEN 60
                END AS available_qty,
                CASE
                    WHEN s.sku_id = 'CHG-UC-001' AND w.warehouse_id = 'DXB' THEN 50
                    WHEN s.sku_id = 'CHG-UC-001' AND w.warehouse_id = 'AUH' THEN 20
                    WHEN s.sku_id = 'CHG-UC-001' AND w.warehouse_id = 'SHJ' THEN 30
                    ELSE 0
                END AS reserved_qty,
                CASE
                    WHEN s.unit_cost < 10  THEN 30
                    WHEN s.unit_cost < 25  THEN 50
                    WHEN s.unit_cost < 50  THEN 40
                    ELSE 25
                END AS safety_stock,
                CASE
                    WHEN s.sku_id = 'CHG-UC-001' AND w.warehouse_id = 'AUH' THEN 200
                    WHEN s.sku_id = 'CHG-UC-003' AND w.warehouse_id = 'DXB' THEN 80
                    WHEN s.sku_id = 'PWB-002'    AND w.warehouse_id = 'DXB' THEN 40
                    ELSE 0
                END AS inbound_qty
            FROM master.skus s
            CROSS JOIN master.warehouses w
            ON CONFLICT (sku_id, warehouse_id) DO UPDATE
            SET available_qty = EXCLUDED.available_qty,
                reserved_qty  = EXCLUDED.reserved_qty,
                safety_stock  = EXCLUDED.safety_stock,
                inbound_qty   = EXCLUDED.inbound_qty
        """)

        # Restore stock age buckets
        await conn.execute("""
            INSERT INTO inventory.stock_age (sku_id, warehouse_id, age_bucket, qty)
            SELECT 'CHG-UC-001', 'DXB', '0-30', 150
            UNION ALL SELECT 'CHG-UC-001', 'DXB', '31-60', 200
            UNION ALL SELECT 'CHG-UC-001', 'DXB', '61-90', 120
            UNION ALL SELECT 'CHG-UC-001', 'DXB', '90+', 30
            UNION ALL SELECT 'CHG-UC-004', 'DXB', '0-30', 200
            UNION ALL SELECT 'CHG-UC-004', 'DXB', '31-60', 150
            UNION ALL SELECT 'CHG-UC-004', 'DXB', '61-90', 50
            UNION ALL SELECT 'CHG-UC-001', 'AUH', '0-30', 80
            UNION ALL SELECT 'CHG-UC-001', 'AUH', '31-60', 20
            UNION ALL SELECT 'CHG-UC-001', 'SHJ', '0-30', 180
            UNION ALL SELECT 'CHG-UC-001', 'SHJ', '31-60', 90
            UNION ALL SELECT 'CHG-UC-001', 'SHJ', '61-90', 30
            ON CONFLICT (sku_id, warehouse_id, age_bucket) DO UPDATE
            SET qty = EXCLUDED.qty
        """)

        # Restore initial inbound POs
        await conn.execute("""
            INSERT INTO orders.inbound (po_id, sku_id, warehouse_id, quantity, supplier_id, order_date, expected_date, revised_date, status)
            VALUES
                ('PO-2024-001', 'CHG-UC-001', 'AUH', 200, 'SUP-CHG-01', '2024-10-01', '2024-10-15', NULL, 'in_transit'),
                ('PO-2024-002', 'CHG-UC-003', 'DXB', 80,  'SUP-CHG-02', '2024-10-05', '2024-10-26', NULL, 'in_transit'),
                ('PO-2024-003', 'PWB-002',    'DXB', 40,  'SUP-PWB-01', '2024-10-10', '2024-10-28', NULL, 'in_transit')
            ON CONFLICT (po_id) DO UPDATE
            SET quantity = EXCLUDED.quantity,
                status = EXCLUDED.status,
                revised_date = EXCLUDED.revised_date
        """)

    # Wake the agent so it immediately re-analyzes the fresh data
    import asyncio
    asyncio.create_task(agent._run_reasoning_cycle("reset"))

    await notify_event("simulator_reset", {"message": "Demo data restored to initial state"})

    return {
        "status": "idle",
        "message": "Demo fully reset — stock, sales, transfers, and disruptions cleared. Initial data restored.",
    }


@simulator_router.post("/seek")
async def seek_simulator(target_date: date):
    """Jump the sim clock to a specific date."""
    await runner.seek(target_date)
    return {"status": "seeked", "sim_clock": str(target_date)}


@simulator_router.post("/inject")
async def inject_disruption(req: InjectDisruptionRequest):
    """Manually inject a custom disruption mid-simulation."""
    async with get_conn() as conn:
        # Get current sim date
        state = await conn.fetchrow("SELECT sim_clock FROM simulator.state WHERE id = 1")
        sim_date = state["sim_clock"] if state and state["sim_clock"] else date.today()

        end_date = sim_date
        from datetime import timedelta
        end_date = sim_date + timedelta(days=req.duration_days)

        row = await conn.fetchrow(
            """
            INSERT INTO events.disruptions
                (disruption_type, title, description, affected_skus, affected_routes,
                 start_date, end_date, severity, source, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'manual_injection', TRUE)
            RETURNING *
            """,
            req.disruption_type, req.title, req.description,
            req.affected_skus, req.affected_routes,
            sim_date, end_date, req.severity,
        )

    await notify_event("disruption_injected", {
        "title": req.title,
        "type": req.disruption_type,
        "affected_skus": req.affected_skus,
        "sim_clock": str(sim_date),
    })

    # Wake the agent — it will immediately reassess all recommendations
    import asyncio
    asyncio.create_task(agent.react_to_event("disruption_injected", {
        "title": req.title,
        "type": req.disruption_type,
        "affected_skus": req.affected_skus,
    }))

    return dict(row)


@simulator_router.get("/timeline")
async def get_timeline(limit: int = 100):
    """Get the simulation event audit log (most recent first).
    Filters out low-level sale_recorded events to keep the feed focused
    on meaningful events (disruptions, agent actions, transfers, scenario milestones).
    """
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT log_id, event_type, event_data, sim_timestamp, real_timestamp
            FROM events.audit_log
            WHERE event_type != 'sale_recorded'
            ORDER BY log_id DESC
            LIMIT $1
            """,
            limit,
        )
    return [dict(r) for r in rows]


@simulator_router.get("/scenarios")
async def list_scenarios():
    """List available pre-built scenarios."""
    from app.engine.scenarios import SCENARIOS
    return [
        {
            "name": s["name"],
            "title": s["title"],
            "description": s["description"],
            "event_count": len(s["events"]),
            "disruptions": len(s.get("disruptions_to_activate", [])),
        }
        for s in SCENARIOS.values()
    ]
