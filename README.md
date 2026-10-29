# GulfTrade Intelligence — Inventory & Demand Planner

> AI-based demand planning and stock distribution agent for the Tradeling Hackathon. Built with PostgreSQL + FastAPI + Next.js 14.

**Supplementary documents:**
- [SUPPORTING_NOTE.md](./SUPPORTING_NOTE.md) — Business problem, datasets, method, test results, limitations, pilot requirements (deliverable #3)
- [ANSWER_KEY.md](./ANSWER_KEY.md) — Answer key for judges to verify each test case

---

## Quick Start (Docker Compose — recommended)

```bash
git clone https://github.com/caffeiyne/Hackermen-GulfTrade.git
cd Hackermen-GulfTrade
docker compose up --build
```

That's it. Four services start automatically:

| Service | URL | Description |
|---------|-----|-------------|
| **Dashboard** | http://localhost:3000 | Next.js frontend |
| **API** | http://localhost:8000 | FastAPI backend (Swagger at `/docs`) |
| **PostgreSQL** | localhost:5432 | Database (auto-seeds schema + data) |
| **pgAdmin** | http://localhost:5050 | DB browser (admin@tradling.com / admin) |

Open **http://localhost:3000** — you're live.

---

## Demo Setup for Judges

### Option 1: Cloudflare Tunnel (recommended — works anywhere)

No WiFi sharing needed. Judges access via a public URL.

```bash
# Terminal 1 — start all services
docker compose up --build

# Terminal 2 — expose via Cloudflare tunnel
winget install Cloudflare.cloudflared     # if not installed
cloudflared tunnel --url http://localhost:3000
```

Cloudflare prints a public URL like `https://random-words.trycloudflare.com`. Share it with judges — they open it in any browser, no install required.

> The dashboard proxies all API calls through port 3000, so a single tunnel covers everything.

### Option 2: LAN (same WiFi network)

```bash
docker compose up --build
```

Find your IP:
```bash
ipconfig        # Windows
ifconfig        # Mac/Linux
```

Share `http://YOUR_IP:3000` with judges on the **same WiFi**.

> If judges can't connect, open Windows Firewall ports 3000 and 8000, and set the network profile to **Private**.

### Option 3: Manual (no Docker)

```bash
# 1. Set up the database
python setup.py --db-url "postgresql://postgres:postgres@localhost:5432/tradling"

# 2. Terminal 1 — backend
cd simulator
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 3. Terminal 2 — frontend
cd dashboard
npm install
npm run dev
```

Open http://localhost:3000.

**Prerequisites:** Python 3.11+, Node.js 18+, PostgreSQL 16+. Don't have a database? Use [Supabase](https://supabase.com) (free, no install) — use the **direct** connection on port 5432, not the pooled one (LISTEN/NOTIFY requires it).

---

## Demo Walkthrough (5-Minute Script)

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

Reset the simulator (or use the **Reset Demo Data** button for a full DB reset), then start **Scenario B**:
- Same imbalance exists, but two disruptions fire on schedule:
  - Day 9: Semiconductor supply constraint (CHG-UC-002, CHG-UC-003)
  - Day 14: DXB-SHJ shipping route delay
- The agent must NOT assume all products are affected
- The agent must reject the DXB→SHJ transfer (route disrupted + uneconomical)
- Watch the rejected recommendations appear with explanations

### 8. Cancel an Approved Transfer

Go to the **Actions** page:
- Approve a transfer recommendation
- On the executed action card, click **Cancel Transfer**
- The stock movement is reversed immediately — units return to the source warehouse
- The transfer shows a **Cancelled** badge (yellow) in the Action Summary

### Key Demo Points to Highlight

| What to show | Where | Why it matters |
|---|---|---|
| Real-time inventory changes | Overview dashboard | Sim is live, not static |
| Agent's plain-English reasoning | Agent panel (Overview) | Explainable AI, not a black box |
| Confidence levels + data quality notes | Forecast page | Appropriately cautious |
| Misleading sales flag | Imbalances page | Detects stockout-distorted demand |
| Constraints checked per recommendation | Actions page | Traceable, evidence-based |
| Before/after impact in AED | Actions page | Quantified business benefit |
| Baseline vs. AI Solution comparison | Actions page | Shows what happens if Sara does nothing vs. proactive transfers |
| Black swan → agent reacts in seconds | Simulator + Overview | Real-time agentic response |
| Emergency alert toast | Top of screen (all pages) | Disruption notification fires exactly once |
| Route disrupted badge | Actions page | Disruption-aware recommendations |
| Rejected recommendations with reasons | Agent panel | Doesn't just recommend everything |
| Human approval required | Actions page | Trust boundary — no autonomous execution |
| Cancel transfer (reverse stock movement) | Actions page | Human can undo — not irreversible |
| Reset demo data (one click) | Simulator page | Clean state for re-demo or judge retry |
| Mobile/iPad responsive view | Open URL on phone | Works on any device judges bring |

---

## Architecture

```
tradling-logistics/
├── docker-compose.yml      # All services (DB + API + Dashboard + pgAdmin)
│
├── setup.py                # One-command setup wizard (DB + env files)
├── setup_db.py             # Database setup helper
├── demo-host.bat           # Windows one-click demo launcher
│
├── db/                     # PostgreSQL schema + seed data
│   ├── schema.sql          # 5 schemas with LISTEN/NOTIFY triggers
│   ├── seeds.sql           # 20 SKUs, 3 warehouses, transfer matrix (re-seedable)
│   ├── disruptions.sql     # 2 labelled disruption scenarios
│   ├── reset_demo.sql      # One-click reset: truncate sim data + restore stock levels
│   └── generate_sales.py   # 90-day sales history generator
│
├── simulator/              # FastAPI backend
│   └── app/
│       ├── main.py         # FastAPI app + WebSocket + CORS
│       ├── db.py           # asyncpg pool + LISTEN/NOTIFY bridge + SSL support
│       ├── config.py       # Pydantic settings (reads .env)
│       ├── models.py       # Pydantic request models (includes cancel transfer)
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
│   ├── next.config.mjs     # API/WS rewrites for tunnel + LAN proxying
│   ├── lib/
│   │   ├── api.ts          # API client (auto-detects host, proxied via Next.js)
│   │   ├── types.ts        # TypeScript types mirroring backend
│   │   └── useRealTime.ts  # WebSocket hook for live events (graceful fallback)
│   ├── components/
│   │   ├── AgentPanel.tsx  # Live agent reasoning display
│   │   ├── EmergencyAlertSystem.tsx  # Black swan toast notifications
│   │   ├── UAEMap.tsx     # Warehouse map visualization
│   │   ├── layout/
│   │   │   ├── Shell.tsx   # Responsive shell + collapsible sidebar (mobile/iPad)
│   │   │   ├── Sidebar.tsx # Navigation sidebar
│   │   │   └── TopBar.tsx  # Top bar with live clock + status
│   │   └── ui/             # Reusable UI components
│   └── app/
│       ├── page.tsx        # Overview (KPIs + agent panel)
│       ├── dashboard/      # Inventory map + warehouse breakdown
│       ├── forecast/       # 30-day demand forecasts
│       ├── imbalances/     # Flagged shortages/excess/ageing
│       ├── actions/        # Recommendations + approve/reject/cancel + impact
│       ├── timeline/       # Real-time event feed
│       └── simulator/      # Scenario controls + Black Swan + Reset Demo Data
│
├── SUPPORTING_NOTE.md      # Business problem, method, results (deliverable #3)
└── ANSWER_KEY.md           # Judge verification answer key
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
| POST | `/api/orders/transfers/{id}/cancel` | Cancel an approved transfer (reverses stock movement) |
| GET | `/api/disruptions` | Disruption signals |
| GET | `/api/recommendations` | AI recommendations + impact + baseline comparison |
| GET | `/api/recommendations/forecasts` | 30-day demand forecasts |
| GET | `/api/recommendations/imbalances` | Flagged imbalances |
| GET | `/api/recommendations/full-analysis` | Complete decision package |
| POST | `/api/simulator/start` | Start a scenario |
| POST | `/api/simulator/pause` | Pause simulation |
| POST | `/api/simulator/reset` | Reset to initial state |
| POST | `/api/simulator/reset-demo-data` | Full DB reset — truncate sim data + re-seed stock levels |
| POST | `/api/simulator/inject` | Inject custom disruption (black swan) |
| GET | `/api/simulator/timeline` | Event audit log |
| GET | `/api/simulator/scenarios` | List available scenarios |
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

**Sara** is the inventory planner for **GulfTrade Supplies**, a fictional UAE-based B2B seller of mobile accessories and computer peripherals. The seller manages approximately **5,000 units** across three inventory locations in **Dubai**, **Abu Dhabi** and **Sharjah**.

The challenge: how might AI help a B2B seller forecast location-level demand, identify misplaced or ageing inventory, and recommend cost-effective stock transfers and replenishment actions, while responding appropriately to market and supply-chain disruptions?

### Trust Boundary

The prototype must not:
- Invent demand signals
- Assert that a market event affects unrelated SKUs
- Treat uncertain demand as guaranteed
- Execute stock movements without authorised human approval

Unsupported conclusions must remain labelled as assumptions or unverified.

---

*Tradeling Group | Hackathon case study | Fictional demonstration scenario*
