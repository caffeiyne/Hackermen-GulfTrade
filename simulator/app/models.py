"""
Pydantic models — mirror the PostgreSQL domain entities.

These define the API contract between FastAPI and the Next.js dashboard.
"""

from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Master entities
# ---------------------------------------------------------------------------

class ProductType(str, Enum):
    charger = "charger"
    cable = "cable"
    power_bank = "power_bank"
    earbuds = "earbuds"
    mouse = "mouse"


class SKU(BaseModel):
    sku_id: str
    name: str
    product_type: ProductType
    unit_cost: Decimal
    unit_price: Decimal
    shelf_life_days: int
    supplier_id: Optional[str] = None
    supplier_lead_days: int = 14
    is_active: bool = True


class Warehouse(BaseModel):
    warehouse_id: str
    name: str
    city: str
    latitude: Decimal
    longitude: Decimal
    capacity_units: int


class TransferRoute(BaseModel):
    id: int
    from_warehouse: str
    to_warehouse: str
    cost_per_unit: Decimal
    lead_time_days: int
    route_name: Optional[str]
    active: bool


# ---------------------------------------------------------------------------
# Inventory
# ---------------------------------------------------------------------------

class StockLevel(BaseModel):
    sku_id: str
    warehouse_id: str
    available_qty: int
    reserved_qty: int
    safety_stock: int
    inbound_qty: int
    updated_at: datetime


class StockAge(BaseModel):
    sku_id: str
    warehouse_id: str
    age_bucket: str          # '0-30' | '31-60' | '61-90' | '90+'
    qty: int


# ---------------------------------------------------------------------------
# Sales
# ---------------------------------------------------------------------------

class SalesTransaction(BaseModel):
    transaction_id: UUID
    sku_id: str
    warehouse_id: str
    txn_date: date
    quantity: int
    unit_price: Decimal
    total_value: Decimal
    buyer_id: Optional[str]
    is_stockout: bool


class SalesSummary(BaseModel):
    sku_id: str
    warehouse_id: str
    total_qty: int
    total_value: Decimal
    avg_daily_qty: float
    transaction_count: int
    has_stockout_periods: bool


# ---------------------------------------------------------------------------
# Orders
# ---------------------------------------------------------------------------

class InboundOrder(BaseModel):
    po_id: str
    sku_id: str
    warehouse_id: str
    quantity: int
    supplier_id: Optional[str]
    order_date: date
    expected_date: date
    revised_date: Optional[date]
    status: str               # pending | in_transit | received | delayed
    received_date: Optional[date]


class TransferProposal(BaseModel):
    transfer_id: Optional[UUID]
    sku_id: str
    from_warehouse: str
    to_warehouse: str
    quantity: int
    transfer_cost: Decimal
    lead_time_days: int
    reason: Optional[str]
    expected_benefit: Optional[Decimal]
    net_benefit: Optional[Decimal]
    status: str = "proposed"
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None


class TransferDecision(BaseModel):
    """Body for approve/reject endpoint."""
    approved_by: str = Field(default="Sara", description="Who approved/rejected")
    rejection_reason: Optional[str] = None


class ManualTransferRequest(BaseModel):
    """Body for creating and executing a manual stock transfer in one step."""
    sku_id: str
    from_warehouse: str
    to_warehouse: str
    quantity: int = Field(gt=0, description="Number of units to transfer")
    approved_by: str = Field(default="Sara", description="Who authorized the transfer")


class InventoryCorrectionRequest(BaseModel):
    """Body for correcting an inventory stock record — Sara fixes a discrepancy."""
    sku_id: str
    warehouse_id: str
    new_available_qty: int = Field(ge=0, description="Corrected available quantity")
    reason: str = Field(description="Why the correction is being made (e.g. cycle count, damaged goods)")
    corrected_by: str = Field(default="Sara", description="Who made the correction")


# ---------------------------------------------------------------------------
# Disruptions
# ---------------------------------------------------------------------------

class DisruptionType(str, Enum):
    supply_shortage = "supply_shortage"   # inbound POs for listed SKUs slip
    shipping_delay = "shipping_delay"     # listed routes slow/blocked; listed SKUs' inbound held
    demand_surge = "demand_surge"         # supplied demand signal for listed SKUs


