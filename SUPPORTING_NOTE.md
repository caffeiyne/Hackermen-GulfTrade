# Supporting Note — GulfTrade Intelligence

> Tradeling Hackathon deliverable (case study §6): business problem, datasets, method, test results, limitations and requirements for a real-world pilot. Every number below is reproducible from the repo: run the setup, then `GET /api/recommendations/full-analysis` and `GET /api/recommendations/backtest` at the scenario start date (2024-10-27).

---

## 1. Business problem

**Sara**, inventory planner at GulfTrade Supplies (fictional UAE B2B seller of mobile accessories), manages ~5,000 units of 20 SKUs (5 product types) across Dubai (DXB), Abu Dhabi (AUH) and Sharjah (SHJ), using spreadsheets.

- **Stock in the wrong place** — Dubai holds surplus chargers while Abu Dhabi runs short
- **Misleading history** — stockouts suppress recorded sales, so a plain average under-forecasts
- **Ageing and surplus** — old stock ties up cash and holding cost
- **Disruptions** — supply and route problems hit *specific* SKUs and routes, not everything
- **No quantified trade-offs** — no way to compare "move stock" against "do nothing" in AED

GulfTrade Intelligence forecasts demand with honest uncertainty, flags imbalances, and recommends only transfers that pay off after cost — every action waits for Sara's approval.

---

## 2. Datasets (all synthetic)

| Dataset | Description |
|---|---|
| SKU master | 20 SKUs, 5 product types, unit cost/price, shelf life, supplier lead time |
| Warehouses | DXB, AUH, SHJ |
| Sales history | 90 days daily, with **stockout periods** (e.g. CHG-UC-001 @ AUH, 18 days) and **unrecorded days** |
| Inventory | Available, reserved, safety stock, inbound per SKU/location, with `updated_at` timestamps |
| Stock age | Buckets 0-30 / 31-60 / 61-90 / 90+ |
| Transfer matrix | 6 routes. DXB↔AUH 1.50 AED/unit 1d, DXB↔SHJ 0.80 1d, **AUH↔SHJ 3.20 2d (deliberately unattractive)** |
| Holding costs | Daily per SKU/location |
| Inbound POs | Expected / revised dates, status (received on arrival in the sim) |
| Disruption signals | Two labelled, dated scenarios: GaN semiconductor shortage (CHG-UC-002/003 only) and DXB–SHJ route delay (that corridor only) |

---

## 3. Method

### 3.1 One planning snapshot
`app/ai/planning.py` builds a single view — stock, disruption-adjusted inbound ETAs, route status, supplied demand signals — that the forecaster, detector and recommender all share. A corrected record or changed assumption therefore flows through forecast → imbalances → recommendations → impact in one pass. Disruption effects are narrow and labelled: a disruption only touches the SKUs/routes it lists.

### 3.2 Forecast (chosen by backtest)
- Exponentially weighted mean of daily sales, half-life 30 days, 90-day window
- **Stockout days are censored** (excluded), not treated as zero demand; the size of the distortion is reported ("raw recent average would understate demand by X%")
- Unrecorded days counted and surfaced as a data-quality note
- Calibrated **P10–P90** band (daily noise + level uncertainty + 5% model error)
- Confidence from band width and data quality; supply disruptions lower confidence only for listed SKUs
- Supplied demand signals (`demand_surge`) scale only listed SKUs for the overlapping days, labelled as an assumption

### 3.3 Imbalances
| Flag | Rule |
|---|---|
| Shortage | usable stock (available − reserved + inbound landing in horizon) − P50 forecast < safety stock |
| Excess | usable stock > **P90** forecast + safety (cautious: only stock beyond a high-demand month) |
| Ageing | > 25% of age-tracked stock 61+ days old (or > 50 units at > 15%) |
| Misleading sales | stockout days in history — corrected forecast shown next to the raw average |

### 3.4 Recommendations (expected value, not point forecasts)
Lost sales at a location = margin × E[max(demand − stock, 0)] with demand ~ forecast distribution. Per SKU, units are allocated in batches along the source→destination pair with the highest marginal net benefit:

> lost sales avoided at destination (only demand **after arrival** counts) − lost sales created at source + change in surplus holding cost − transfer cost

Hard constraints: only on-hand stock moves; the source keeps at least its own P50 forecast + safety stock; blocked routes are excluded; disrupted routes carry extra lead time. Each gap is filled once, by the cheapest adequate source. Options evaluated but not chosen are shown as **Not Recommended** with the reason. Moves under 25 AED net are not recommended. Each recommendation also shows its net benefit **if demand lands at P10**. Where transfers can't close a gap, a **replenishment** advisory is raised (purchasing stays with Sara).

### 3.5 Baseline comparison
Baseline = recent average demand view with **no proactive transfers**. Baseline and plan are scored with the same model (expected lost margin + 30-day holding on surplus + transfer cost), so before/after numbers are in the same units.

### 3.6 Agent loop
Event-driven: runs on a timer and immediately on disruption, approval, record correction or assumption change. It loads one snapshot, runs forecast → detect → recommend, explains in plain English (including what it decided *not* to do), and creates proposals for the top 3. Nothing executes without Sara's approval; approval re-derives the current recommendation and refuses if it is stale or not recommended.

---

## 4. Test results (scenario start, 2024-10-27)

### 4.1 Forecast accuracy — 30-day holdout (`GET /api/recommendations/backtest`)
Trained 2024-07-29 → 09-26, scored 09-27 → 10-26, 60 SKU × location series.

