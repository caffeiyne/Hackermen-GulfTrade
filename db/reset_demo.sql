-- ============================================================================
-- Reset Demo Data — clears all simulation-generated data and restores
-- the initial case-study state so recommendations show up again.
--
-- Run AFTER schema.sql and seeds.sql have been applied at least once.
-- Safe to re-run any time before a demo.
-- ============================================================================

BEGIN;

-- Clear simulation-generated transactional data
DELETE FROM sales.transactions;
DELETE FROM orders.transfers;
DELETE FROM events.disruptions;
DELETE FROM events.audit_log;

-- Reset stock_age to initial seed state
DELETE FROM inventory.stock_age;

-- Reset simulator state to idle
UPDATE simulator.state
SET status           = 'idle',
    sim_clock        = sim_start_date,
    scenario_name    = NULL,
    speed_multiplier = 1,
    started_at       = NULL,
    updated_at       = now()
WHERE id = 1;

COMMIT;

-- ============================================================================
-- Re-seed stock_levels (upsert — restores initial quantities)
-- This mirrors the seeds.sql logic but uses DO UPDATE so existing rows
-- are overwritten with the original demo values.
-- ============================================================================
INSERT INTO inventory.stock_levels (sku_id, warehouse_id, available_qty, reserved_qty, safety_stock, inbound_qty)
SELECT
    s.sku_id,
    w.warehouse_id,
    CASE
        -- Featured scenario: USB-C chargers
        WHEN s.sku_id = 'CHG-UC-001' AND w.warehouse_id = 'DXB' THEN 500
        WHEN s.sku_id = 'CHG-UC-001' AND w.warehouse_id = 'AUH' THEN 100
        WHEN s.sku_id = 'CHG-UC-001' AND w.warehouse_id = 'SHJ' THEN 300
        WHEN s.sku_id = 'CHG-UC-002' AND w.warehouse_id = 'DXB' THEN 320
        WHEN s.sku_id = 'CHG-UC-002' AND w.warehouse_id = 'AUH' THEN 80
        WHEN s.sku_id = 'CHG-UC-002' AND w.warehouse_id = 'SHJ' THEN 180
        WHEN s.sku_id = 'CHG-UC-003' AND w.warehouse_id = 'DXB' THEN 150
        WHEN s.sku_id = 'CHG-UC-003' AND w.warehouse_id = 'AUH' THEN 60
        WHEN s.sku_id = 'CHG-UC-003' AND w.warehouse_id = 'SHJ' THEN 90
        WHEN s.sku_id = 'CHG-UC-004' AND w.warehouse_id = 'DXB' THEN 400
        WHEN s.sku_id = 'CHG-UC-004' AND w.warehouse_id = 'AUH' THEN 120
        WHEN s.sku_id = 'CHG-UC-004' AND w.warehouse_id = 'SHJ' THEN 200
        WHEN s.product_type = 'cable'     AND w.warehouse_id = 'DXB' THEN 250
        WHEN s.product_type = 'cable'     AND w.warehouse_id = 'AUH' THEN 90
        WHEN s.product_type = 'cable'     AND w.warehouse_id = 'SHJ' THEN 140
        WHEN s.product_type = 'power_bank' AND w.warehouse_id = 'DXB' THEN 120
        WHEN s.product_type = 'power_bank' AND w.warehouse_id = 'AUH' THEN 45
        WHEN s.product_type = 'power_bank' AND w.warehouse_id = 'SHJ' THEN 70
        WHEN s.product_type = 'earbuds'   AND w.warehouse_id = 'DXB' THEN 90
        WHEN s.product_type = 'earbuds'   AND w.warehouse_id = 'AUH' THEN 30
        WHEN s.product_type = 'earbuds'   AND w.warehouse_id = 'SHJ' THEN 50
        WHEN s.product_type = 'mouse'     AND w.warehouse_id = 'DXB' THEN 110
        WHEN s.product_type = 'mouse'     AND w.warehouse_id = 'AUH' THEN 40
        WHEN s.product_type = 'mouse'     AND w.warehouse_id = 'SHJ' THEN 60
    END AS available_qty,
    CASE
        WHEN s.sku_id = 'CHG-UC-001' AND w.warehouse_id = 'DXB' THEN 50
        WHEN s.sku_id = 'CHG-UC-001' AND w.warehouse_id = 'AUH' THEN 20
        WHEN s.sku_id = 'CHG-UC-001' AND w.warehouse_id = 'SHJ' THEN 30
        ELSE 0
    END AS reserved_qty,
    CASE
        WHEN s.unit_cost < 10  THEN 30
        WHEN s.unit_cost < 25  THEN 50
        WHEN s.unit_cost < 50  THEN 40
        ELSE 25
    END AS safety_stock,
    CASE
        WHEN s.sku_id = 'CHG-UC-001' AND w.warehouse_id = 'AUH' THEN 200
        WHEN s.sku_id = 'CHG-UC-003' AND w.warehouse_id = 'DXB' THEN 80
        WHEN s.sku_id = 'PWB-002'    AND w.warehouse_id = 'DXB' THEN 40
        ELSE 0
    END AS inbound_qty
