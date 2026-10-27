"""
Scenario Runner — the heart of the real-time simulator.

Walks a scenario timeline, emitting events at simulated intervals.
Each "sim day" the engine:
  1. Generates new sales transactions (randomized but realistic)
  2. Updates inventory levels
  3. Writes an audit log entry
  4. Activates disruptions at their scheduled sim day
  5. Emits NOTIFY events for the WebSocket bridge

The sim clock advances 1 day per real-second (at speed=1).
"""

import asyncio
import json
import logging
import random
from datetime import date, timedelta
from decimal import Decimal

from app.db import get_conn, notify_event
from app.engine.scenarios import SCENARIOS
from app.engine.demand_profiles import DEMAND_PROFILES, BUYER_IDS
from app.ai.agent import agent

logger = logging.getLogger(__name__)


class ScenarioRunner:
    """Runs a simulation scenario in a background asyncio task."""

    def __init__(self):
        self._task: asyncio.Task | None = None
        self._running = False
        self._paused = asyncio.Event()
        self._paused.set()  # not paused initially
        self.speed = 1       # 1 real sec = 1 sim hour  →  24 sec = 1 sim day
        self.scenario = None
        self.sim_clock: date | None = None
        self.sim_day = 0

    @property
    def is_running(self) -> bool:
        return self._running

    @property
    def is_paused(self) -> bool:
        return not self._paused.is_set()

    async def start(self, scenario_name: str = "A", speed: int = 1):
        """Start (or restart) a scenario."""
        if self._running:
            await self.stop()

        self.scenario = SCENARIOS.get(scenario_name.upper())
        if not self.scenario:
            raise ValueError(f"Unknown scenario: {scenario_name}")

        self.speed = max(1, speed)
        self.sim_day = 0
        self._paused.set()

        # Set sim clock from DB
        async with get_conn() as conn:
            state = await conn.fetchrow("SELECT sim_clock FROM simulator.state WHERE id = 1")
            self.sim_clock = state["sim_clock"] if state and state["sim_clock"] else date(2024, 10, 27)

            # Update simulator state
            await conn.execute(
                """
                UPDATE simulator.state
                SET status = 'running', scenario_name = $1, sim_clock = $2,
                    speed_multiplier = $3, started_at = now(), updated_at = now()
                WHERE id = 1
                """,
                scenario_name, self.sim_clock, self.speed,
            )

            # Deactivate all disruptions at start (they'll be activated on schedule)
            await conn.execute("UPDATE events.disruptions SET is_active = FALSE")

        # Notify: simulation started
        await notify_event("simulator_started", {
            "scenario": scenario_name,
            "title": self.scenario["title"],
            "sim_clock": str(self.sim_clock),
            "speed": self.speed,
        })

        # Wake the agent
        asyncio.create_task(agent.react_to_event("simulator_started", {
            "scenario": scenario_name,
            "sim_clock": str(self.sim_clock),
        }))

        self._running = True
        self._task = asyncio.create_task(self._run_loop())

    async def pause(self):
        """Pause the simulation."""
        self._paused.clear()
        async with get_conn() as conn:
            await conn.execute(
                "UPDATE simulator.state SET status = 'paused', updated_at = now() WHERE id = 1"
            )
        await notify_event("simulator_paused", {"sim_clock": str(self.sim_clock)})

    async def resume(self):
        """Resume the simulation."""
        self._paused.set()
        async with get_conn() as conn:
            await conn.execute(
                "UPDATE simulator.state SET status = 'running', updated_at = now() WHERE id = 1"
            )
        await notify_event("simulator_resumed", {"sim_clock": str(self.sim_clock)})

    async def stop(self):
        """Stop and clean up."""
        self._running = False
        self._paused.set()  # unblock if paused
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

        async with get_conn() as conn:
            await conn.execute(
                "UPDATE simulator.state SET status = 'idle', updated_at = now() WHERE id = 1"
            )
        await notify_event("simulator_stopped", {"sim_clock": str(self.sim_clock)})

    async def reset(self):
        """Reset simulation — re-run seeds (caller should re-seed DB)."""
        await self.stop()
        self.sim_day = 0
        self.sim_clock = date(2024, 10, 27)
        async with get_conn() as conn:
            await conn.execute(
                """
                UPDATE simulator.state
                SET status = 'idle', scenario_name = NULL, sim_clock = $1,
                    started_at = NULL, speed_multiplier = 1, updated_at = now()
                WHERE id = 1
                """,
                self.sim_clock,
            )
            await conn.execute("UPDATE events.disruptions SET is_active = FALSE")
            await conn.execute("DELETE FROM orders.transfers WHERE status = 'proposed'")
        await notify_event("simulator_reset", {"sim_clock": str(self.sim_clock)})

    async def seek(self, target_date: date):
        """Jump the sim clock to a specific date."""
        self.sim_clock = target_date
        async with get_conn() as conn:
            await conn.execute(
                "UPDATE simulator.state SET sim_clock = $1, updated_at = now() WHERE id = 1",
                target_date,
            )
        await notify_event("simulator_seek", {"sim_clock": str(target_date)})

    async def _run_loop(self):
        """Main event loop — one iteration per simulated day."""
        try:
            while self._running:
                # Wait if paused
                await self._paused.wait()
                if not self._running:
                    break

                # Process this sim day
                await self._process_sim_day()

                # Advance sim clock
                self.sim_day += 1
                if self.sim_clock:
                    self.sim_clock = self.sim_clock + timedelta(days=1)

                    async with get_conn() as conn:
                        await conn.execute(
                            "UPDATE simulator.state SET sim_clock = $1, updated_at = now() WHERE id = 1",
                            self.sim_clock,
                        )

                # Emit clock tick
                await notify_event("sim_clock_tick", {
                    "sim_day": self.sim_day,
                    "sim_clock": str(self.sim_clock),
                    "scenario": self.scenario["name"],
                })

                # Check for scheduled scenario events
                await self._check_scheduled_events()

                # Wait for next day (24 seconds per day at speed=1)
                await asyncio.sleep(24.0 / self.speed)

        except asyncio.CancelledError:
            logger.info("Scenario runner cancelled")
        except Exception as e:
            logger.error(f"Scenario runner error: {e}", exc_info=True)
            self._running = False
            async with get_conn() as conn:
                await conn.execute(
                    "UPDATE simulator.state SET status = 'idle', updated_at = now() WHERE id = 1"
                )

    async def _process_sim_day(self):
        """Generate sales and update inventory for the current sim day."""
        if not self.sim_clock:
            return

        async with get_conn() as conn:
            for (sku_id, warehouse_id), profile in DEMAND_PROFILES.items():
                # Don't generate for every SKU every day (performance) — sample ~60%
                if random.random() > 0.6:
                    continue

                base = profile["base"]
                # Lower demand during the planning window (30-day forecast period)
                # since we're in "real-time" now
                qty = max(0, int(random.gauss(base * 0.8, base * 0.3)))
                if qty <= 0:
                    continue

                # Get unit price
                price_row = await conn.fetchrow(
                    "SELECT unit_price FROM master.skus WHERE sku_id = $1", sku_id
                )
                if not price_row:
                    continue

                unit_price = float(price_row["unit_price"])
                buyer_id = random.choice(BUYER_IDS)

                # Insert sale
                await conn.execute(
                    """
                    INSERT INTO sales.transactions (sku_id, warehouse_id, txn_date, quantity, unit_price, buyer_id, is_stockout)
                    VALUES ($1, $2, $3, $4, $5, $6, FALSE)
                    """,
                    sku_id, warehouse_id, self.sim_clock, qty, unit_price, buyer_id,
                )

                # Reduce inventory
                await conn.execute(
                    """
                    UPDATE inventory.stock_levels
                    SET available_qty = GREATEST(0, available_qty - $1),
                        updated_at = now()
                    WHERE sku_id = $2 AND warehouse_id = $3
                    """,
                    qty, sku_id, warehouse_id,
                )

                # Audit log
                await conn.execute(
                    """
                    INSERT INTO events.audit_log (event_type, event_data, sim_timestamp)
                    VALUES ('sale_recorded', $1, $2)
                    """,
                    json.dumps({
                        "sku_id": sku_id,
                        "warehouse_id": warehouse_id,
                        "quantity": qty,
                        "unit_price": unit_price,
                        "buyer_id": buyer_id,
                    }),
                    self.sim_clock,
                )

    async def _check_scheduled_events(self):
        """Check if any scenario events should trigger at this sim day."""
        if not self.scenario:
            return

        for event in self.scenario.get("events", []):
            if event["sim_day"] == self.sim_day:
                event_type = event["type"]

                # Activate disruptions
                if event_type == "disruption_published":
                    for d_sched in self.scenario.get("disruptions_to_activate", []):
                        if d_sched["sim_day"] == self.sim_day:
                            await self._activate_disruption(d_sched["disruption_key"])

                # Log scenario event
                await notify_event(event_type, {
                    "description": event["description"],
                    "sim_day": self.sim_day,
                    "sim_clock": str(self.sim_clock),
                    "scenario": self.scenario["name"],
                })

                # Notify the agent so it can react in real time
                asyncio.create_task(agent.react_to_event(event_type, {
                    "description": event["description"],
                    "sim_day": self.sim_day,
                    "sim_clock": str(self.sim_clock),
                }))

                async with get_conn() as conn:
                    await conn.execute(
                        """
                        INSERT INTO events.audit_log (event_type, event_data, sim_timestamp)
                        VALUES ($1, $2, $3)
                        """,
                        event_type,
                        json.dumps({
                            "description": event["description"],
                            "scenario": self.scenario["name"],
                        }),
                        self.sim_clock,
                    )

    async def _activate_disruption(self, disruption_key: str):
        """Activate a seeded disruption matching the key and emit a WS alert."""
        type_map = {
            "supply_shortage": "supply_shortage",
            "shipping_delay": "shipping_delay",
        }
        d_type = type_map.get(disruption_key)
        if not d_type:
            return

        async with get_conn() as conn:
            await conn.execute(
                """
                UPDATE events.disruptions
                SET is_active = TRUE
                WHERE disruption_type = $1 AND is_active = FALSE
                """,
                d_type,
            )
            row = await conn.fetchrow(
                """
                SELECT disruption_id, title, disruption_type, description,
                       affected_skus, affected_routes, severity,
                       start_date, end_date, source
                FROM events.disruptions
                WHERE disruption_type = $1 AND is_active = TRUE
                """,
                d_type,
            )
            if row:
                logger.info(f"Disruption activated: {row['title']}")

                # Emit a rich WS event so the frontend EmergencyAlertSystem can trigger
                affected_skus = row["affected_skus"] if row["affected_skus"] else []
                # asyncpg returns arrays as lists already; ensure it's a plain list
                if hasattr(affected_skus, "__iter__") and not isinstance(affected_skus, list):
                    affected_skus = list(affected_skus)

                await notify_event("disruption_published", {
                    "disruption_id": str(row["disruption_id"]) if row["disruption_id"] else None,
                    "title": row["title"],
                    "type": row["disruption_type"],
                    "description": row["description"],
                    "affected_skus": affected_skus,
                    "affected_routes": list(row["affected_routes"]) if row["affected_routes"] else [],
                    "severity": row["severity"],
                    "start_date": str(row["start_date"]) if row["start_date"] else None,
                    "end_date": str(row["end_date"]) if row["end_date"] else None,
                    "source": row["source"],
                    "sim_clock": str(self.sim_clock) if self.sim_clock else None,
                })

    async def get_state(self) -> dict:
        """Get current simulator state."""
        async with get_conn() as conn:
            state = await conn.fetchrow("SELECT * FROM simulator.state WHERE id = 1")
        return dict(state) if state else {}


# Singleton instance
runner = ScenarioRunner()
