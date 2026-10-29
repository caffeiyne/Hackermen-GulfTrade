"""
Application entry point — FastAPI app with lifespan, CORS, routes, WebSocket.

Run:  uvicorn app.main:app --reload --port 8000
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from app.config import settings
from app.db import init_db_pool, close_db_pool, start_listener, stop_listener, subscribe, unsubscribe
from app.ai.agent import agent
from app.routes import (
    inventory_router,
    sales_router,
    orders_router,
    disruptions_router,
    recommendations_router,
    simulator_router,
    agent_router,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: init DB pool + start LISTEN + start agent. Shutdown: cleanup."""
    logger.info("Starting up Tradeling Simulator API...")
    await init_db_pool()
    await start_listener()
    # Start the autonomous agent (observes every 30s + reacts to events)
    await agent.start(interval_seconds=30)
    logger.info("Simulator API ready — agent is watching")
    yield
    logger.info("Shutting down...")
    await agent.stop()
    await stop_listener()
    await close_db_pool()


app = FastAPI(
    title=settings.api_title,
    version=settings.api_version,
    lifespan=lifespan,
)

# CORS — allow all origins for demo (LAN access from any IP)
from fastapi.middleware.cors import CORSMiddleware

# When credentials=True, we can't use "*" — so we reflect the Origin header
_allowed_origins = settings.cors_origins
_allow_all = "*" in _allowed_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins if not _allow_all else ["*"],
    allow_credentials=False if _allow_all else True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(inventory_router, prefix="/api/inventory", tags=["inventory"])
app.include_router(sales_router, prefix="/api/sales", tags=["sales"])
app.include_router(orders_router, prefix="/api/orders", tags=["orders"])
app.include_router(disruptions_router, prefix="/api/disruptions", tags=["disruptions"])
app.include_router(recommendations_router, prefix="/api/recommendations", tags=["recommendations"])
app.include_router(simulator_router, prefix="/api/simulator", tags=["simulator"])
app.include_router(agent_router, prefix="/api/agent", tags=["agent"])

# Also expose SKUs + warehouses under /api
from app.routes.master_router import master_router
app.include_router(master_router, prefix="/api", tags=["master"])


# ---------------------------------------------------------------------------
# Root + health
# ---------------------------------------------------------------------------
@app.get("/")
async def root():
    return {
        "name": settings.api_title,
        "version": settings.api_version,
        "docs": "/docs",
        "websocket": "/ws/live",
    }


@app.get("/health")
async def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# WebSocket — real-time event stream
# ---------------------------------------------------------------------------
@app.websocket("/ws/live")
async def websocket_live(ws: WebSocket):
    """
    Real-time event stream.

    Clients connect and receive a JSON event envelope for every:
      - sale_recorded
      - inventory_changed
      - disruption_published
      - recommendation_updated
      - transfer_approved / transfer_rejected
      - sim_clock_tick
    """
    await ws.accept()
    queue = subscribe()
    logger.info(f"WebSocket client connected ({ws.client})")

    # Send a hello so the client knows the connection is live
    await ws.send_json({"type": "connected", "data": {"message": "Real-time stream active"}})

    try:
        while True:
            event = await queue.get()
            await ws.send_json(event)
    except WebSocketDisconnect:
        logger.info(f"WebSocket client disconnected ({ws.client})")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        unsubscribe(queue)
