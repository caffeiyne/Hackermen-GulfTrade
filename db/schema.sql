-- ============================================================================
-- Tradeling Hackathon: Inventory Intelligence — Database Schema
-- PostgreSQL with native schemas + LISTEN/NOTIFY for real-time simulation
-- ============================================================================
--
-- Schemas:
--   master    — Static reference data (SKUs, warehouses, transfer matrix)
--   inventory — Current stock state (levels, age)
--   sales     — Historical sales transactions (90 days)
--   orders    — Inbound POs + inter-location transfer proposals
--   events    — Disruption signals + simulation audit log
--
-- Real-time: Uses pg_notify() on the 'sim_events' channel after key writes.
--            FastAPI LISTENs and re-broadcasts to WebSocket clients.
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- for gen_random_uuid()

-- ============================================================================
-- SCHEMA: master
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS master;

-- ---------------------------------------------------------------------------
-- master.skus — 20 fictional SKUs across 5 product types
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS master.skus (
    sku_id           TEXT PRIMARY KEY,           -- e.g. 'CHG-UC-001'
    name             TEXT NOT NULL,
    product_type     TEXT NOT NULL,              -- charger | cable | power_bank | earbuds | mouse
    unit_cost        NUMERIC(10,2) NOT NULL,     -- cost to supplier per unit (AED)
    unit_price       NUMERIC(10,2) NOT NULL,     -- wholesale sell price (AED)
    shelf_life_days  INT NOT NULL DEFAULT 365,   -- for ageing context
    supplier_id      TEXT,
    supplier_lead_days INT NOT NULL DEFAULT 14,  -- default replenishment lead time
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- master.warehouses — 3 UAE locations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS master.warehouses (
    warehouse_id   TEXT PRIMARY KEY,             -- 'DXB', 'AUH', 'SHJ'
    name           TEXT NOT NULL,                -- 'Dubai', 'Abu Dhabi', 'Sharjah'
    city           TEXT NOT NULL,
    latitude       NUMERIC(9,6) NOT NULL,
    longitude      NUMERIC(9,6) NOT NULL,
    capacity_units INT NOT NULL,                 -- max storage capacity
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- master.transfer_matrix — Inter-location transfer cost + lead time
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS master.transfer_matrix (
    id              SERIAL PRIMARY KEY,
    from_warehouse  TEXT NOT NULL REFERENCES master.warehouses(warehouse_id),
    to_warehouse    TEXT NOT NULL REFERENCES master.warehouses(warehouse_id),
    cost_per_unit   NUMERIC(10,2) NOT NULL,      -- AED per unit transferred
    lead_time_days  INT NOT NULL,                -- transit time
    route_name      TEXT,                        -- e.g. 'DXB-AUH Express'
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT no_self_transfer CHECK (from_warehouse <> to_warehouse),
    UNIQUE (from_warehouse, to_warehouse)
);

-- ---------------------------------------------------------------------------
-- master.holding_costs — Daily holding cost per SKU per warehouse
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS master.holding_costs (
    id              SERIAL PRIMARY KEY,
    sku_id          TEXT NOT NULL REFERENCES master.skus(sku_id),
    warehouse_id    TEXT NOT NULL REFERENCES master.warehouses(warehouse_id),
    daily_holding_cost NUMERIC(10,4) NOT NULL,   -- AED per unit per day
    UNIQUE (sku_id, warehouse_id)
);

-- ============================================================================
-- SCHEMA: inventory
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS inventory;

-- ---------------------------------------------------------------------------
-- inventory.stock_levels — Available, reserved, safety stock per SKU/warehouse
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory.stock_levels (
    id              SERIAL PRIMARY KEY,
    sku_id          TEXT NOT NULL REFERENCES master.skus(sku_id),
    warehouse_id    TEXT NOT NULL REFERENCES master.warehouses(warehouse_id),
    available_qty   INT NOT NULL DEFAULT 0,
    reserved_qty    INT NOT NULL DEFAULT 0,      -- allocated to pending orders
    safety_stock    INT NOT NULL DEFAULT 0,      -- minimum buffer
    inbound_qty     INT NOT NULL DEFAULT 0,      -- en-route from supplier
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (sku_id, warehouse_id)
);

-- ---------------------------------------------------------------------------
-- inventory.stock_age — Age buckets per SKU/warehouse
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory.stock_age (
    id              SERIAL PRIMARY KEY,
    sku_id          TEXT NOT NULL REFERENCES master.skus(sku_id),
    warehouse_id    TEXT NOT NULL REFERENCES master.warehouses(warehouse_id),
    age_bucket      TEXT NOT NULL,               -- '0-30' | '31-60' | '61-90' | '90+'
    qty             INT NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (sku_id, warehouse_id, age_bucket)
);

-- Trigger: NOTIFY on stock_levels change
CREATE OR REPLACE FUNCTION inventory.notify_stock_change()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify('sim_events',
        json_build_object(
            'type', 'inventory_changed',
            'sku_id', COALESCE(NEW.sku_id, OLD.sku_id),
            'warehouse_id', COALESCE(NEW.warehouse_id, OLD.warehouse_id),
            'timestamp', now()
        )::text
    );
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_notify_stock ON inventory.stock_levels;
CREATE TRIGGER tr_notify_stock
    AFTER INSERT OR UPDATE OR DELETE ON inventory.stock_levels
    FOR EACH ROW EXECUTE FUNCTION inventory.notify_stock_change();

-- ============================================================================
-- SCHEMA: sales
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS sales;

-- ---------------------------------------------------------------------------
-- sales.transactions — 90 days of historical sales
-- Intentionally includes: gaps, stockout periods, seasonal patterns
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales.transactions (
    transaction_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku_id          TEXT NOT NULL REFERENCES master.skus(sku_id),
    warehouse_id    TEXT NOT NULL REFERENCES master.warehouses(warehouse_id),
    txn_date        DATE NOT NULL,
    quantity        INT NOT NULL,
    unit_price      NUMERIC(10,2) NOT NULL,
    total_value     NUMERIC(10,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    buyer_id        TEXT,                        -- fictional B2B buyer
    is_stockout     BOOLEAN NOT NULL DEFAULT FALSE,  -- marks suppressed-sales periods
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_sku_wh_date
    ON sales.transactions (sku_id, warehouse_id, txn_date);
CREATE INDEX IF NOT EXISTS idx_sales_date
    ON sales.transactions (txn_date);

-- Trigger: NOTIFY on new sale
CREATE OR REPLACE FUNCTION sales.notify_new_sale()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify('sim_events',
        json_build_object(
            'type', 'sale_recorded',
            'sku_id', NEW.sku_id,
            'warehouse_id', NEW.warehouse_id,
            'quantity', NEW.quantity,
            'txn_date', NEW.txn_date,
            'timestamp', now()
        )::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_notify_sale ON sales.transactions;
CREATE TRIGGER tr_notify_sale
    AFTER INSERT ON sales.transactions
    FOR EACH ROW EXECUTE FUNCTION sales.notify_new_sale();

-- ============================================================================
-- SCHEMA: orders
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS orders;

-- ---------------------------------------------------------------------------
-- orders.inbound — Purchase orders from suppliers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders.inbound (
    po_id            TEXT PRIMARY KEY,           -- e.g. 'PO-2024-001'
    sku_id           TEXT NOT NULL REFERENCES master.skus(sku_id),
    warehouse_id     TEXT NOT NULL REFERENCES master.warehouses(warehouse_id),
    quantity         INT NOT NULL,
    supplier_id      TEXT,
    order_date       DATE NOT NULL,
    expected_date    DATE NOT NULL,              -- original ETA
    revised_date     DATE,                       -- updated ETA if disrupted
    status           TEXT NOT NULL DEFAULT 'pending',  -- pending | in_transit | received | delayed
    received_date    DATE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- orders.transfers — Inter-location transfer proposals + approval workflow
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders.transfers (
    transfer_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku_id           TEXT NOT NULL REFERENCES master.skus(sku_id),
    from_warehouse   TEXT NOT NULL REFERENCES master.warehouses(warehouse_id),
    to_warehouse     TEXT NOT NULL REFERENCES master.warehouses(warehouse_id),
    quantity         INT NOT NULL,
    transfer_cost    NUMERIC(10,2) NOT NULL,     -- total cost (qty * cost_per_unit)
    lead_time_days   INT NOT NULL,
    reason           TEXT,                       -- why this was recommended
    expected_benefit NUMERIC(10,2),              -- estimated savings / shortage avoided
    net_benefit      NUMERIC(10,2),              -- benefit - cost
    status           TEXT NOT NULL DEFAULT 'proposed', -- proposed | approved | rejected | in_transit | completed
    approved_by      TEXT,
    approved_at      TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transfers_status ON orders.transfers (status);

-- Trigger: NOTIFY on transfer status change
CREATE OR REPLACE FUNCTION orders.notify_transfer_change()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify('sim_events',
        json_build_object(
            'type', 'transfer_' || NEW.status,
            'transfer_id', NEW.transfer_id,
            'sku_id', NEW.sku_id,
            'from_warehouse', NEW.from_warehouse,
            'to_warehouse', NEW.to_warehouse,
            'quantity', NEW.quantity,
            'timestamp', now()
        )::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_notify_transfer ON orders.transfers;
CREATE TRIGGER tr_notify_transfer
    AFTER INSERT OR UPDATE OF status ON orders.transfers
    FOR EACH ROW EXECUTE FUNCTION orders.notify_transfer_change();

-- ============================================================================
-- SCHEMA: events
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS events;

-- ---------------------------------------------------------------------------
-- events.disruptions — Dated disruption signals (2 labelled scenarios)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events.disruptions (
    disruption_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    disruption_type  TEXT NOT NULL,              -- supply_shortage | shipping_delay
    title            TEXT NOT NULL,
    description      TEXT,
    affected_skus     TEXT[] NOT NULL,           -- array of SKU IDs (NOT all SKUs)
    affected_routes  TEXT[],                     -- array of 'DXB-SHJ' etc. (for shipping delays)
    start_date       DATE NOT NULL,
    end_date         DATE,                       -- NULL = ongoing
    severity         TEXT NOT NULL DEFAULT 'medium',  -- low | medium | high
    source           TEXT NOT NULL DEFAULT 'market_signal', -- market_signal | supplier_notice | logistics_alert
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger: NOTIFY on new disruption
CREATE OR REPLACE FUNCTION events.notify_disruption()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify('sim_events',
        json_build_object(
            'type', 'disruption_published',
            'disruption_type', NEW.disruption_type,
            'title', NEW.title,
            'affected_skus', NEW.affected_skus,
            'severity', NEW.severity,
            'start_date', NEW.start_date,
            'timestamp', now()
        )::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_notify_disruption ON events.disruptions;
CREATE TRIGGER tr_notify_disruption
    AFTER INSERT OR UPDATE OF is_active ON events.disruptions
    FOR EACH ROW EXECUTE FUNCTION events.notify_disruption();

-- ---------------------------------------------------------------------------
-- events.audit_log — Append-only simulation timeline
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events.audit_log (
    log_id           BIGSERIAL PRIMARY KEY,
    event_type       TEXT NOT NULL,              -- sale_recorded | inventory_changed | disruption_published | etc.
    event_data       JSONB NOT NULL,             -- full event payload
    sim_timestamp    DATE NOT NULL,              -- simulated date
    real_timestamp   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_sim_ts ON events.audit_log (sim_timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_type ON events.audit_log (event_type);

-- Trigger: NOTIFY on new audit log entry
CREATE OR REPLACE FUNCTION events.notify_audit()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify('sim_events',
        json_build_object(
            'type', NEW.event_type,
            'sim_date', NEW.sim_timestamp,
            'data', NEW.event_data,
            'timestamp', now()
        )::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_notify_audit ON events.audit_log;
CREATE TRIGGER tr_notify_audit
    AFTER INSERT ON events.audit_log
    FOR EACH ROW EXECUTE FUNCTION events.notify_audit();

-- ============================================================================
-- SCHEMA: simulator control table
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS simulator;

-- ---------------------------------------------------------------------------
-- simulator.state — Tracks simulation run state
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS simulator.state (
    id               INT PRIMARY KEY DEFAULT 1,  -- singleton row
    status           TEXT NOT NULL DEFAULT 'idle',  -- idle | running | paused
    scenario_name    TEXT,
    sim_clock        DATE,                       -- current simulated date
    sim_start_date   DATE,                       -- when the 90-day history ends / planning begins
    speed_multiplier INT NOT NULL DEFAULT 1,     -- 1 real sec = N sim hours
    started_at       TIMESTAMPTZ,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO simulator.state (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Done. Schema ready for seeding.
-- ============================================================================
