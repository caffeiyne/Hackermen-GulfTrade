# GulfTrade Intelligence — Inventory & Demand Planner

> AI-based demand planning and stock distribution agent for the Tradeling Hackathon. Built with PostgreSQL + FastAPI + Next.js 14.

---

## Quick Start (One Command)

```bash
python setup.py
```

This wizard tests your DB connection, loads the schema/seeds/disruptions, generates 90 days of sales history, and creates all `.env` files for you. It works with **local PostgreSQL**, **Supabase**, or **Neon**.

```bash
# Interactive (prompts for DB URL)
python setup.py

# Or pass the connection string directly
python setup.py --db-url "postgresql://postgres:yourpass@db.xxxx.supabase.co:5432/postgres"

# Skip sales generation (faster, but forecasts will have no data)
python setup.py --skip-sales --db-url "postgresql://..."
```

---

## Setup Guide

You need a PostgreSQL database. Pick **one** path below — all three work.

### Option A: Supabase (recommended — free, no install)

1. Go to [supabase.com](https://supabase.com) → create a free project
2. Go to **Project Settings → Database → Connection string → URI**
3. Copy the **direct** connection (port 5432), NOT the pooled one
   ```
   postgresql://postgres:yourpassword@db.xxxx.supabase.co:5432/postgres
   ```
4. Run:
   ```bash
   python setup.py --db-url "postgresql://postgres:yourpassword@db.xxxx.supabase.co:5432/postgres"
   ```

> **Why direct, not pooled?** The app uses PostgreSQL `LISTEN/NOTIFY` for real-time WebSocket events. PgBouncer (pooler) doesn't support LISTEN. Use port 5432.

### Option B: Neon (free, no install)

1. Go to [neon.tech](https://neon.tech) → create a free project
2. Copy the connection string (append `?sslmode=require`):
   ```
   postgresql://user:pass@ep-xxx.neon.tech/dbname?sslmode=require
   ```
3. Run:
   ```bash
   python setup.py --db-url "postgresql://user:pass@ep-xxx.neon.tech/dbname?sslmode=require"
   ```

### Option C: Local PostgreSQL

1. Install PostgreSQL 16+ (or use Docker for just the DB):
   ```bash
   docker run --name tradling-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=tradling -p 5432:5432 -d postgres:16-alpine
   ```
2. Run:
   ```bash
   python setup.py --db-url "postgresql://postgres:postgres@localhost:5432/tradling"
   ```

### Option D: Full Docker Compose (everything including pgAdmin)

```bash
docker-compose up --build

# Services:
#   Dashboard:  http://localhost:3000
#   API:        http://localhost:8000  (Swagger at /docs)
#   PostgreSQL: localhost:5432
#   pgAdmin:    http://localhost:5050  (admin@tradling.com / admin)
```

---

## Starting the Backend + Frontend

After `setup.py` completes, open **two terminals**:

### Terminal 1 — Backend (FastAPI)

```bash
cd simulator
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

- API docs: http://localhost:8000/docs
- Health check: http://localhost:8000/health
- WebSocket: ws://localhost:8000/ws/live

### Terminal 2 — Frontend (Next.js)

```bash
cd dashboard
npm install
npm run dev
```

- Dashboard: http://localhost:3000

> The `setup.py` script auto-creates `simulator/.env` and `dashboard/.env.local` with the correct values. If you need to set them manually, see `.env.example`.

---

## Demo Walkthrough (5-Minute Script)

This is the recommended flow for demonstrating the solution to judges.

### 1. Open the Dashboard

Go to **http://localhost:3000**. You'll see:
- **Overview page** — KPIs across all 3 warehouses, live agent panel
- The agent is already running (started with the backend) and has completed its first analysis

### 2. Start the Simulation

Go to the **Simulator** page (left nav):
- Select **Scenario A** (Normal Planning Journey)
- Click **Start**
- The sim clock starts advancing — 1 simulated day every 24 real seconds
- Sales transactions are generated in real time, inventory levels update on the dashboard
- The agent observes every 30 seconds and reacts to events

### 3. Watch the Agent Reason

Go to the **Overview** page — look at the **Inventory Agent** panel:
- It shows a plain-English explanation of what it observed
- The reasoning chain (forecast → detect imbalances → evaluate options → act)
- Actions it auto-proposed (transfers that need Sara's approval)

Go to the **Actions** page to see:
- Ranked recommendations with cost/benefit breakdown
- Before/after impact assessment (shortage exposure in AED)
- Constraints checked for each recommendation
- Approve/Reject buttons

### 4. Go to the Forecast Page

See the **30-day demand forecasts** per SKU/warehouse with:
- Confidence bands (P10/P90)
- Confidence levels (high/medium/low) with reasons
- Data quality notes (stockout corrections, missing data)

### 5. Go to the Imbalances Page

See flagged issues:
- **Shortages** — projected stock below safety
- **Excess** — stock exceeding demand + buffer
- **Ageing** — 61+ day old stock risk
- **Misleading sales** — stockout-distorted demand flagged with reduced confidence

### 6. Inject a Black Swan (the highlight)

Go back to the **Simulator** page. Scroll to the **Black Swan Events** panel:
- Click **Port Strike** — all Dubai inbound delayed
- Watch the agent panel (Overview) — it immediately shows **"Thinking..."**
- Within seconds, the agent reassesses all recommendations with the new disruption factored in
- Go to Actions — recommendations now show **"Route Disrupted"** badges and updated lead times

Try other black swans:
- **Chip Shortage** — GaN charger supply cut (affects specific SKUs only)
- **Warehouse Fire** — Sharjah power bank stock destroyed
- **Demand Spike** — viral social media surge on earbuds
- **Flash Flood** — DXB-SHJ corridor impassable
- Or use **Custom** to inject your own disruption with any SKU/route/severity/duration

### 7. Try Scenario B (the difficult case)

Reset the simulator, then start **Scenario B**:
- Same imbalance exists, but two disruptions fire on schedule:
  - Day 9: Semiconductor supply constraint (CHG-UC-002, CHG-UC-003)
  - Day 14: DXB-SHJ shipping route delay
- The agent must NOT assume all products are affected
- The agent must reject the DXB→SHJ transfer (route disrupted + uneconomical)
- Watch the rejected recommendations appear with explanations

### Key Demo Points to Highlight

| What to show | Where | Why it matters |
|---|---|---|
| Real-time inventory changes | Overview dashboard | Sim is live, not static |
| Agent's plain-English reasoning | Agent panel (Overview) | Explainable AI, not a black box |
| Confidence levels + data quality notes | Forecast page | Appropriately cautious |
| Misleading sales flag | Imbalances page | Detects stockout-distorted demand |
| Constraints checked per recommendation | Actions page | Traceable, evidence-based |
| Before/after impact in AED | Actions page | Quantified business benefit |
| Black swan → agent reacts in seconds | Simulator + Overview | Real-time agentic response |
| Route disrupted badge | Actions page | Disruption-aware recommendations |
| Rejected recommendations with reasons | Agent panel | Doesn't just recommend everything |
| Human approval required | Actions page | Trust boundary — no autonomous execution |

---

## Architecture

```
tradling-logistics/
├── setup.py                # One-command setup wizard (DB + env files)
│
├── db/                     # PostgreSQL schema + seed data
│   ├── schema.sql          # 5 schemas with LISTEN/NOTIFY triggers
│   ├── seeds.sql           # 20 SKUs, 3 warehouses, transfer matrix
│   ├── disruptions.sql     # 2 labelled disruption scenarios
│   └── generate_sales.py   # 90-day sales history generator
│
├── simulator/              # FastAPI backend
│   └── app/
│       ├── main.py         # FastAPI app + WebSocket endpoint
│       ├── db.py           # asyncpg pool + LISTEN/NOTIFY bridge
│       ├── config.py       # Pydantic settings (reads .env)
│       ├── models.py       # Pydantic request models
│       ├── routes/         # REST API routes (7 routers)
│       ├── ai/             # The agent + its tools
│       │   ├── agent.py    # Autonomous reasoning agent (observe→reason→plan→explain→act)
│       │   ├── forecaster.py       # 30-day demand forecasts with stockout correction
│       │   ├── imbalance_detector.py  # Shortage/excess/ageing/misleading-sales flags
│       │   └── recommender.py      # Cost-benefit ranked transfer recommendations
│       └── engine/         # Scenario runner + event generator
│           ├── scenario_runner.py  # Real-time sim loop (24 sec = 1 sim day)
│           └── scenarios.py        # Pre-built scenarios A + B
│
├── dashboard/              # Next.js 14 frontend
│   ├── lib/
│   │   ├── api.ts          # API client (all endpoints)
│   │   ├── types.ts        # TypeScript types mirroring backend
│   │   └── useRealTime.ts  # WebSocket hook for live events
│   ├── components/
│   │   ├── AgentPanel.tsx  # Live agent reasoning display
│   │   ├── UAEMap.tsx     # Warehouse map visualization
│   │   └── ui/             # Reusable UI components
│   └── app/
│       ├── page.tsx        # Overview (KPIs + agent panel)
│       ├── dashboard/      # Inventory map + warehouse breakdown
│       ├── forecast/       # 30-day demand forecasts
│       ├── imbalances/     # Flagged shortages/excess/ageing
│       ├── actions/        # Recommendations + approve/reject + impact
│       ├── timeline/       # Real-time event feed
│       └── simulator/      # Scenario controls + Black Swan injection panel
│
├── docker-compose.yml      # All services (optional)
└── .env.example            # Environment template
```

## Real-Time Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Backend (FastAPI)                                           │
│                                                              │
│  ScenarioRunner ──24 sec/day──► Generate sales              │
│       │                        Reduce inventory              │
│       │                        Write audit log               │
│       │                                                     │
│       ▼                                                     │
│  pg_notify('sim_events', payload)                           │
│       │                                                     │
│       ▼                                                     │
│  asyncpg LISTEN ──► asyncio Queue ──► WebSocket /ws/live    │
│                                                              │
│  InventoryAgent (singleton)                                 │
│    • Auto-starts with backend                                │
│    • Observes every 30s                                      │
│    • Reacts to events within 1 second                        │
│    • Pipeline: Observe → Forecast → Detect → Recommend       │
│                → Explain → Act (propose transfers)           │
│    • Pushes reasoning via WebSocket                          │
└─────────────────────────────────────────────────────────────┘
                            │
                    WebSocket JSON stream
                            │
┌───────────────────────────┴──────────────────────────────────┐
│  Frontend (Next.js)                                          │
│                                                               │
│  useRealTime() hook ← WebSocket                               │
│       │                                                       │
│       ├── Overview page ← agent_reasoning events              │
│       ├── Inventory map ← sale_recorded / inventory_changed   │
│       ├── Actions page ← recommendation_updated               │
│       ├── Timeline page ← all events                          │
│       └── Simulator page ← sim_clock_tick + disruption events │
└───────────────────────────────────────────────────────────────┘
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/skus` | List all 20 SKUs |
| GET | `/api/warehouses` | List 3 UAE warehouses |
| GET | `/api/inventory` | Current stock levels |
| GET | `/api/inventory/summary/overview` | Aggregated warehouse metrics |
| GET | `/api/sales/history` | 90-day sales history |
| GET | `/api/sales/data-quality` | Stockout periods + missing data |
| GET | `/api/orders/inbound` | Inbound purchase orders |
| GET | `/api/orders/transfers` | Transfer proposals |
| POST | `/api/orders/transfers/{id}/approve` | Approve transfer (Sara) |
| POST | `/api/orders/transfers/{id}/reject` | Reject transfer |
| GET | `/api/disruptions` | Disruption signals |
| GET | `/api/recommendations` | AI recommendations + impact |
| GET | `/api/recommendations/forecasts` | 30-day demand forecasts |
| GET | `/api/recommendations/imbalances` | Flagged imbalances |
| GET | `/api/recommendations/full-analysis` | Complete decision package |
| POST | `/api/simulator/start` | Start a scenario |
| POST | `/api/simulator/pause` | Pause simulation |
| POST | `/api/simulator/reset` | Reset to initial state |
| POST | `/api/simulator/inject` | Inject custom disruption (black swan) |
| GET | `/api/simulator/timeline` | Event audit log |
| GET | `/api/agent/analysis` | Agent's latest reasoning cycle (full output) |
| GET | `/api/agent/status` | Is agent running + cycles completed |
| POST | `/api/agent/trigger` | Manually trigger an agent reasoning cycle |
| WS | `/ws/live` | Real-time event stream |

## Scenarios

| Scenario | Description |
|----------|-------------|
| **A** | Normal planning journey — USB-C charger imbalance (Dubai excess, Abu Dhabi shortage) |
| **B** | Difficult case — semiconductor supply constraint + DXB-SHJ shipping delay |

## Data Summary

- **20 SKUs** across 5 product types (chargers, cables, power banks, earbuds, mice)
- **3 warehouses** (Dubai, Abu Dhabi, Sharjah)
- **90 days** of sales history with embedded stockout periods + missing data
- **2 disruption scenarios** (supply shortage + shipping delay)
- **One deliberately unattractive transfer** (AUH→SHJ, cost exceeds benefit)

---

## Original Case Study

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
