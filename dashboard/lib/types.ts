// TypeScript types — mirror the FastAPI Pydantic models

export type ProductType = "charger" | "cable" | "power_bank" | "earbuds" | "mouse";

export interface SKU {
  sku_id: string;
  name: string;
  product_type: ProductType;
  unit_cost: number;
  unit_price: number;
  shelf_life_days: number;
  supplier_id: string | null;
  supplier_lead_days: number;
  is_active: boolean;
}

export interface Warehouse {
  warehouse_id: string;
  name: string;
  city: string;
  latitude: number;
  longitude: number;
  capacity_units: number;
}

export interface TransferRoute {
  id: number;
  from_warehouse: string;
  to_warehouse: string;
  cost_per_unit: number;
  lead_time_days: number;
  route_name: string | null;
  active: boolean;
}

export interface StockLevel {
  sku_id: string;
  warehouse_id: string;
  available_qty: number;
  reserved_qty: number;
  safety_stock: number;
  inbound_qty: number;
  updated_at: string;
}

export interface StockAge {
  sku_id: string;
  warehouse_id: string;
  age_bucket: string;
  qty: number;
}

export interface InventoryOverview {
  warehouse_id: string;
  warehouse_name: string;
  total_available: number;
  total_reserved: number;
  total_safety: number;
  total_inbound: number;
  total_stock: number;
  sku_count: number;
  ageing_units: number;
}

export interface SalesTransaction {
  transaction_id: string;
  sku_id: string;
  warehouse_id: string;
  txn_date: string;
  quantity: number;
  unit_price: number;
  total_value: number;
  buyer_id: string | null;
  is_stockout: boolean;
}

export interface SalesSummary {
  sku_id: string;
  warehouse_id: string;
  total_qty: number;
  total_value: number;
  avg_daily_qty: number;
  transaction_count: number;
  has_stockout_periods: boolean;
}

export interface InboundOrder {
  po_id: string;
  sku_id: string;
  warehouse_id: string;
  quantity: number;
  supplier_id: string | null;
  order_date: string;
  expected_date: string;
  revised_date: string | null;
  status: string;
  received_date: string | null;
}

export interface TransferProposal {
  transfer_id?: string;
  sku_id: string;
  from_warehouse: string;
  to_warehouse: string;
  quantity: number;
  transfer_cost: number;
  lead_time_days: number;
  reason: string | null;
  expected_benefit: number | null;
  net_benefit: number | null;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Disruption {
  disruption_id?: string;
  disruption_type: "supply_shortage" | "shipping_delay";
  title: string;
  description: string | null;
  affected_skus: string[];
  affected_routes: string[] | null;
  start_date: string;
  end_date: string | null;
  severity: "low" | "medium" | "high";
  source: string;
  is_active: boolean;
}

export interface ForecastResult {
  sku_id: string;
  warehouse_id: string;
  forecast_qty_30d: number;
  confidence_low: number;
  confidence_high: number;
  confidence_level: "high" | "medium" | "low";
  method: string;
  assumptions: string[];
  data_quality_notes: string[];
}

export interface ImbalanceFlag {
  sku_id: string;
  warehouse_id: string;
  flag_type: "shortage" | "excess" | "ageing" | "misleading_sales";
  severity: "critical" | "warning" | "info";
  current_qty: number;
  forecast_qty: number;
  safety_stock: number;
  shortfall_or_excess: number;
  description: string;
  recommended_action: string | null;
  confidence_level?: string;
}

export interface Recommendation {
  recommendation_id: string;
  sku_id: string;
  sku_name?: string;
  from_warehouse: string;
  to_warehouse: string;
  quantity: number;
  transfer_cost: number;
  expected_benefit: number;
  net_benefit: number;
  lead_time_days: number;
  reason: string;
  constraints_checked: string[];
  is_feasible: boolean;
  rank: number;
  confidence_level: string;
  route_disrupted?: boolean;
}

export interface ImpactAssessment {
  metric: string;
  before: number;
  after: number;
  unit: string;
  delta: number;
  is_improvement: boolean;
}

export interface SimulatorStatus {
  status: "idle" | "running" | "paused";
  scenario: string | null;
  sim_clock: string | null;
  sim_start_date: string | null;
  speed: number;
  started_at: string | null;
  is_paused: boolean;
}

export interface WSEvent {
  type: string;
  data: Record<string, unknown>;
  sim_date?: string;
  timestamp?: string;
}

export interface AuditLogEntry {
  log_id: number;
  event_type: string;
  event_data: Record<string, unknown>;
  sim_timestamp: string;
  real_timestamp: string;
}

export interface ScenarioInfo {
  name: string;
  title: string;
  description: string;
  event_count: number;
  disruptions: number;
}

// --- Agent types ---

export interface AgentReasoningStep {
  step: string;
  description: string;
}

export interface AgentFinding {
  type: string;
  sku_id?: string;
  warehouse_id?: string;
  severity?: string;
  description?: string;
  shortfall?: number;
  title?: string;
  affected_skus?: string[];
  affected_routes?: string[];
}

export interface AgentRecommendation {
  action: string;
  sku_id: string;
  sku_name?: string;
  from: string;
  to: string;
  quantity: number;
  net_benefit: number;
  lead_time: number;
  confidence: string;
  rank: number;
  constraints_checked: string[];
  route_disrupted?: boolean;
  reason: string;
}

export interface AgentAction {
  action: string;
  sku_id?: string;
  from?: string;
  to?: string;
  quantity?: number;
  net_benefit?: number;
  confidence?: string;
  transfer_id?: string;
  reason?: string;
  error?: string;
}

export interface AgentAnalysis {
  cycle: number;
  trigger: string;
  timestamp: string;
  observation: {
    sim_date: string;
    scenario: string | null;
    sim_status: string;
    total_skus: number;
    total_stock_records: number;
    low_stock_count: number;
    active_disruptions_count: number;
  };
  reasoning: {
    steps: AgentReasoningStep[];
    critical_findings: AgentFinding[];
    feasible_count: number;
    rejected_count: number;
  };
  plan: {
    recommendations: AgentRecommendation[];
    rejected: any[];
    total_feasible: number;
    total_rejected: number;
  };
  explanation: string;
  actions_taken: AgentAction[];
}
