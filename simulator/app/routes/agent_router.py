"""
Agent routes — exposes the agent's reasoning and analysis to the dashboard.
"""

from fastapi import APIRouter

from app.ai.agent import agent

agent_router = APIRouter()


@agent_router.get("/analysis")
async def get_agent_analysis():
    """Get the agent's latest reasoning cycle output."""
    if not agent.last_analysis:
        return {
            "status": "no_analysis_yet",
            "message": "Agent has not completed a reasoning cycle yet.",
        }
    return agent.last_analysis


@agent_router.get("/status")
async def get_agent_status():
    """Check if the agent is running."""
    return {
        "is_running": agent.is_running,
        "cycles_completed": agent._cycle_count,
        "last_trigger": agent._last_trigger if agent.last_analysis else None,
    }


@agent_router.post("/trigger")
async def trigger_agent():
    """Manually trigger an agent reasoning cycle (for demo purposes)."""
    await agent._run_reasoning_cycle("manual_trigger")
    return {
        "status": "triggered",
        "cycle": agent._cycle_count,
    }
