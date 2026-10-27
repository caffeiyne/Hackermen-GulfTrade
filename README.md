# Tradeling Case Study: From Inventory Imbalance to Intelligent Supply Chains

> Build an AI-based demand planning and stock distribution agent that helps businesses anticipate demand, identify stock in the wrong locations, reduce ageing and excess holding, and recommend evidence-based inventory movements.

---

## 1. Business Context

This challenge is set within a fictional supplier business participating in a B2B commerce ecosystem like Tradeling Group's, where buyers, suppliers, distribution and logistics services may interact. The scenario does not assume that Tradeling owns all seller inventory or directly controls every warehouse.

Stock may accumulate in one location while demand rises elsewhere. Businesses then face avoidable shortages, ageing products, unnecessary replenishment and higher holding costs. Historical sales alone can be misleading when demand is seasonal, stockouts suppress observed sales, or external disruptions affect supply.

The challenge is not simply to generate a forecast. It is to distinguish reliable data from uncertain assumptions, recommend feasible stock actions, and explain the commercial trade-offs. The business and all examples below are fictional scenarios designed for the hackathon.

---

## 2. Meet the Business

**Sara** is the inventory planner for **GulfTrade Supplies**, a fictional UAE-based B2B seller of mobile accessories and computer peripherals. The seller manages approximately **5,000 units** across three inventory locations in **Dubai**, **Abu Dhabi** and **Sharjah**, serving business buyers through wholesale channels including a B2B marketplace.

Her team uses spreadsheets to track SKU-level stock, orders, stock age and inbound replenishment. Data arrives at different times and may contain gaps. A Dubai location sometimes holds excess chargers while Abu Dhabi runs short; older products remain unsold, and shipment delays make reorder decisions difficult.

Sara wants an assistant that combines sales, stock and replenishment records with supplied market-event signals to recommend where stock should be held, moved or replenished. Stock movements remain subject to the supplier's authorisation and operational constraints.

---

## 3. The Challenge

> How might AI help a B2B seller forecast location-level demand, identify misplaced or ageing inventory, and recommend cost-effective stock transfers and replenishment actions, while responding appropriately to market and supply-chain disruptions?

### What Participants Should Build

Develop a working prototype that supports the following journey:

| Stage | Expected Capability |
|---|---|
| **Understand inventory** | Accept SKU, warehouse, sales, inbound-order and stock-age data. Create a structured view of available, reserved and incoming stock, retaining data sources and timestamps. |
| **Forecast demand** | Estimate 30-day demand by SKU and location using historical records and supplied external signals. Show assumptions, uncertainty and any data-quality limitations. |
| **Identify imbalances** | Flag likely shortages, excess stock, ageing inventory and potentially misleading sales history caused by stockouts or missing records. |
| **Recommend actions** | Propose quantities and routes for stock transfers or replenishment changes, accounting for transfer cost, lead time, safety stock, and stock availability. |
| **Explain impact and next steps** | Compare expected shortages, ageing exposure, holding cost and transfer cost before and after actions. Rank recommendations and require planner approval. |

A strong solution should let Sara correct a record or change a disruption assumption once and see the revised forecast, recommended actions and business-impact estimate throughout the workflow.

### Illustrative Demonstration

Sara reviews USB-C chargers: Dubai has 500 units against 200 forecast for the next 30 days; Abu Dhabi has 100 against 350; and Sharjah has 300 against 150. The assistant flags a potential Abu Dhabi shortage and suggests a transfer from Dubai, but only after checking safety stock, inbound orders, transfer lead time and net economic benefit.

A supplied event then indicates that semiconductor-related supply constraints may delay replenishment for specifically affected SKUs. The assistant reassesses shortage risk and its recommendation. It must not assume that all products are affected, invent a new market event, or treat a forecast as certain. Sara reviews and approves or rejects the action.

---

## 4. Three-Day Prototype Scope

Limit the core demonstration to:

- **20 fictional SKUs** across **five related product types**
- **Three UAE inventory locations** (Dubai, Abu Dhabi, Sharjah)
- **90 days** of historical sales
- **30-day** planning horizon
- **Two labelled disruption scenarios**: a component-related supply shortage and a shipping-route delay

Keep the objective to **decision support**, not full-scale enterprise optimisation.

Assume participating seller permissions and basic operating arrangements are in place. Live inventory transfers, purchasing, real shipment bookings, production integrations and comprehensive regulatory assessment are outside the core scope.

### Suggested Input Pack

- SKU master
- 90-day sales history
- Warehouse-level available and reserved inventory
- Stock ageing
- Safety stock
- Inbound orders and supplier lead times
- Inter-location transfer costs and lead times
- Holding costs
- Dated disruption signals
- Versioned evaluation checklist

Include missing observations, stockout periods, ageing stock and one economically unattractive transfer, with a separate answer key for judges.

---

## 5. How Success Should Be Demonstrated

Teams should compare their prototype with a simple baseline using the same sample inventory, such as recent average demand with no proactive transfers. Judges should measure:

- Demand forecast error
- Expected shortage reduction
- Avoidable excess and ageing
- Net economic benefit after transfer costs
- Constraint compliance
- Clarity of explanations

The intended business value is better product availability, less avoidable stockholding, fewer lost-sales opportunities and faster, better-supported planning decisions. A solution that transfers more stock or claims larger savings without supporting evidence should not score better than a cautious, feasible solution.

> **Trust boundary:** The prototype must not invent demand signals, assert that a market event affects unrelated SKUs, treat uncertain demand as guaranteed, or execute stock movements without authorised human approval. Unsupported conclusions must remain labelled as assumptions or unverified.

---

## 6. Shared Submission and Evaluation Framework

### Participant Deliverables

Each team should submit:

1. **A working prototype**
2. **A five-minute demonstration**
3. **A short supporting note** covering the business problem, datasets, method, test results, limitations and requirements for a real-world pilot

Source code and setup instructions should allow judges to reproduce the demonstration.

The demonstration should include:
- **One normal planning journey**
- **One difficult case** involving missing information, a supply disruption, a stockout-distorted demand history, or a transfer that should not be recommended

### Judging Criteria

| Criterion | Weight | What Judges Should Assess |
|---|---|---|
| **Business relevance and value** | 30% | Does the solution solve a meaningful inventory problem and quantify credible business benefits? |
| **AI quality and evidence** | 25% | Are forecasts, signals and recommendations accurate, traceable and appropriately cautious? |
| **Working prototype** | 20% | Does the end-to-end planning and recommendation journey work, including difficult cases? |
| **Seller / planner experience** | 15% | Is the solution understandable, practical and easy to review or correct? |
| **Responsible design and scalability** | 10% | Are permissions, privacy, human approval, operating costs and deployment considered? |
| **Total** | **100%** | |

### Common Operating Boundaries

- Use synthetic or explicitly approved anonymised data; no production credentials or identifiable customer or supplier information should be required
- Mock integrations are acceptable
- Policy-dependent guidance must reference supplied, dated material
- Unsupported conclusions must be clearly labelled

---

*Wish you all the best.*

*Tradeling Group | Hackathon case study | Fictional demonstration scenario*
