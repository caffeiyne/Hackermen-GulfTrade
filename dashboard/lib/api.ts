// API client for the FastAPI backend

import {
  SKU,
  Warehouse,
  TransferRoute,
  StockLevel,
  StockAge,
  InventoryOverview,
  SalesTransaction,
  SalesSummary,
  InboundOrder,
  TransferProposal,
  Disruption,
  ForecastResult,
  ImbalanceFlag,
  Recommendation,
  ImpactAssessment,
  SimulatorStatus,
  AuditLogEntry,
  ScenarioInfo,
  AgentAnalysis,
} from "./types";

// Auto-detect the backend host at runtime.
// If NEXT_PUBLIC_API_URL is set AND differs from localhost, use it.
// Otherwise, use the same hostname as the frontend but on port 8000.
// This lets judges open http://192.168.x.x:3000 and the API/WebSocket
// automatically point to http://192.168.x.x:8000.
function getApiBase(): string {
  // Always derive from the browser's location so that when someone
  // opens the dashboard on another laptop via the host's LAN IP,
  // API calls go to that same host — not localhost.
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:8000`;
  }
  return "http://localhost:8000";
}

const API_BASE = getApiBase();

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

// --- Master data ---
export const api = {
  getSkus: (productType?: string) =>
    fetchAPI<SKU[]>(`/api/skus${productType ? `?product_type=${productType}` : ""}`),

  getWarehouses: () => fetchAPI<Warehouse[]>("/api/warehouses"),

  getTransferMatrix: () => fetchAPI<TransferRoute[]>("/api/transfer-matrix"),

  getHoldingCosts: (skuId?: string) =>
    fetchAPI<any[]>(`/api/holding-costs${skuId ? `?sku_id=${skuId}` : ""}`),

  // --- Inventory ---
  getStockLevels: (warehouseId?: string, skuId?: string) =>
    fetchAPI<StockLevel[]>(
      `/api/inventory${warehouseId ? `?warehouse_id=${warehouseId}` : ""}${skuId ? `${warehouseId ? "&" : "?"}sku_id=${skuId}` : ""}`
    ),

  getStockAge: (warehouseId?: string, skuId?: string) =>
    fetchAPI<StockAge[]>(
      `/api/inventory/age/all${warehouseId ? `?warehouse_id=${warehouseId}` : ""}${skuId ? `${warehouseId ? "&" : "?"}sku_id=${skuId}` : ""}`
    ),

  getInventoryOverview: () => fetchAPI<InventoryOverview[]>("/api/inventory/summary/overview"),

  // --- Sales ---
  getSalesHistory: (params?: {
    skuId?: string;
    warehouseId?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    includeStockouts?: boolean;
  }) => {
    const q = new URLSearchParams();
    if (params?.skuId) q.set("sku_id", params.skuId);
    if (params?.warehouseId) q.set("warehouse_id", params.warehouseId);
    if (params?.startDate) q.set("start_date", params.startDate);
    if (params?.endDate) q.set("end_date", params.endDate);
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.includeStockouts === false) q.set("include_stockouts", "false");
    const qs = q.toString();
    return fetchAPI<SalesTransaction[]>(`/api/sales/history${qs ? `?${qs}` : ""}`);
  },

  getSalesSummary: (skuId?: string, warehouseId?: string) => {
    const q = new URLSearchParams();
    if (skuId) q.set("sku_id", skuId);
    if (warehouseId) q.set("warehouse_id", warehouseId);
    const qs = q.toString();
    return fetchAPI<SalesSummary[]>(`/api/sales/summary${qs ? `?${qs}` : ""}`);
  },

  getDailySales: (skuId?: string, warehouseId?: string) => {
    const q = new URLSearchParams();
    if (skuId) q.set("sku_id", skuId);
    if (warehouseId) q.set("warehouse_id", warehouseId);
    const qs = q.toString();
    return fetchAPI<any[]>(`/api/sales/daily${qs ? `?${qs}` : ""}`);
  },

  getDataQuality: () => fetchAPI<any>("/api/sales/data-quality"),

  // --- Orders ---
  getInboundOrders: (status?: string) =>
    fetchAPI<InboundOrder[]>(`/api/orders/inbound${status ? `?status=${status}` : ""}`),

  getTransfers: (status?: string) =>
    fetchAPI<TransferProposal[]>(`/api/orders/transfers${status ? `?status=${status}` : ""}`),

  approveTransfer: (transferId: string, approvedBy: string = "Sara") =>
    fetchAPI(`/api/orders/transfers/${transferId}/approve`, {
      method: "POST",
      body: JSON.stringify({ approved_by: approvedBy }),
    }),

  rejectTransfer: (transferId: string, rejectionReason: string, approvedBy: string = "Sara") =>
    fetchAPI(`/api/orders/transfers/${transferId}/reject`, {
      method: "POST",
      body: JSON.stringify({ approved_by: approvedBy, rejection_reason: rejectionReason }),
    }),

  approveRecommendation: (recommendationId: string, approvedBy: string = "Sara") =>
    fetchAPI(`/api/orders/recommendations/${recommendationId}/approve`, {
      method: "POST",
      body: JSON.stringify({ approved_by: approvedBy }),
    }),

  rejectRecommendation: (recommendationId: string, rejectionReason: string, approvedBy: string = "Sara") =>
    fetchAPI(`/api/orders/recommendations/${recommendationId}/reject`, {
      method: "POST",
      body: JSON.stringify({ approved_by: approvedBy, rejection_reason: rejectionReason }),
    }),

  createManualTransfer: (data: {
    sku_id: string;
    from_warehouse: string;
    to_warehouse: string;
    quantity: number;
  }) =>
    fetchAPI(`/api/orders/transfers/manual`, {
      method: "POST",
      body: JSON.stringify({ ...data, approved_by: "Sara" }),
    }),

  cancelTransfer: (transferId: string) =>
    fetchAPI(`/api/orders/transfers/${transferId}/cancel`, {
      method: "POST",
    }),

  correctInventory: (data: {
    sku_id: string;
    warehouse_id: string;
    new_available_qty: number;
    reason: string;
  }) =>
    fetchAPI(`/api/orders/inventory/correct`, {
      method: "POST",
      body: JSON.stringify({ ...data, corrected_by: "Sara" }),
    }),

  // --- Disruptions ---
  getDisruptions: (activeOnly?: boolean) =>
    fetchAPI<Disruption[]>(`/api/disruptions${activeOnly ? "?active_only=true" : ""}`),

  // --- AI ---
  getRecommendations: () =>
    fetchAPI<{ recommendations: Recommendation[]; impact_assessment: ImpactAssessment[]; summary: any; baseline_comparison?: any }>(
      "/api/recommendations"
    ),

  getForecasts: () => fetchAPI<ForecastResult[]>("/api/recommendations/forecasts"),

  getBacktest: () => fetchAPI<any>("/api/recommendations/backtest"),

  getImbalances: () => fetchAPI<ImbalanceFlag[]>("/api/recommendations/imbalances"),

  getFullAnalysis: () => fetchAPI<any>("/api/recommendations/full-analysis"),

  // --- Simulator ---
  getSimulatorStatus: () => fetchAPI<SimulatorStatus>("/api/simulator/status"),

  startSimulator: (scenario: string, speed: number = 1) =>
    fetchAPI("/api/simulator/start", {
      method: "POST",
      body: JSON.stringify({ scenario, speed }),
    }),

  pauseSimulator: () => fetchAPI("/api/simulator/pause", { method: "POST" }),

  resumeSimulator: () => fetchAPI("/api/simulator/resume", { method: "POST" }),

  resetSimulator: () => fetchAPI("/api/simulator/reset", { method: "POST" }),

  injectDisruption: (data: {
    disruption_type: string;
    title: string;
    affected_skus: string[];
    severity: string;
    duration_days: number;
  }) => fetchAPI("/api/simulator/inject", { method: "POST", body: JSON.stringify(data) }),

  getTimeline: (limit: number = 100) =>
    fetchAPI<AuditLogEntry[]>(`/api/simulator/timeline?limit=${limit}`),

  getScenarios: () => fetchAPI<ScenarioInfo[]>("/api/simulator/scenarios"),

  // --- Agent ---
  getAgentAnalysis: () => fetchAPI<AgentAnalysis>("/api/agent/analysis"),

  getAgentStatus: () => fetchAPI<{ is_running: boolean; cycles_completed: number; last_trigger: string | null }>("/api/agent/status"),

  triggerAgent: () => fetchAPI<{ status: string; cycle: number }>("/api/agent/trigger", { method: "POST" }),
};
