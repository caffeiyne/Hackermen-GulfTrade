"""
Recommendations routes — AI-generated transfer proposals + impact assessment.
"""

from fastapi import APIRouter

from app.ai.recommender import generate_recommendations
from app.ai.forecaster import forecast_all
from app.ai.imbalance_detector import detect_imbalances

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
    Complete decision-support package:
    forecasts + imbalances + recommendations + impact assessment.
    """
    forecasts = await forecast_all()
    imbalances = await detect_imbalances()
    recommendations = await generate_recommendations()

    return {
        "forecasts": forecasts,
        "imbalances": imbalances,
        "recommendations": recommendations["recommendations"],
        "impact_assessment": recommendations["impact_assessment"],
        "summary": recommendations["summary"],
    }
