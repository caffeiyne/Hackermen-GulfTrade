# Tradeling Hackathon — Quick Start

## Option A: Docker (One Command — Recommended)

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running

### Steps

```powershell
git clone https://github.com/caffeiyne/Hackermen-GulfTrade.git
cd Hackermen-GulfTrade
docker compose up
```

That's it. Docker will:
1. Start PostgreSQL with schema + seed data (20 SKUs, 3 warehouses, disruptions)
2. Generate 90 days of sales history
3. Start the FastAPI backend on port 8000
4. Start the Next.js dashboard on port 3000

First run takes ~3-5 minutes (building images). Subsequent runs take ~30 seconds.

Open:
- **Dashboard:** http://localhost:3000
- **API docs:** http://localhost:8000/docs
- **pgAdmin (optional):** http://localhost:5050 (admin@tradling.com / admin)

To stop: `Ctrl+C` or `docker compose down`

---

## Option B: Manual Setup (Supabase + Local Dev)

### 5-Minute Setup

### Step 1: Create a Supabase Database (2 min)

1. Go to [supabase.com](https://supabase.com) → Sign up → New Project
2. Name it `tradeling-logistics`, choose a region, set a DB password
3. Wait ~1 min for provisioning
4. Go to **Project Settings → Database → Connection String**
5. Copy the **Direct connection** string (NOT the pooled one — LISTEN/NOTIFY needs a direct connection)
   - Looks like: `postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT].supabase.co:5432/postgres`

### Step 2: Initialize the Database (1 min)

```powershell
cd "c:\Users\Karl Batac\Desktop\Tradeling Logistics\tradling-logistics"

# Install asyncpg if you don't have it
pip install asyncpg

# Run the setup script with your Supabase connection string
python setup_db.py --db-url "postgresql://postgres:YOURPASSWORD@db.YOURPROJECT.supabase.co:5432/postgres"
```

This creates all schemas, tables, 20 SKUs, 3 warehouses, inventory, and disruptions.

### Step 3: Generate 90 Days of Sales History (30 sec)

```powershell
cd db
python generate_sales.py --db-url "postgresql://postgres:YOURPASSWORD@db.YOURPROJECT.supabase.co:5432/postgres"
```

### Step 4: Configure & Start the Backend (1 min)

```powershell
cd simulator

# Create .env file
echo "DATABASE_URL=postgresql://postgres:YOURPASSWORD@db.YOURPROJECT.supabase.co:5432/postgres" > .env
echo "CORS_ORIGINS=["http://localhost:3000"]" >> .env

# Install deps
pip install -r requirements.txt

# Start
uvicorn app.main:app --reload --port 8000
```

Verify: Open http://localhost:8000/docs — you should see the Swagger API.

### Step 5: Start the Dashboard (1 min)

```powershell
cd dashboard

# Create .env.local
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
echo "NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws/live" >> .env.local

# Install deps
npm install

# Start
npm run dev
```

Open http://localhost:3000

---

## Demo Flow (5 Minutes)

### 1. Overview (30 sec)
- Land on the overview page → KPI cards show current stock state
- Mention: 20 SKUs, 3 UAE warehouses, 90 days of history

### 2. Start Scenario A — Normal (1 min)
- Go to `/simulator`
- Select **Scenario A** (Normal Planning Journey)
- Click **Start Simulation**
- Watch the live event feed: sales arrive, imbalance detected, recommendation generated
- Go to `/dashboard` → see inventory bars updating in real time
- Go to `/actions` → approve the DXB→AUH transfer
- Return to `/dashboard` → watch the transfer complete and Abu Dhabi stock recover

### 3. Start Scenario B — Difficult (1.5 min)
- Reset the simulator
- Select **Scenario B** (Supply Disruption + Shipping Delay)
- Watch the semiconductor disruption fire mid-simulation
- The AI reassesses — watch recommendations update on `/actions`
- The expensive AUH→SHJ route is NOT recommended (correct behavior)

### 4. Inject Black Swan Events (1.5 min)
- On the `/simulator` page, scroll to the **Black Swan Events** panel
- Click **"Port Strike"** → watch the disruption propagate to the dashboard
- Click **"Demand Spike"** → earbuds demand surges, new shortage flags appear
- Click **"Flash Flood"** → DXB-SHJ transfers frozen
- Go to `/imbalances` → see how the flags changed
- Go to `/timeline` → see the full event audit log

### 5. Q&A (30 sec)
- Point judges to the Swagger docs at http://localhost:8000/docs
- Mention the trust boundaries: only specific SKUs affected, no invented events
- Show the data quality notes on the forecast page

---

## Black Swan Presets

| Button | Type | What Happens |
|---|---|---|
| **Chip Shortage** | supply_shortage | GaN charger SKUs (CHG-UC-002, CHG-UC-003) inbound ETAs slip |
| **Port Strike** | shipping_delay | All Dubai inbound delayed, 4 SKU POs affected |
| **Road Closure** | shipping_delay | DXB-AUH highway blocked for 5 days |
| **Demand Spike** | supply_shortage | Earbuds demand 5x — unexpected viral surge |
| **Warehouse Fire** | supply_shortage | Sharjah power bank stock destroyed |
| **Flash Flood** | shipping_delay | DXB-SHJ corridor impassable for 7 days |
| **Custom** | either | Build your own disruption with any SKUs, severity, duration |

---

## Deployment (Vercel + Railway + Supabase)

| Service | What | Steps |
|---|---|---|
| **Supabase** | PostgreSQL | Already done in Step 1 |
| **Railway** | FastAPI backend | Connect GitHub repo → set root to `simulator/` → add `DATABASE_URL` env var → deploy |
| **Vercel** | Next.js dashboard | Connect GitHub repo → set root to `dashboard/` → add `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL` env vars → deploy |

Update `dashboard/.env.local` with the Railway URL:
```
NEXT_PUBLIC_API_URL=https://your-backend.up.railway.app
NEXT_PUBLIC_WS_URL=wss://your-backend.up.railway.app/ws/live
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `asyncpg.connect` fails on Supabase | Use the **Direct** connection string, not the pooled one |
| WebSocket not connecting | Ensure `NEXT_PUBLIC_WS_URL` matches your backend URL. Use `ws://` for local, `wss://` for deployed |
| CORS errors in browser | Set `CORS_ORIGINS` in `simulator/.env` to include your frontend URL |
| `module 'app' not found` | Run uvicorn from inside the `simulator/` directory |
| Database already has data | `python setup_db.py` drops and recreates tables (schema.sql uses `DROP TABLE IF EXISTS`) |
