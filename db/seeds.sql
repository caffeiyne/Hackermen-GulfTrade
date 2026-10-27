-- ============================================================================
-- Seed Data: Static reference + initial inventory state
-- Run AFTER schema.sql
-- ============================================================================

-- ============================================================================
-- master.warehouses — 3 UAE locations
-- ============================================================================
INSERT INTO master.warehouses (warehouse_id, name, city, latitude, longitude, capacity_units) VALUES
    ('DXB', 'Dubai Distribution Center',    'Dubai',      25.2048, 55.2708, 20000),
    ('AUH', 'Abu Dhabi Warehouse',          'Abu Dhabi',  24.4539, 54.3773, 15000),
    ('SHJ', 'Sharjah Logistics Hub',        'Sharjah',    25.3463, 55.4209, 12000)
ON CONFLICT (warehouse_id) DO NOTHING;

-- ============================================================================
-- master.skus — 20 SKUs across 5 product types (4 each)
-- Product types: charger, cable, power_bank, earbuds, mouse
-- ============================================================================
INSERT INTO master.skus (sku_id, name, product_type, unit_cost, unit_price, shelf_life_days, supplier_id, supplier_lead_days) VALUES
    -- USB-C Chargers (the case study's featured product type)
    ('CHG-UC-001', 'USB-C Fast Charger 20W',        'charger',    18.00, 35.00, 730, 'SUP-CHG-01', 14),
    ('CHG-UC-002', 'USB-C Wall Charger 30W',        'charger',    22.00, 42.00, 730, 'SUP-CHG-01', 14),
    ('CHG-UC-003', 'USB-C GaN Charger 65W',         'charger',    38.00, 75.00, 730, 'SUP-CHG-02', 21),
    ('CHG-UC-004', 'USB-C Car Charger Dual Port',   'charger',    12.00, 25.00, 730, 'SUP-CHG-01', 14),
    -- Lightning / USB-C Cables
    ('CAB-LT-001', 'Lightning Cable 1m',             'cable',      4.50,  12.00, 1095, 'SUP-CAB-01', 10),
    ('CAB-LT-002', 'Lightning Braided Cable 2m',     'cable',      7.00,  18.00, 1095, 'SUP-CAB-01', 10),
    ('CAB-UC-001', 'USB-C to USB-C Cable 1m',        'cable',      5.00,  14.00, 1095, 'SUP-CAB-02', 12),
    ('CAB-UC-002', 'USB-C to Lightning Cable 2m',    'cable',      6.50,  16.00, 1095, 'SUP-CAB-01', 10),
    -- Power Banks
    ('PWB-001',    'Power Bank 10000mAh',           'power_bank', 28.00, 55.00, 730, 'SUP-PWB-01', 18),
    ('PWB-002',    'Power Bank 20000mAh PD',        'power_bank', 42.00, 85.00, 730, 'SUP-PWB-01', 18),
    ('PWB-003',    'Power Bank 5000mAh Mini',       'power_bank', 15.00, 30.00, 730, 'SUP-PWB-02', 12),
    ('PWB-004',    'Power Bank 30000mAh Solar',     'power_bank', 55.00, 110.00, 730, 'SUP-PWB-01', 21),
    -- Wireless Earbuds
    ('EAR-001',    'Wireless Earbuds Pro',           'earbuds',    45.00, 95.00,  730, 'SUP-EAR-01', 21),
    ('EAR-002',    'Wireless Earbuds Basic',         'earbuds',    25.00, 50.00,  730, 'SUP-EAR-01', 21),
    ('EAR-003',    'Wireless Earbuds Sport',         'earbuds',    35.00, 70.00,  730, 'SUP-EAR-02', 18),
    ('EAR-004',    'Wireless Earbuds ANC',           'earbuds',    65.00, 130.00, 730, 'SUP-EAR-02', 24),
    -- Bluetooth Mice
    ('MOU-001',    'Bluetooth Mouse Ergonomic',      'mouse',      22.00, 45.00, 1095, 'SUP-MOU-01', 14),
    ('MOU-002',    'Bluetooth Mouse Compact',        'mouse',      15.00, 32.00, 1095, 'SUP-MOU-01', 14),
    ('MOU-003',    'Bluetooth Mouse Silent',         'mouse',      28.00, 55.00, 1095, 'SUP-MOU-02', 18),
    ('MOU-004',    'Bluetooth Mouse Gaming',         'mouse',      48.00, 95.00, 1095, 'SUP-MOU-02', 21)
ON CONFLICT (sku_id) DO NOTHING;

-- ============================================================================
-- master.transfer_matrix — Inter-location transfer costs + lead times
-- Note: Includes one deliberately expensive route (AUH->SHJ) for the
--       "economically unattractive transfer" test case.
-- ============================================================================
INSERT INTO master.transfer_matrix (from_warehouse, to_warehouse, cost_per_unit, lead_time_days, route_name) VALUES
    -- Dubai <-> Abu Dhabi (efficient highway corridor)
    ('DXB', 'AUH', 1.50,  1, 'DXB-AUH Highway Express'),
    ('AUH', 'DXB', 1.50,  1, 'AUH-DXB Highway Express'),
    -- Dubai <-> Sharjah (very close, cheap)
    ('DXB', 'SHJ', 0.80,  1, 'DXB-SHJ Local Route'),
    ('SHJ', 'DXB', 0.80,  1, 'SHJ-DXB Local Route'),
    -- Abu Dhabi <-> Sharjah (longer route, deliberately expensive)
    ('AUH', 'SHJ', 3.20,  2, 'AUH-SHJ Cross-Emirate'),
    ('SHJ', 'AUH', 3.20,  2, 'SHJ-AUH Cross-Emirate')
ON CONFLICT (from_warehouse, to_warehouse) DO NOTHING;

-- ============================================================================
-- master.holding_costs — Daily holding cost per SKU per warehouse
-- Holding cost ≈ 0.5% of unit_cost per day (warehousing + capital cost)
-- DXB is slightly cheaper (large DC), SHJ mid, AUH slightly higher
-- ============================================================================
INSERT INTO master.holding_costs (sku_id, warehouse_id, daily_holding_cost)
SELECT
    s.sku_id,
    w.warehouse_id,
    CASE w.warehouse_id
        WHEN 'DXB' THEN ROUND((s.unit_cost * 0.0040)::numeric, 4)
        WHEN 'SHJ' THEN ROUND((s.unit_cost * 0.0050)::numeric, 4)
        WHEN 'AUH' THEN ROUND((s.unit_cost * 0.0055)::numeric, 4)
    END
FROM master.skus s
CROSS JOIN master.warehouses w
ON CONFLICT (sku_id, warehouse_id) DO NOTHING;

-- ============================================================================
-- inventory.stock_levels — Initial state matching the case study demo
--
-- Key scenario from the case study:
--   USB-C chargers: Dubai has 500 (excess), Abu Dhabi has 100 (shortage risk),
--   Sharjah has 300 (moderate).
--   Forecast: Dubai 200, Abu Dhabi 350, Sharjah 150 for next 30 days.
-- ============================================================================
INSERT INTO inventory.stock_levels (sku_id, warehouse_id, available_qty, reserved_qty, safety_stock, inbound_qty)
SELECT
    s.sku_id,
    w.warehouse_id,
    -- Base quantities with warehouse-specific distribution
    CASE
        -- Featured scenario: USB-C chargers
        WHEN s.sku_id = 'CHG-UC-001' AND w.warehouse_id = 'DXB' THEN 500   -- excess (case study)
        WHEN s.sku_id = 'CHG-UC-001' AND w.warehouse_id = 'AUH' THEN 100   -- shortage risk (case study)
        WHEN s.sku_id = 'CHG-UC-001' AND w.warehouse_id = 'SHJ' THEN 300   -- moderate (case study)
        -- Other chargers: similar pattern but less extreme
        WHEN s.sku_id = 'CHG-UC-002' AND w.warehouse_id = 'DXB' THEN 320
        WHEN s.sku_id = 'CHG-UC-002' AND w.warehouse_id = 'AUH' THEN 80
        WHEN s.sku_id = 'CHG-UC-002' AND w.warehouse_id = 'SHJ' THEN 180
        WHEN s.sku_id = 'CHG-UC-003' AND w.warehouse_id = 'DXB' THEN 150
        WHEN s.sku_id = 'CHG-UC-003' AND w.warehouse_id = 'AUH' THEN 60
        WHEN s.sku_id = 'CHG-UC-003' AND w.warehouse_id = 'SHJ' THEN 90
        WHEN s.sku_id = 'CHG-UC-004' AND w.warehouse_id = 'DXB' THEN 400
        WHEN s.sku_id = 'CHG-UC-004' AND w.warehouse_id = 'AUH' THEN 120
        WHEN s.sku_id = 'CHG-UC-004' AND w.warehouse_id = 'SHJ' THEN 200
        -- Cables
        WHEN s.product_type = 'cable' AND w.warehouse_id = 'DXB' THEN 250
        WHEN s.product_type = 'cable' AND w.warehouse_id = 'AUH' THEN 90
        WHEN s.product_type = 'cable' AND w.warehouse_id = 'SHJ' THEN 140
        -- Power banks
        WHEN s.product_type = 'power_bank' AND w.warehouse_id = 'DXB' THEN 120
        WHEN s.product_type = 'power_bank' AND w.warehouse_id = 'AUH' THEN 45
        WHEN s.product_type = 'power_bank' AND w.warehouse_id = 'SHJ' THEN 70
        -- Earbuds
        WHEN s.product_type = 'earbuds' AND w.warehouse_id = 'DXB' THEN 90
        WHEN s.product_type = 'earbuds' AND w.warehouse_id = 'AUH' THEN 30
        WHEN s.product_type = 'earbuds' AND w.warehouse_id = 'SHJ' THEN 50
        -- Mice
        WHEN s.product_type = 'mouse' AND w.warehouse_id = 'DXB' THEN 110
        WHEN s.product_type = 'mouse' AND w.warehouse_id = 'AUH' THEN 40
        WHEN s.product_type = 'mouse' AND w.warehouse_id = 'SHJ' THEN 60
    END AS available_qty,
    -- Reserved quantities (some stock already allocated)
    CASE
        WHEN s.sku_id = 'CHG-UC-001' AND w.warehouse_id = 'DXB' THEN 50
        WHEN s.sku_id = 'CHG-UC-001' AND w.warehouse_id = 'AUH' THEN 20
        WHEN s.sku_id = 'CHG-UC-001' AND w.warehouse_id = 'SHJ' THEN 30
        ELSE 0
    END AS reserved_qty,
    -- Safety stock (minimum buffer — varies by SKU value)
    CASE
        WHEN s.unit_cost < 10  THEN 30
        WHEN s.unit_cost < 25  THEN 50
        WHEN s.unit_cost < 50  THEN 40
        ELSE 25
    END AS safety_stock,
    -- Inbound qty (en-route from supplier)
    CASE
        WHEN s.sku_id = 'CHG-UC-001' AND w.warehouse_id = 'AUH' THEN 200   -- PO arriving soon
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

-- ============================================================================
-- inventory.stock_age — Age buckets per SKU/warehouse
-- Dubai has some ageing stock (older products sitting unsold)
-- ============================================================================
INSERT INTO inventory.stock_age (sku_id, warehouse_id, age_bucket, qty)
-- Dubai ageing stock (case study: older products remain unsold)
SELECT 'CHG-UC-001', 'DXB', '0-30', 150 WHERE NOT EXISTS (SELECT 1 FROM inventory.stock_age WHERE sku_id='CHG-UC-001' AND warehouse_id='DXB' AND age_bucket='0-30')
UNION ALL SELECT 'CHG-UC-001', 'DXB', '31-60', 200 WHERE NOT EXISTS (SELECT 1 FROM inventory.stock_age WHERE sku_id='CHG-UC-001' AND warehouse_id='DXB' AND age_bucket='31-60')
UNION ALL SELECT 'CHG-UC-001', 'DXB', '61-90', 120 WHERE NOT EXISTS (SELECT 1 FROM inventory.stock_age WHERE sku_id='CHG-UC-001' AND warehouse_id='DXB' AND age_bucket='61-90')
UNION ALL SELECT 'CHG-UC-001', 'DXB', '90+', 30 WHERE NOT EXISTS (SELECT 1 FROM inventory.stock_age WHERE sku_id='CHG-UC-001' AND warehouse_id='DXB' AND age_bucket='90+')
-- Other Dubai ageing
UNION ALL SELECT 'CHG-UC-004', 'DXB', '0-30', 200 WHERE NOT EXISTS (SELECT 1 FROM inventory.stock_age WHERE sku_id='CHG-UC-004' AND warehouse_id='DXB' AND age_bucket='0-30')
UNION ALL SELECT 'CHG-UC-004', 'DXB', '31-60', 150 WHERE NOT EXISTS (SELECT 1 FROM inventory.stock_age WHERE sku_id='CHG-UC-004' AND warehouse_id='DXB' AND age_bucket='31-60')
UNION ALL SELECT 'CHG-UC-004', 'DXB', '61-90', 50 WHERE NOT EXISTS (SELECT 1 FROM inventory.stock_age WHERE sku_id='CHG-UC-004' AND warehouse_id='DXB' AND age_bucket='61-90')
-- Abu Dhabi (fresher stock but low)
UNION ALL SELECT 'CHG-UC-001', 'AUH', '0-30', 80 WHERE NOT EXISTS (SELECT 1 FROM inventory.stock_age WHERE sku_id='CHG-UC-001' AND warehouse_id='AUH' AND age_bucket='0-30')
UNION ALL SELECT 'CHG-UC-001', 'AUH', '31-60', 20 WHERE NOT EXISTS (SELECT 1 FROM inventory.stock_age WHERE sku_id='CHG-UC-001' AND warehouse_id='AUH' AND age_bucket='31-60')
-- Sharjah moderate
UNION ALL SELECT 'CHG-UC-001', 'SHJ', '0-30', 180 WHERE NOT EXISTS (SELECT 1 FROM inventory.stock_age WHERE sku_id='CHG-UC-001' AND warehouse_id='SHJ' AND age_bucket='0-30')
UNION ALL SELECT 'CHG-UC-001', 'SHJ', '31-60', 90 WHERE NOT EXISTS (SELECT 1 FROM inventory.stock_age WHERE sku_id='CHG-UC-001' AND warehouse_id='SHJ' AND age_bucket='31-60')
UNION ALL SELECT 'CHG-UC-001', 'SHJ', '61-90', 30 WHERE NOT EXISTS (SELECT 1 FROM inventory.stock_age WHERE sku_id='CHG-UC-001' AND warehouse_id='SHJ' AND age_bucket='61-90');

-- ============================================================================
-- orders.inbound — Active purchase orders
-- ============================================================================
INSERT INTO orders.inbound (po_id, sku_id, warehouse_id, quantity, supplier_id, order_date, expected_date, revised_date, status) VALUES
    ('PO-2024-001', 'CHG-UC-001', 'AUH', 200, 'SUP-CHG-01', '2024-10-01', '2024-10-15', NULL, 'in_transit'),
    ('PO-2024-002', 'CHG-UC-003', 'DXB', 80,  'SUP-CHG-02', '2024-10-05', '2024-10-26', NULL, 'in_transit'),
    ('PO-2024-003', 'PWB-002',    'DXB', 40,  'SUP-PWB-01', '2024-10-10', '2024-10-28', NULL, 'in_transit'),
    ('PO-2024-004', 'EAR-001',    'AUH', 30,  'SUP-EAR-01', '2024-10-12', '2024-11-02', NULL, 'pending'),
    ('PO-2024-005', 'CAB-LT-001', 'SHJ', 200, 'SUP-CAB-01', '2024-10-14', '2024-10-24', NULL, 'in_transit'),
    ('PO-2024-006', 'MOU-001',    'AUH', 50,  'SUP-MOU-01', '2024-10-18', '2024-11-01', NULL, 'pending')
ON CONFLICT (po_id) DO NOTHING;

-- ============================================================================
-- Done. Static seed data complete.
-- Next: Run generate_sales.py to create 90 days of sales history.
-- ============================================================================
