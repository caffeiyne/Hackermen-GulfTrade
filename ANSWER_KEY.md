# Answer Key for Judges — GulfTrade Intelligence

> This document helps judges verify that the prototype demonstrates the correct behaviour for each test case in the case study. Use this alongside the live demo.

---

## Test Case 1: Normal Planning Journey (Scenario A)

### What should happen

| Step | Expected Behaviour | How to Verify |
|---|---|---|
| Start Scenario A | Sim clock advances, sales generated, inventory depletes | Overview page — KPIs update in real time |
| Agent observes | Agent panel shows "Observing..." then reasoning | Overview page — Agent Panel |
| Forecast generated | 30-day demand per SKU/warehouse with confidence bands | Forecast page — check P10/P90 and confidence level |
| Imbalance detected | Shortage flagged for AUH (USB-C chargers) | Imbalances page — look for "shortage" flag |
| Excess detected | Excess flagged for DXB (same SKU) | Imbalances page — look for "excess" flag |
| Transfer recommended | DXB → AUH transfer proposed with net benefit > 0 | Actions page — should show as #1 ranked, "Feasible" |
| Constraints checked | Safety stock, lead time, route cost, source availability | Actions page — "Constraints Checked" section |
| Human approval required | Approve button enabled, transfer doesn't execute until clicked | Actions page — click "Approve & Execute" |
| Stock moves | DXB available decreases, AUH available increases | Overview or Warehouse Stock page |

### Correct answer

The agent should recommend transferring USB-C chargers from **Dubai (DXB)** to **Abu Dhabi (AUH)** because:
- DXB has excess stock above forecast + safety
- AUH has projected stock below safety
- Route DXB→AUH costs 1.50 AED/unit, 1-day lead time
- Net benefit is positive (lost sale cost avoided > transfer cost + holding cost delta)

---

## Test Case 2: Difficult Case (Scenario B)

### What should happen

| Step | Expected Behaviour | How to Verify |
|---|---|---|
| Start Scenario B | Same initial imbalance as Scenario A | Overview page |
| Day 9: Semiconductor disruption fires | Supply constraint for CHG-UC-002 and CHG-UC-003 only | Timeline page — look for disruption event |
| Agent does NOT assume all products affected | Only CHG-UC-002 and CHG-UC-003 forecasts adjusted | Forecast page — confidence drops to "low" for affected SKUs only. Other SKUs (CHG-UC-001, CHG-UC-004) remain unaffected |
| Day 14: DXB-SHJ route disruption fires | Shipping delay on DXB-SHJ corridor | Timeline page — look for route disruption event |
| Agent reassesses | Agent panel shows "Thinking..." then updated reasoning | Overview page — Agent Panel |
| DXB→SHJ transfer rejected | Route disrupted badge shown, transfer marked "Not Recommended" or not generated | Actions page — look for "Route Disrupted" badge |

### Correct answers

**Semiconductor disruption (Day 9):**
- **Affected SKUs**: CHG-UC-003 (GaN 65W), CHG-UC-002 (30W) — these use GaN components
- **NOT affected**: CHG-UC-001 (20W basic), CHG-UC-004 (car charger), all cables, power banks, earbuds, mice
- The agent must NOT recommend transferring more stock of unaffected SKUs based on this disruption
- Forecast confidence for affected SKUs drops to "low"

**DXB-SHJ route disruption (Day 14):**
- **Affected route**: DXB→SHJ and SHJ→DXB only
- **NOT affected**: DXB→AUH, AUH→DXB, AUH→SHJ, SHJ→AUH
- Any transfer recommendation using the DXB-SHJ route should show "Route Disrupted" badge
- Lead time increases by ~3 days (extra_days added in recommender)

---

## Test Case 3: Economically Unattractive Transfer

### What should happen

| Step | Expected Behaviour | How to Verify |
|---|---|---|
| AUH has shortage, SHJ has excess (or vice versa) | Transfer evaluated | Actions page |
| AUH→SHJ route costs 3.20 AED/unit, 2-day lead time | Cost is highest of all routes | Transfer matrix: AUH→SHJ = 3.20/unit vs DXB→AUH = 1.50/unit |
| Net benefit is negative | Transfer marked "Not Recommended" | Actions page — red badge, "Not Recommended" |
| Agent explains why | Reasoning shows cost exceeds benefit | Actions page — "Reasoning" section |

### Correct answer

The **AUH→SHJ** route is deliberately expensive (3.20 AED/unit, 2-day lead time vs. 0.80-1.50 for other routes). If a transfer using this route is evaluated, the transfer cost should exceed the expected benefit (lost margin avoided + holding saved), resulting in:
- `net_benefit < 0`
- `is_feasible = false`
- Badge: "Not Recommended"
- Still shown in the list (transparent — Sara can see what was considered and rejected)

