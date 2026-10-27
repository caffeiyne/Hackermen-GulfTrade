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
    """Reset the simulation to idle. Note: does NOT re-seed the database."""
    await runner.reset()
    return {"status": "idle", "message": "Simulator reset. Re-seed database to restore initial data."}


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
    """Get the simulation event audit log (most recent first)."""
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT log_id, event_type, event_data, sim_timestamp, real_timestamp
            FROM events.audit_log
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
