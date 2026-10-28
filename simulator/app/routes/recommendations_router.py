"""
Recommendations routes — AI-generated transfer proposals + impact assessment.
"""

from fastapi import APIRouter

from app.ai.recommender import generate_recommendations
from app.ai.forecaster import forecast_all
from app.ai.imbalance_detector import detect_imbalances
from app.ai.backtest import run_backtest
from app.ai.planning import load_context
from app.db import get_conn

recommendations_router = APIRouter()


@recommendations_router.get("")
async def get_recommendations():
    """
    Get ranked transfer recommendations with cost/benefit analysis
    and before/after impact assessment.
    """
    return await generate_recommendations()


@recommendations_router.get("/forecasts")
async def get_forecasts():
    """Get 30-day demand forecasts for all SKU/warehouse combinations."""
    return await forecast_all()


@recommendations_router.get("/imbalances")
async def get_imbalances():
    """Get flagged imbalances: shortages, excess, ageing, misleading sales."""
    return await detect_imbalances()


@recommendations_router.get("/full-analysis")
async def get_full_analysis():
    """
    Complete decision-support package from ONE consistent snapshot:
    forecasts + imbalances + recommendations + impact assessment.
    """
    async with get_conn() as conn:
        ctx = await load_context(conn)
    forecasts = await forecast_all(ctx=ctx)
    imbalances = await detect_imbalances(ctx=ctx, forecasts=forecasts)
    recommendations = await generate_recommendations(ctx=ctx, forecasts=forecasts)

    return {
        "as_of": str(ctx["sim_date"]),
        "forecasts": forecasts,
        "imbalances": imbalances,
        "recommendations": recommendations["recommendations"],
        "replenishment_actions": recommendations["replenishment_actions"],
        "impact_assessment": recommendations["impact_assessment"],
        "baseline_comparison": recommendations["baseline_comparison"],
        "summary": recommendations["summary"],
    }


@recommendations_router.get("/backtest")
async def get_backtest():
    """
    Forecast accuracy vs the case-study baseline (recent 30-day average) on a
    30-day holdout: WAPE, bias, P10–P90 coverage, and stockout-distorted series.
    """
    return await run_backtest()
