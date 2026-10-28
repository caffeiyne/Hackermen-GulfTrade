-- ============================================================================
-- Disruption Seed Data: Two labelled scenarios from the case study
-- Run AFTER seeds.sql
--
-- Scenario A: Component-related supply shortage (semiconductor)
--   Affects specific charger SKUs that use the constrained component.
--   Does NOT affect all products.
--
-- Scenario B: Shipping-route delay
--   Affects the DXB-SHJ transfer corridor (and inbound shipments via that route).
-- ============================================================================

-- The simulation start date is set to 2024-10-27 (the "today" of the scenario).
-- Disruptions start during the 30-day planning window.

-- ---------------------------------------------------------------------------
-- Scenario A: Semiconductor supply constraint
-- Affects chargers that use a specific GaN/semiconductor component.
-- Specifically: CHG-UC-003 (GaN 65W) and CHG-UC-002 (30W) use the component.
-- CHG-UC-001 (20W basic) and CHG-UC-004 (car charger) are NOT affected.
-- ---------------------------------------------------------------------------
INSERT INTO events.disruptions (disruption_type, title, description, affected_skus, affected_routes, start_date, end_date, severity, source, is_active)
VALUES (
    'supply_shortage',
    'Semiconductor Supply Constraint — GaN Components',
    'A market signal indicates that semiconductor suppliers are facing production constraints for GaN (gallium nitride) power ICs. This specifically affects chargers using GaN technology (65W and 30W models). Standard 20W chargers and car chargers do not use GaN components and are NOT affected. Replenishment lead times for affected SKUs may extend by 7-14 days.',
    ARRAY['CHG-UC-003', 'CHG-UC-002'],          -- only GaN-based chargers
    NULL,                                         -- no route impact
    '2024-11-05',                                 -- starts during planning window
    '2024-11-20',                                 -- expected to resolve
    'high',
    'market_signal',
    TRUE
)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Scenario B: Shipping-route delay on DXB-SHJ corridor
-- Affects transfers between Dubai and Sharjah and inbound shipments on that route.
-- Does NOT affect DXB-AUH or AUH-SHJ routes.
-- ---------------------------------------------------------------------------
INSERT INTO events.disruptions (disruption_type, title, description, affected_skus, affected_routes, start_date, end_date, severity, source, is_active)
VALUES (
    'shipping_delay',
    'Logistics Disruption — DXB-SHJ Route Delay',
    'A logistics alert indicates that road construction and customs processing changes are causing delays on the Dubai-Sharjah transfer corridor. Shipments on this route may experience 2-3 additional days of transit time. Routes between Dubai-Abu Dhabi and Abu Dhabi-Sharjah are NOT affected. ',
    ARRAY[]::text[],                                   -- route signal only: no SKU is asserted to be affected
    ARRAY['DXB-SHJ', 'SHJ-DXB'],                       -- only the DXB-SHJ corridor
    '2024-11-10',
    '2024-11-25',
    'medium',
    'logistics_alert',
    TRUE
)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Note: The simulator engine will activate these disruptions at the
-- appropriate sim_clock date during the scenario run.
-- They are seeded as is_active=TRUE but the simulator.state.sim_clock
-- starts at 2024-10-27, so they will "trigger" when the clock reaches
-- their start_date.
-- ---------------------------------------------------------------------------

-- ============================================================================
-- Done. Disruption seeds complete.
-- ============================================================================
