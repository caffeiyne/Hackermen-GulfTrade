# Answer Key for Judges — GulfTrade Intelligence

> Expected behaviour for each test case, checked against the engine at the scenario start date (2024-10-27) after **Reset Demo Data**. API equivalents are given so results can be verified without the UI.

---

## Test 1 — Normal planning journey (Scenario A)

| Step | Expected | Where |
|---|---|---|
| Forecast | CHG-UC-001 @ AUH ≈ **292** units / 30d, P10–P90 ≈ 241–343, confidence *medium*, note "18 stockout days excluded"; raw average ≈ 268 | Forecast page · `/api/recommendations/forecasts` |
| Shortage | AUH short of safety stock **after** counting the 200-unit inbound PO | Imbalances page |
| Recommendation | **DXB→AUH, 62 units**, transfer cost 93 AED, net ≈ +393 AED, P10 net ≈ +98 AED | Actions page |
| Not recommended | **SHJ→AUH** for the same SKU — "gap already covered by a cheaper/faster source" | Actions page |
| Approval | Nothing moves until Approve; approval re-checks the live plan | Actions → Approve |

**Why not 300 units?** The case example says "Abu Dhabi 100 vs 350". The agent counts reserved stock (20) and the in-transit PO (200), so the real gap is the safety buffer, not 250 units. Moving more would add transport cost for little expected benefit.

---

## Test 2 — Difficult case (Scenario B)

| Day | Event | Expected |
|---|---|---|
| 9 | GaN semiconductor constraint | Confidence → *low* for **CHG-UC-002 and CHG-UC-003 only**; their POs shown as "+14d (assumption)". CHG-UC-001/004, cables, power banks, earbuds and mice unchanged. |
| 14 | DXB–SHJ route delay | Only DXB↔SHJ options get +3 days lead time and a **Route Disrupted** badge. They stay recommended only if still worth it. DXB↔AUH and AUH↔SHJ are untouched. No SKU is flagged by this event. |
| any | Agent panel | Reasoning names the disruption, lists affected SKUs/routes, and states the rest are unaffected |

---

## Test 3 — Economically unattractive transfer

AUH↔SHJ costs **3.20 AED/unit, 2 days** (vs 0.80–1.50). At the start date the list contains several **Not Recommended** options on this route, each with a reason, e.g.:

- CHG-UC-001 SHJ→AUH — *gap already covered by a cheaper/faster source*
- CAB-LT-002 SHJ→AUH — *transfer cost 3.20 AED/unit over 2d exceeds expected benefit*

Moves under 25 AED expected net are also shown as Not Recommended ("not worth the handling effort").

---

## Test 4 — Misleading sales history

| SKU @ location | Expected |
|---|---|
| CHG-UC-001 @ AUH | "18 stockout days excluded (censored demand)", "raw recent average would understate demand by ~8%", *misleading_sales* flag |
| Backtest | On stockout-hit series the agent's error is **1.6%** vs **43.9%** for the raw recent average (`/api/recommendations/backtest`) |

---

## Test 5 — Ageing stock

CHG-UC-001 @ DXB has 150 of 500 tracked units aged 61+ days → *ageing* flag with the tied-up value at cost. Dubai is also a transfer **source** for this SKU, so the recommended move reduces surplus there.

---

## Test 6 — Baseline vs plan (start date, all 12 recommendations approved)

| Metric | Baseline | Plan |
|---|---|---|
| Expected lost sales | 9,321 AED | 5,425 AED |
| Expected units short | 556 | 308 |
| Surplus holding (30d) | 3,324 AED | 1,987 AED |
| Transfer cost | 0 | 901 AED |
| Total expected cost | 12,644 AED | 8,313 AED |
| Fill rate | 89.1% | 93.9% |

Net **+4,331 AED**, which equals the sum of the per-transfer net benefits. Both columns use the same model, described under the card.

---

## Test 7 — Black swans (Simulator page)

| Button | Expected |
|---|---|
| Road Closure | DXB↔AUH blocked → DXB→AUH options *Not Recommended — route blocked*; re-routing via SHJ only where it still pays |
| Chip Shortage | GaN POs +14d; confidence low for CHG-UC-002/003 only |
| Port Strike | Charger POs held until the strike ends; transfers unaffected |
| Demand Spike | EAR-001/002 forecasts rise for the overlapping days, labelled "supplied signal … assumption" |
| Supplier Recall | Power bank POs +21d; Replenishment advice card lists remaining gaps |
| Flash Flood | DXB↔SHJ +7 days |

---

## Test 8 — Change once, see it everywhere

Simulator → **Planner controls**:
- *Mark as not happening* on the GaN disruption → confidence for CHG-UC-002/003 returns to normal; plan and impact recompute
- *Correct a stock record* (e.g. CHG-UC-001 @ AUH available → 20) → shortage, recommendation and impact recompute

Both write `assumption_changed` / `record_corrected` audit entries with before/after values (Timeline page).

---

## Test 9 — Approve, reject, cancel

- Approve works for **any** recommended card (not just the top 3) and uses the current quantity and cost
- Approving a stale or not-recommended option returns a clear 409 message instead of moving stock
- Cancel Transfer reverses the stock movement

---

## Scoring guide

| Criterion | Weight | Where to look |
|---|---|---|
| Business value | 30% | Baseline vs plan card; per-transfer net and P10 downside |
| AI quality and evidence | 25% | Backtest card; P10–P90; censoring notes; Not Recommended reasons; SKU-scoped disruptions |
| Working prototype | 20% | Scenario A → B, black swans, approve/cancel, planner controls |
| Planner experience | 15% | Plain-English agent panel; one-click approve; corrections; mobile layout |
| Responsible design and scale | 10% | Approval gate, audit log, labelled assumptions; SUPPORTING_NOTE §5–7 |

---

*GulfTrade Intelligence — Answer Key*