FROM master.skus s
CROSS JOIN master.warehouses w
ON CONFLICT (sku_id, warehouse_id) DO UPDATE
SET available_qty = EXCLUDED.available_qty,
    reserved_qty  = EXCLUDED.reserved_qty,
    safety_stock  = EXCLUDED.safety_stock,
    inbound_qty   = EXCLUDED.inbound_qty;

-- Re-seed stock_age
INSERT INTO inventory.stock_age (sku_id, warehouse_id, age_bucket, qty)
SELECT 'CHG-UC-001', 'DXB', '0-30', 150
UNION ALL SELECT 'CHG-UC-001', 'DXB', '31-60', 200
UNION ALL SELECT 'CHG-UC-001', 'DXB', '61-90', 120
UNION ALL SELECT 'CHG-UC-001', 'DXB', '90+', 30
UNION ALL SELECT 'CHG-UC-004', 'DXB', '0-30', 200
UNION ALL SELECT 'CHG-UC-004', 'DXB', '31-60', 150
UNION ALL SELECT 'CHG-UC-004', 'DXB', '61-90', 50
UNION ALL SELECT 'CHG-UC-001', 'AUH', '0-30', 80
UNION ALL SELECT 'CHG-UC-001', 'AUH', '31-60', 20
UNION ALL SELECT 'CHG-UC-001', 'SHJ', '0-30', 180
UNION ALL SELECT 'CHG-UC-001', 'SHJ', '31-60', 90
UNION ALL SELECT 'CHG-UC-001', 'SHJ', '61-90', 30
ON CONFLICT (sku_id, warehouse_id, age_bucket) DO UPDATE
SET qty = EXCLUDED.qty;

-- Re-seed inbound POs
INSERT INTO orders.inbound (po_id, sku_id, warehouse_id, quantity, supplier_id, order_date, expected_date, revised_date, status)
VALUES
    ('PO-2024-001', 'CHG-UC-001', 'AUH', 200, 'SUP-CHG-01', '2024-10-01', '2024-10-15', NULL, 'in_transit'),
    ('PO-2024-002', 'CHG-UC-003', 'DXB', 80,  'SUP-CHG-02', '2024-10-05', '2024-10-26', NULL, 'in_transit'),
    ('PO-2024-003', 'PWB-002',    'DXB', 40,  'SUP-PWB-01', '2024-10-10', '2024-10-28', NULL, 'in_transit')
ON CONFLICT (po_id) DO UPDATE
SET quantity = EXCLUDED.quantity,
    status = EXCLUDED.status,
    revised_date = EXCLUDED.revised_date;