| | Agent forecast | Baseline (recent 30-day average) |
|---|---|---|
| Error (WAPE), all series | **9.0%** | 12.5% |
| Bias | −1.1% | −2.3% |
| Error, stockout-hit series (2) | **1.6%** | 43.9% (under-forecast) |
| P10–P90 coverage | **83%** (target 80%) | — |

### 4.2 Normal journey — Scenario A
USB-C charger CHG-UC-001: AUH forecast **292** (P10–P90 241–343) after correcting 18 stockout days; the raw average would say 268. With the 200-unit inbound PO counted, AUH is short of its safety buffer, so the agent recommends **DXB→AUH 62 units** (93 AED, net +393 AED; +98 AED even at P10). It does **not** recommend 300 units: the inbound PO already covers most of the gap.

The deliberately expensive route is rejected: **SHJ→AUH — "gap already covered by a cheaper/faster source; 198 AED for ~131 AED benefit."**

### 4.3 Baseline vs plan (whole portfolio, if Sara approves all 12 recommendations)

| Metric | Baseline (do nothing) | Agent plan |
|---|---|---|
| Expected lost sales (margin) | 9,321 AED | **5,425 AED** (−42%) |
| Expected units short | 556 | **308** |
| Holding cost on surplus, 30d | 3,324 AED | 1,987 AED |
| Transfer cost | 0 | 901 AED |
| Total expected cost | 12,644 AED | **8,313 AED** |
| Expected fill rate | 89.1% | **93.9%** |

Net expected benefit **+4,331 AED / 30 days** for 901 AED of transport. 12 options are listed as Not Recommended with reasons.

### 4.4 Difficult cases — Scenario B and black swans
- **Day 9, GaN shortage:** confidence drops to *low* for CHG-UC-002/003 **only**; their inbound POs are assumed +14 days late (labelled). CHG-UC-001/004 and all other SKUs are unchanged.
- **Day 14, DXB–SHJ delay:** only DXB↔SHJ transfers get +3 days and a "Route Disrupted" badge; they remain only where still worth it. DXB↔AUH and AUH↔SHJ are untouched.
- **Road Closure (critical, DXB↔AUH):** all DXB→AUH options become *Not Recommended — route blocked*; the agent re-routes CHG-UC-002 via SHJ (47 units at 3.20 AED/unit, still positive) and drops moves that no longer pay.
- **Change an assumption once** (Planner controls → "Mark as not happening") or **correct a record** (e.g. CHG-UC-001 AUH available → 20): forecast, flags, recommendations and impact recompute; before/after values go to the audit log.

---

## 5. Limitations

1. **Forecast model** — a transparent weighted average with censoring; no promotions, Ramadan/Eid or B2B order-lumpiness yet. Beats the baseline on synthetic data; must be re-validated on real data.
2. **Normal demand assumption** — fine for these volumes; low-volume SKUs would need a Poisson / negative-binomial model.
3. **Execution** — approved transfers move stock immediately in the prototype; real transfers have lead times and can fail.
4. **Replenishment** — advisory only (suggested quantity + supplier lead time); no PO creation.
5. **Disruption effects** — delay days by severity are fixed assumptions (shown on screen); a pilot would source them from supplier/3PL feeds.
6. **Single echelon, greedy allocation per SKU** — fine for 3 locations; a network optimiser is needed at scale.
7. **No authentication** — `approved_by` is supplied by the client. RBAC is a pilot requirement.
8. **Synthetic data** throughout.

---

## 6. Requirements for a real-world pilot

| Area | Prototype | Pilot needs |
|---|---|---|
| Data | Seeded Postgres | Seller ERP/WMS/marketplace feeds; data contracts; freshness SLAs (timestamps already tracked) |
| Forecast | EWMA + censoring, backtested | Re-run backtest on 12+ months of real data; add seasonality (Ramadan, Eid, White Friday, back-to-school) and promotions; champion/challenger |
| Optimisation | Greedy per SKU | Min-cost-flow / MILP across N locations, vehicle capacity, minimum lot sizes |
| Execution | Immediate DB move | 3PL booking APIs, in-transit tracking, partial receipt |
| Approval | Single approver | Seller-scoped RBAC, thresholds (auto-approve < X AED), multi-tier for large moves, full audit |
| Multi-tenant | One seller | Tenant isolation per seller; Tradeling never sees another seller's data unaggregated |
| Disruptions | Seeded + manual | Dated feeds (port authority, carriers, supplier notices) with source attribution; human confirmation before use |
| Cost and scale | One Postgres + one API container; one planning pass reads each table once | Nightly batch forecasts + event-driven re-plans for touched SKUs only; compute and cost to be sized during the pilot |

**Pilot plan (8–12 weeks):** 1–2 data integration with one seller · 3–4 backtest on real history · 5–8 **shadow mode** (recommend, don't execute; compare to planner decisions) · 9–10 approval workflow + RBAC · 11–12 limited go-live on one product family.

---

## 7. Trust boundaries (case-study compliance)

| Rule | How we comply |
|---|---|
| Don't invent demand signals | Forecast uses recorded sales only; supplied `demand_surge` signals are applied only to listed SKUs and labelled as assumptions |
| Don't apply an event to unrelated SKUs | Every disruption lists `affected_skus` / `affected_routes`; nothing else is touched (the route-delay seed lists no SKUs) |
| Don't treat uncertain demand as guaranteed | P10–P90 on every forecast; benefits are expected values; P10 downside shown per transfer |
| Don't execute without approval | Agent only proposes; approval re-checks the live plan and refuses stale or not-recommended actions |
| Label unsupported conclusions | `assumptions` and `data_quality_notes` on every forecast; delay-day assumptions shown on every affected PO/route |

---

*GulfTrade Intelligence — Team Hackermen, Tradeling Hackathon*
