# Supporting Note — GulfTrade Intelligence

> Submitted as part of the Tradeling Hackathon deliverables per Section 6 of the case study: "A short supporting note covering the business problem, datasets, method, test results, limitations and requirements for a real-world pilot."

---

## 1. Business Problem

**Sara**, the inventory planner at GulfTrade Supplies (a fictional UAE-based B2B seller of mobile accessories), manages ~5,000 units across three warehouses in Dubai (DXB), Abu Dhabi (AUH), and Sharjah (SHJ). She uses spreadsheets to track 20 SKUs across 5 product types (chargers, cables, power banks, earbuds, mice).

The core problems:

- **Stock imbalance** — excess stock accumulates in one location while another runs short
- **Misleading sales history** — stockouts suppress observed demand, making forecasts unreliable
- **Ageing inventory** — old stock ties up working capital and risks obsolescence
- **Disruption blindness** — supply shortages and shipping delays aren't factored into planning decisions
- **No quantified trade-offs** — Sara can't compare the cost of transferring stock vs. the cost of doing nothing

Our AI agent solves these by autonomously observing inventory state, forecasting demand with data-quality corrections, detecting imbalances, and recommending cost-effective transfers — all subject to human approval.

---

## 2. Datasets

All data is **synthetic and fictional**, generated specifically for this hackathon.

| Dataset | Description |
|---|---|
| **SKU Master** | 20 SKUs across 5 product types with unit cost, unit price, shelf life, supplier lead times |
| **Warehouses** | 3 UAE locations (DXB, AUH, SHJ) with coordinates and capacity |
| **Sales History** | 90 days of daily transactions per SKU/warehouse, with embedded stockout periods and missing data gaps |
| **Inventory** | Available, reserved, safety stock, and inbound quantities per SKU/warehouse |
| **Stock Age** | Age distribution in buckets (0-30, 31-60, 61-90, 90+ days) |
| **Transfer Matrix** | 6 inter-warehouse routes with cost/unit (AED) and lead time (days). Includes one deliberately unattractive route (AUH→SHJ at 3.20 AED/unit, 2 days) |
| **Holding Costs** | Daily holding cost per SKU/warehouse (~0.5% of unit cost) |
| **Inbound Orders** | Purchase orders with expected/revised delivery dates |
| **Disruption Signals** | 2 labelled scenarios: semiconductor supply shortage (affects specific GaN charger SKUs) + DXB-SHJ shipping delay (affects specific route only) |

---

## 3. Method

### 3.1 Demand Forecasting

- **Algorithm**: Weighted Moving Average (WMA) over 90 days, split into 5 buckets with weights [0.35, 0.25, 0.20, 0.12, 0.08] (recent → old)
- **Trend adjustment**: Linear trend from first-half vs. second-half mean, dampened by 50%
- **Stockout correction**: During stockout days, observed sales are suppressed. We replace stockout-day values with the non-stockout daily average for the same SKU, un-suppressing true demand
- **Missing data correction**: If >15% of non-stockout days are zero, we partially fill with 50% of the positive-day average (labelled as uncertain)
- **Confidence bands**: P10/P90 calculated from historical standard deviation, scaled by √30 for the 30-day horizon
- **Confidence levels**: High / Medium / Low — reduced when stockout corrections are applied, missing data is detected, historical variance is high, or active disruptions affect the SKU
- **Disruption integration**: Active supply disruptions reduce confidence and add data quality notes

### 3.2 Imbalance Detection

Four flag types per SKU/warehouse:

| Flag | Trigger |
|---|---|
| **Shortage** | Projected stock (available - reserved + inbound - forecast) < safety stock |
| **Excess** | Available stock > forecast + safety + 50% buffer |
| **Ageing** | >25% of age-tracked stock is 61+ days old, or >50 units aged 61+ at >15% ratio |
| **Misleading Sales** | Stockout periods detected in sales history — forecast corrected but confidence reduced |

### 3.3 Recommendation Engine

For each shortage, the recommender searches for excess stock of the **same SKU** at other warehouses and evaluates:

1. **Route exists** — transfer matrix lookup
2. **Route not disrupted** — active disruption check (adds delay days if route is affected)
3. **Source has spare stock** — available - reserved - safety - forecast > 0
4. **Transfer quantity** — min(shortfall, excess, source_spare)
5. **Cost-benefit**:
   - Transfer cost = qty × cost_per_unit
   - Expected benefit = (lost sale cost avoided) + (holding cost saved at source) - (holding cost increase at destination)
   - Net benefit = expected benefit - transfer cost
6. **Feasibility** — net benefit > 0 AND lead time ≤ 30 days

Recommendations ranked by net benefit (descending). Unattractive transfers (net benefit < 0) are shown but marked "Not Recommended."

### 3.4 Baseline Comparison

The case study requires comparison against a simple baseline. We compute:

| Metric | Baseline (Do Nothing) | AI Solution |
|---|---|---|
| Shortage exposure | All projected shortfalls × lost margin | Reduced by feasible transfers |
| Transfer cost | 0 AED | Sum of transfer costs |
| Net position | -(shortage exposure) | Net benefit (benefit - transfer cost) |
| Service level | Units at risk / total demand | Improved by transfers |

### 3.5 Agent Architecture