class Severity(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"                 # for routes: blocked


class Disruption(BaseModel):
    disruption_id: Optional[UUID]
    disruption_type: DisruptionType
    title: str
    description: Optional[str]
    affected_skus: list[str]
    affected_routes: Optional[list[str]] = None
    start_date: date
    end_date: Optional[date]
    severity: Severity = Severity.medium
    source: str = "market_signal"
    is_active: bool = True


class DisruptionUpdate(BaseModel):
    """Planner changes a disruption ASSUMPTION — the whole plan is recomputed."""
    is_active: Optional[bool] = None
    severity: Optional[Severity] = None
    end_date: Optional[date] = None
    affected_skus: Optional[list[str]] = None
    affected_routes: Optional[list[str]] = None
    changed_by: str = "Sara"
    note: Optional[str] = None


class StockCorrection(BaseModel):
    """Planner corrects a stock record (e.g. a late or wrong spreadsheet row)."""
    available_qty: Optional[int] = Field(default=None, ge=0)
    reserved_qty: Optional[int] = Field(default=None, ge=0)
    safety_stock: Optional[int] = Field(default=None, ge=0)
    inbound_qty: Optional[int] = Field(default=None, ge=0)
    corrected_by: str = "Sara"
    note: Optional[str] = None


# ---------------------------------------------------------------------------
# Forecast + AI outputs
# ---------------------------------------------------------------------------

class ForecastResult(BaseModel):
    sku_id: str
    warehouse_id: str
    forecast_qty_30d: int
    confidence_low: int            # P10 estimate
    confidence_high: int           # P90 estimate
    confidence_level: str          # 'high' | 'medium' | 'low'
    method: str                    # e.g. 'weighted_moving_avg'
    assumptions: list[str]
    data_quality_notes: list[str] = []


class ImbalanceFlag(BaseModel):
    sku_id: str
    warehouse_id: str
    flag_type: str                 # shortage | excess | ageing | misleading_sales
    severity: str                  # critical | warning | info
    current_qty: int
    forecast_qty: int
    safety_stock: int
    shortfall_or_excess: int
    description: str
    recommended_action: Optional[str] = None


class Recommendation(BaseModel):
    recommendation_id: str        # generated
    sku_id: str
    from_warehouse: str
    to_warehouse: str
    quantity: int
    transfer_cost: Decimal
    expected_benefit: Decimal
    net_benefit: Decimal
    lead_time_days: int
    reason: str
    constraints_checked: list[str]
    is_feasible: bool
    rank: int                      # 1 = best
    confidence_level: str


class ImpactAssessment(BaseModel):
    """Before/after comparison for a set of recommendations."""
    metric: str
    before: Decimal
    after: Decimal
    unit: str
    delta: Decimal
    is_improvement: bool


# ---------------------------------------------------------------------------
# Simulator control
# ---------------------------------------------------------------------------

class SimulatorStatus(str, Enum):
    idle = "idle"
    running = "running"
    paused = "paused"


class SimulatorState(BaseModel):
    status: SimulatorStatus
    scenario_name: Optional[str]
    sim_clock: Optional[date]
    sim_start_date: Optional[date]
    speed_multiplier: int
    started_at: Optional[datetime]


class StartSimulatorRequest(BaseModel):
    scenario: str = "A"           # "A" (normal) or "B" (difficult)
    speed: int = 1                 # speed multiplier


class InjectDisruptionRequest(BaseModel):
    """Manually inject a disruption mid-simulation."""
    disruption_type: DisruptionType
    title: str
    description: Optional[str] = None
    affected_skus: list[str]
    affected_routes: Optional[list[str]] = None
    severity: Severity = Severity.medium
    duration_days: int = 14


# ---------------------------------------------------------------------------
# Real-time WebSocket events
# ---------------------------------------------------------------------------

class WSEvent(BaseModel):
    """Envelope for WebSocket push events."""
    type: str                      # sale_recorded | inventory_changed | disruption_published | etc.
    data: dict
    sim_date: Optional[date] = None
    timestamp: Optional[datetime] = None
