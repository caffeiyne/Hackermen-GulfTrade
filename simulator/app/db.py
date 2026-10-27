"""
Database connection layer — asyncpg pool + LISTEN/NOTIFY bridge.

Provides:
  - A shared connection pool for all async query operations.
  - A dedicated LISTEN connection that receives PostgreSQL NOTIFY events
    on the 'sim_events' channel and forwards them to WebSocket clients
    via an asyncio Queue.
"""

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import asyncpg

from app.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Connection pool (for queries)
# ---------------------------------------------------------------------------
_pool: asyncpg.Pool | None = None

# ---------------------------------------------------------------------------
# Event bus: bridges PG NOTIFY -> WebSocket clients
# ---------------------------------------------------------------------------
# A set of asyncio queues, one per connected WebSocket client.
# When a NOTIFY payload arrives, it's enqueued to every subscriber.
_subscribers: set[asyncio.Queue] = set()
_listen_conn: asyncpg.Connection | None = None


async def init_db_pool():
    """Initialize the asyncpg connection pool."""
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            settings.database_url,
            min_size=2,
            max_size=10,
            command_timeout=30,
        )
        logger.info("Database pool created")


async def close_db_pool():
    """Close the pool and listen connection."""
    global _pool, _listen_conn
    if _listen_conn:
        await _listen_conn.close()
        _listen_conn = None
    if _pool:
        await _pool.close()
        _pool = None
        logger.info("Database pool closed")


def get_pool() -> asyncpg.Pool:
    """Get the connection pool. Must be called after init_db_pool()."""
    if _pool is None:
        raise RuntimeError("Database pool not initialized. Call init_db_pool() first.")
    return _pool


@asynccontextmanager
async def get_conn() -> AsyncGenerator[asyncpg.Connection, None]:
    """Acquire a connection from the pool."""
    pool = get_pool()
    async with pool.acquire() as conn:
        yield conn


# ---------------------------------------------------------------------------
# LISTEN / NOTIFY bridge
# ---------------------------------------------------------------------------

def subscribe() -> asyncio.Queue:
    """Subscribe to real-time events. Returns a queue that will receive event dicts."""
    q: asyncio.Queue = asyncio.Queue(maxsize=100)
    _subscribers.add(q)
    return q


def unsubscribe(q: asyncio.Queue):
    """Unsubscribe from real-time events."""
    _subscribers.discard(q)


async def _on_notification(conn, pid, channel, payload):
    """Callback for PG NOTIFY — parse payload and broadcast to subscribers."""
    try:
        event = json.loads(payload)
    except (json.JSONDecodeError, TypeError):
        event = {"type": "unknown", "raw": payload}

    for q in list(_subscribers):
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            logger.warning("Subscriber queue full, dropping event")


async def start_listener():
    """Start listening to the 'sim_events' channel on a dedicated connection."""
    global _listen_conn
    if _listen_conn is not None:
        return

    pool = get_pool()
    _listen_conn = await pool.acquire()

    await _listen_conn.add_listener("sim_events", _on_notification)
    logger.info("Listening to PG NOTIFY channel 'sim_events'")


async def stop_listener():
    """Stop the listener."""
    global _listen_conn
    if _listen_conn:
        await _listen_conn.remove_listener("sim_events", _on_notification)
        pool = get_pool()
        await pool.release(_listen_conn)
        _listen_conn = None
        logger.info("Stopped listening to 'sim_events'")


async def notify_event(event_type: str, data: dict):
    """Manually emit a NOTIFY event (used by the simulator engine)."""
    payload = json.dumps({"type": event_type, **data, "timestamp": _now_iso()})
    async with get_conn() as conn:
        await conn.execute("SELECT pg_notify('sim_events', $1)", payload)


def _now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()