---

## Test Case 4: Misleading Sales History

### What should happen

| Step | Expected Behaviour | How to Verify |
|---|---|---|
| A SKU has stockout periods in its 90-day history | Sales were 0 during stockout (suppressed demand) | Sales data — `is_stockout = true` flags |
| Forecaster corrects for stockouts | Stockout days replaced with non-stockout average | Forecast page — check `data_quality_notes` mentions "stockout days corrected" |
| Confidence reduced | Confidence level drops from "high" to "medium" | Forecast page — confidence level column |
| Imbalance detector flags it | "Misleading Sales" flag appears | Imbalances page — look for `flag_type: misleading_sales` |

### Correct answer

Any SKU/warehouse with stockout periods in its sales history should:
- Have forecast confidence reduced to "medium" (not "high")
- Show a data quality note: "X stockout days corrected in demand estimation"
- Appear on the Imbalances page with a "misleading_sales" flag
- The corrected forecast should be higher than the naive average (because suppressed demand was un-corrected)

---

## Test Case 5: Ageing Stock

### What should happen

| Step | Expected Behaviour | How to Verify |
|---|---|---|
| Some SKUs have stock in the 61-90 or 90+ age buckets | Stock age data exists | Warehouse Stock page or Imbalances page |
| Ageing flag fires if >25% of stock is 61+ days old | "Ageing" flag with severity | Imbalances page — look for `flag_type: ageing` |
| Recommended action: prioritize selling or transferring | Flag description includes recommendation | Imbalances page — "Recommended Action" field |

---

## Test Case 6: Baseline Comparison

### What should happen

| Step | Expected Behaviour | How to Verify |
|---|---|---|
| Actions page loads | "Baseline vs. AI Solution" card appears at top | Actions page |
| Baseline shows full shortage exposure | All projected shortfalls × lost margin | Shortage exposure should be highest in baseline |
| AI solution shows reduced shortage | Shortage reduced by feasible transfers | Shortage exposure should be lower than baseline |
| Net benefit shown | Difference between baseline and AI net position | Should be positive if any feasible recommendations exist |
| Service level comparison | Baseline vs. AI service level % | AI should be higher |

### Correct answer

The baseline (do nothing) should show:
- Higher shortage exposure (AED)
- Zero transfer cost
- Negative net position (all shortage losses accepted)
- Lower service level

The AI solution should show:
- Lower shortage exposure (reduced by transfers)
- Non-zero transfer cost (but less than shortage reduction)
- Positive or less-negative net position
- Higher service level

---

## Test Case 7: Black Swan Injection

### What should happen

| Step | Expected Behaviour | How to Verify |
|---|---|---|
| Inject Port Strike | All Dubai inbound delayed | Simulator page — Black Swan panel |
| Agent reacts immediately | Agent panel shows "Thinking..." | Overview page — within 1-2 seconds |
| Recommendations updated | New constraints appear, routes may be disrupted | Actions page — check for updated badges |
| Emergency alert fires | Toast notification appears once (not multiple) | Top of screen — single toast |

### Available black swan events

| Event | What It Does |
|---|---|
| Port Strike | Delays all DXB inbound shipments |
| Chip Shortage | Supply cut for specific charger SKUs (GaN-based) |
| Warehouse Fire | Destroys stock at a specific warehouse |
| Demand Spike | Viral surge on a specific product type |
| Flash Flood | Blocks a specific transfer route |
| Custom | User-defined disruption with SKU/route/severity/duration |

---

## Test Case 8: Cancel Transfer

### What should happen

| Step | Expected Behaviour | How to Verify |
|---|---|---|
| Approve a transfer | Stock moves, "Transfer Executed" card shows | Actions page |
| Click "Cancel Transfer" | Confirmation dialog appears | Actions page |
| Confirm cancellation | Stock reverses (returns to source), "Transfer Cancelled" badge | Actions page + Overview/Stock page |
| Action Summary shows cancelled | Yellow badge with reverse icon | Action Log page |

---

## Scoring Guide (for judges)

| Judging Criterion | Weight | What to Look For |
|---|---|---|
| Business relevance and value | 30% | Quantified AED impact, baseline comparison, shortage reduction |
| AI quality and evidence | 25% | Confidence levels, data quality notes, constraint checks, disruption-aware reasoning |
| Working prototype | 20% | End-to-end flow works: sim → forecast → detect → recommend → approve → execute |
| Seller/planner experience | 15% | Plain-English reasoning, approve/reject/cancel, mobile responsive |
| Responsible design | 10% | Human approval required, SKU-specific disruptions, uncertainty labelled |

---

*GulfTrade Intelligence — Tradeling Hackathon | Answer Key for Judges*