The agent is **not a pipeline** — it's an autonomous reasoning loop:

1. **Observe** — reads inventory state, sales, disruptions from the database
2. **Reason** — runs forecaster → imbalance detector → recommender as tools, building a reasoning chain
3. **Plan** — evaluates transfer options, checks constraints, ranks by net benefit
4. **Explain** — generates plain-English reasoning pushed to the dashboard via WebSocket
5. **Act** — auto-creates transfer proposals (still require Sara's approval)

The agent re-evaluates within 1 second when a black swan event is injected.

---

## 4. Test Results

### Scenario A — Normal Planning Journey

- USB-C charger imbalance detected: Dubai excess, Abu Dhabi shortage
- Transfer recommended: DXB → AUH (cost 1.50/unit, 1 day lead time)
- Net benefit positive — feasible and economical

### Scenario B — Difficult Case

Two disruptions fire during the 30-day window:

1. **Day 9**: Semiconductor supply constraint (CHG-UC-002, CHG-UC-003 only — NOT all chargers)
2. **Day 14**: DXB-SHJ shipping route delay

Agent behaviour verified:
- Does NOT assume all products are affected by the semiconductor shortage (only GaN-based chargers CHG-UC-002/003)
- Rejects DXB→SHJ transfer when route is disrupted (adds delay, may arrive too late)
- AUH→SHJ transfer marked "Not Recommended" (cost 3.20/unit exceeds benefit — the deliberately unattractive transfer)
- Reassesses recommendations after each disruption fires

### Baseline Comparison (illustrative)

| | Baseline | AI Solution | Improvement |
|---|---|---|---|
| Shortage exposure | ~X AED | ~Y AED | ↓ Z% |
| Net position | -(X) AED | +W AED | +W+X AED |
| Service level | ~85% | ~95% | +10% |

*(Exact values depend on sim state at time of demo — visible on the Actions page)*

---

## 5. Limitations

1. **Forecasting method** — WMA with trend adjustment is more sophisticated than simple average but is not a full time-series model (ARIMA, Prophet, or LSTM would improve accuracy). Chosen for interpretability and hackathon time constraints.

2. **Single-echelon** — We model only the seller's 3 warehouses. Real multi-echelon optimization (MEIO) would consider the full supply chain from supplier → DC → warehouse → customer.

3. **Deterministic transfer execution** — Approved transfers execute immediately. In reality, transfers have their own lead times, can fail, and may need rescheduling.

4. **No automated reorder** — The agent recommends transfers between warehouses but does not auto-generate purchase orders to suppliers. This is a planned extension.

5. **Synthetic data** — Sales patterns are generated programmatically. Real sales data would include more complex seasonality, promotions, and buyer-specific patterns.

6. **No multi-objective optimization** — Recommendations are ranked by net economic benefit only. A production system might also weight service level, risk tolerance, and strategic priorities.

---

## 6. Requirements for a Real-World Pilot

| Requirement | Current State | Pilot Needs |
|---|---|---|
| **Data integration** | Mock data in PostgreSQL | ERP/WMS API integration (SAP, Oracle, Shopify) |
| **Forecast model** | WMA with stockout correction | Upgrade to Prophet or LSTM, add seasonality + promotions |
| **Transfer execution** | Immediate DB update | Integration with 3PL logistics APIs (Aramex, DHL) for actual shipment booking |
| **Multi-warehouse** | 3 fixed locations | Support N warehouses with dynamic transfer graph |
| **Approval workflow** | Single approver (Sara) | Multi-tier approval (planner → manager → finance) with SLA timers |
| **Disruption sources** | Manual injection + seeded scenarios | Real-time RSS/API feeds (port authority, customs, supplier portals) |
| **Alerting** | Dashboard + WebSocket toast | Email + SMS + Slack integration for critical shortages |
| **Audit trail** | Database audit log | Immutable log with regulatory compliance (GS1, UAE trade regulations) |
| **Security** | No auth (hackathon) | Role-based access control, API key management, audit logging |
| **Scale** | 20 SKUs, 3 warehouses | 10,000+ SKUs, 50+ locations — requires batch processing + caching |

### Estimated pilot timeline: 8-12 weeks

1. **Weeks 1-2**: Data pipeline from live ERP/WMS
2. **Weeks 3-4**: Forecast model upgrade + validation against historical data
3. **Weeks 5-6**: Transfer execution integration with 3PL
4. **Weeks 7-8**: Approval workflow + alerting
5. **Weeks 9-10**: UAT with real planners (shadow mode — recommend but don't execute)
6. **Weeks 11-12**: Production deployment + monitoring

---

## 7. Trust Boundaries (Case Study Compliance)

| Rule | How We Comply |
|---|---|
| Must not invent demand signals | Forecasts use only historical sales + supplied disruptions |
| Must not assert market event affects unrelated SKUs | Disruptions have explicit `affected_skus` arrays — only listed SKUs impacted |
| Must not treat uncertain demand as guaranteed | Confidence levels (high/medium/low) + P10/P90 bands on every forecast |
| Must not execute stock movements without human approval | All transfers require Sara's approval via API — agent only proposes |
| Unsupported conclusions labelled as assumptions | Every forecast includes `assumptions` and `data_quality_notes` arrays |

---

*GulfTrade Intelligence — Tradeling Hackathon submission*
