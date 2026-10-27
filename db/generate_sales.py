"""
Sales History Generator — Creates 90 days of fictional sales transactions.

Embeds intentional data quality issues required by the case study:
  - Seasonality (weekday vs weekend, weekly trends)
  - Stockout periods (Abu Dhabi USB-C chargers have suppressed sales)
  - Missing observations (random gaps in data)
  - Varying demand patterns across warehouses and SKUs

Usage:
    python generate_sales.py --db-url "postgresql://user:pass@host:5432/dbname"

Or set DATABASE_URL env var and run without args.
"""

import argparse
import asyncio
import os
import random
import uuid
from datetime import date, timedelta

import asyncpg

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SIM_START_DATE = date(2024, 10, 27)          # "today" in the simulation
HISTORY_DAYS = 90                             # 90 days of history
HISTORY_END = SIM_START_DATE - timedelta(days=1)  # last day of history
HISTORY_START = HISTORY_END - timedelta(days=89)   # first day

# Seeded RNG for reproducibility
RNG_SEED = 42
random.seed(RNG_SEED)

# ---------------------------------------------------------------------------
# Demand profiles per SKU per warehouse
# Base daily demand + noise + trend
# Key: (sku_id, warehouse_id) -> (base_daily, weekend_multiplier, trend_per_day)
# The case study says:
#   USB-C chargers forecast: Dubai 200, Abu Dhabi 350, Sharjah 150 for 30 days
#   So daily: Dubai ~6.7, Abu Dhabi ~11.7, Sharjah ~5.0
# But Abu Dhabi had STOCKOUTS so observed sales are suppressed.
# ---------------------------------------------------------------------------
DEMAND_PROFILES = {
    # Chargers
    ("CHG-UC-001", "DXB"): {"base": 7,  "weekend_mult": 0.6, "trend": 0.01},   # ~200/30d
    ("CHG-UC-001", "AUH"): {"base": 12, "weekend_mult": 0.5, "trend": 0.02},   # ~350/30d but stockouts suppress
    ("CHG-UC-001", "SHJ"): {"base": 5,  "weekend_mult": 0.7, "trend": 0.01},   # ~150/30d

    ("CHG-UC-002", "DXB"): {"base": 4,  "weekend_mult": 0.6, "trend": 0.005},
    ("CHG-UC-002", "AUH"): {"base": 6,  "weekend_mult": 0.5, "trend": 0.01},
    ("CHG-UC-002", "SHJ"): {"base": 3,  "weekend_mult": 0.7, "trend": 0.005},

    ("CHG-UC-003", "DXB"): {"base": 2,  "weekend_mult": 0.5, "trend": 0.0},
    ("CHG-UC-003", "AUH"): {"base": 3,  "weekend_mult": 0.5, "trend": 0.005},
    ("CHG-UC-003", "SHJ"): {"base": 2,  "weekend_mult": 0.6, "trend": 0.0},

    ("CHG-UC-004", "DXB"): {"base": 5,  "weekend_mult": 0.7, "trend": 0.005},
    ("CHG-UC-004", "AUH"): {"base": 4,  "weekend_mult": 0.6, "trend": 0.005},
    ("CHG-UC-004", "SHJ"): {"base": 3,  "weekend_mult": 0.7, "trend": 0.005},

    # Cables
    ("CAB-LT-001", "DXB"): {"base": 10, "weekend_mult": 0.5, "trend": 0.01},
    ("CAB-LT-001", "AUH"): {"base": 7,  "weekend_mult": 0.5, "trend": 0.01},
    ("CAB-LT-001", "SHJ"): {"base": 5,  "weekend_mult": 0.6, "trend": 0.005},
    ("CAB-LT-002", "DXB"): {"base": 6,  "weekend_mult": 0.5, "trend": 0.005},
    ("CAB-LT-002", "AUH"): {"base": 4,  "weekend_mult": 0.5, "trend": 0.005},
    ("CAB-LT-002", "SHJ"): {"base": 3,  "weekend_mult": 0.6, "trend": 0.0},
    ("CAB-UC-001", "DXB"): {"base": 8,  "weekend_mult": 0.5, "trend": 0.01},
    ("CAB-UC-001", "AUH"): {"base": 5,  "weekend_mult": 0.5, "trend": 0.005},
    ("CAB-UC-001", "SHJ"): {"base": 4,  "weekend_mult": 0.6, "trend": 0.005},
    ("CAB-UC-002", "DXB"): {"base": 5,  "weekend_mult": 0.5, "trend": 0.005},
    ("CAB-UC-002", "AUH"): {"base": 3,  "weekend_mult": 0.5, "trend": 0.005},
    ("CAB-UC-002", "SHJ"): {"base": 2,  "weekend_mult": 0.6, "trend": 0.0},

    # Power banks
    ("PWB-001", "DXB"): {"base": 3,  "weekend_mult": 0.6, "trend": 0.005},
    ("PWB-001", "AUH"): {"base": 2,  "weekend_mult": 0.6, "trend": 0.0},
    ("PWB-001", "SHJ"): {"base": 2,  "weekend_mult": 0.6, "trend": 0.0},
    ("PWB-002", "DXB"): {"base": 2,  "weekend_mult": 0.5, "trend": 0.005},
    ("PWB-002", "AUH"): {"base": 1,  "weekend_mult": 0.5, "trend": 0.0},
    ("PWB-002", "SHJ"): {"base": 1,  "weekend_mult": 0.5, "trend": 0.0},
    ("PWB-003", "DXB"): {"base": 6,  "weekend_mult": 0.6, "trend": 0.01},
    ("PWB-003", "AUH"): {"base": 4,  "weekend_mult": 0.6, "trend": 0.005},
    ("PWB-003", "SHJ"): {"base": 3,  "weekend_mult": 0.6, "trend": 0.005},
    ("PWB-004", "DXB"): {"base": 1,  "weekend_mult": 0.5, "trend": 0.0},
    ("PWB-004", "AUH"): {"base": 1,  "weekend_mult": 0.5, "trend": 0.0},
    ("PWB-004", "SHJ"): {"base": 1,  "weekend_mult": 0.5, "trend": 0.0},

    # Earbuds
    ("EAR-001", "DXB"): {"base": 2,  "weekend_mult": 0.5, "trend": 0.005},
    ("EAR-001", "AUH"): {"base": 1,  "weekend_mult": 0.5, "trend": 0.0},
    ("EAR-001", "SHJ"): {"base": 1,  "weekend_mult": 0.5, "trend": 0.0},
    ("EAR-002", "DXB"): {"base": 4,  "weekend_mult": 0.6, "trend": 0.005},
    ("EAR-002", "AUH"): {"base": 2,  "weekend_mult": 0.6, "trend": 0.0},
    ("EAR-002", "SHJ"): {"base": 2,  "weekend_mult": 0.6, "trend": 0.0},
    ("EAR-003", "DXB"): {"base": 3,  "weekend_mult": 0.5, "trend": 0.005},
    ("EAR-003", "AUH"): {"base": 2,  "weekend_mult": 0.5, "trend": 0.0},
    ("EAR-003", "SHJ"): {"base": 1,  "weekend_mult": 0.5, "trend": 0.0},
    ("EAR-004", "DXB"): {"base": 1,  "weekend_mult": 0.5, "trend": 0.0},
    ("EAR-004", "AUH"): {"base": 1,  "weekend_mult": 0.5, "trend": 0.0},
    ("EAR-004", "SHJ"): {"base": 1,  "weekend_mult": 0.5, "trend": 0.0},

    # Mice
    ("MOU-001", "DXB"): {"base": 3,  "weekend_mult": 0.6, "trend": 0.005},
    ("MOU-001", "AUH"): {"base": 2,  "weekend_mult": 0.6, "trend": 0.0},
    ("MOU-001", "SHJ"): {"base": 2,  "weekend_mult": 0.6, "trend": 0.0},
    ("MOU-002", "DXB"): {"base": 5,  "weekend_mult": 0.6, "trend": 0.005},
    ("MOU-002", "AUH"): {"base": 3,  "weekend_mult": 0.6, "trend": 0.005},
    ("MOU-002", "SHJ"): {"base": 2,  "weekend_mult": 0.6, "trend": 0.0},
    ("MOU-003", "DXB"): {"base": 2,  "weekend_mult": 0.5, "trend": 0.005},
    ("MOU-003", "AUH"): {"base": 1,  "weekend_mult": 0.5, "trend": 0.0},
    ("MOU-003", "SHJ"): {"base": 1,  "weekend_mult": 0.5, "trend": 0.0},
    ("MOU-004", "DXB"): {"base": 1,  "weekend_mult": 0.5, "trend": 0.0},
    ("MOU-004", "AUH"): {"base": 1,  "weekend_mult": 0.5, "trend": 0.0},
    ("MOU-004", "SHJ"): {"base": 1,  "weekend_mult": 0.5, "trend": 0.0},
}

# Stockout periods: (sku_id, warehouse_id, start_offset, end_offset)
# offset = days from HISTORY_START
# These create "suppressed sales" — observed demand is artificially low.
STOCKOUT_PERIODS = [
    # Abu Dhabi USB-C charger stockout: days 45-60 (mid-history)
    # This is why AUH observed sales look low but true demand is ~350/30d
    ("CHG-UC-001", "AUH", 45, 62),
    # Abu Dhabi earbuds stockout: days 70-80
    ("EAR-001", "AUH", 70, 80),
    # Sharjah power bank brief stockout: days 55-60
    ("PWB-003", "SHJ", 55, 60),
]

# Missing observation dates (entire days with no data at all — data gaps)
# ~3% of days will have gaps for certain SKU/warehouse combos
MISSING_DATA_PROBABILITY = 0.03

# Fictional buyer IDs
BUYER_IDS = [f"BUY-{i:04d}" for i in range(1, 21)]


def is_weekend(d: date) -> bool:
    """Friday-Saturday weekend in UAE."""
    return d.weekday() in (4, 5)  # Fri=4, Sat=5


def in_stockout(sku_id: str, warehouse_id: str, day_offset: int) -> bool:
    """Check if this SKU/warehouse is in a stockout period on this day."""
    for s_sku, s_wh, start, end in STOCKOUT_PERIODS:
        if sku_id == s_sku and warehouse_id == s_wh and start <= day_offset <= end:
            return True
    return False


def generate_quantity(profile: dict, current_date: date, day_index: int) -> int:
    """Generate a realistic daily quantity for a SKU/warehouse."""
    base = profile["base"]
    weekend_mult = profile["weekend_mult"]
    trend = profile["trend"]

    # Apply trend (gradual increase/decrease over time)
    expected = base + (trend * day_index)

    # Weekend reduction (UAE weekend: Fri/Sat)
    if is_weekend(current_date):
        expected *= weekend_mult

    # Add Poisson-like noise (use normal approximation for reliability)
    noise = random.gauss(0, max(1, expected * 0.3))
    qty = max(0, int(round(expected + noise)))

    return qty


async def generate_and_insert_sales(db_url: str):
    """Generate 90 days of sales and insert into the database."""
    conn = await asyncpg.connect(db_url)

    # Fetch SKU prices
    sku_prices = {}
    rows = await conn.fetch("SELECT sku_id, unit_price FROM master.skus")
    for row in rows:
        sku_prices[row["sku_id"]] = float(row["unit_price"])

    # Clear existing sales
    await conn.execute("DELETE FROM sales.transactions")

    # Temporarily disable the sale NOTIFY trigger for bulk insert speed
    await conn.execute("ALTER TABLE sales.transactions DISABLE TRIGGER tr_notify_sale")

    transactions = []
    total_records = 0

    for day_offset in range(HISTORY_DAYS):
        current_date = HISTORY_START + timedelta(days=day_offset)

        for (sku_id, warehouse_id), profile in DEMAND_PROFILES.items():
            # Check for missing data (random gaps)
            if random.random() < MISSING_DATA_PROBABILITY:
                continue

            # Check for stockout
            stockout = in_stockout(sku_id, warehouse_id, day_offset)

            if stockout:
                # During stockout: record zero or very low sales, marked as stockout
                # This creates the "suppressed demand" signal the AI must detect
                qty = random.choice([0, 0, 0, 1])  # mostly zero
                is_stockout = True
            else:
                qty = generate_quantity(profile, current_date, day_offset)
                is_stockout = False

            if qty <= 0 and not is_stockout:
                continue  # don't record zero-sales on normal days

            unit_price = sku_prices.get(sku_id, 0)
            buyer_id = random.choice(BUYER_IDS)

            transactions.append((
                sku_id,
                warehouse_id,
                current_date,
                qty,
                unit_price,
                buyer_id,
                is_stockout,
            ))
            total_records += 1

    # Bulk insert in batches
    batch_size = 500
    for i in range(0, len(transactions), batch_size):
        batch = transactions[i:i + batch_size]
        await conn.executemany(
            """
            INSERT INTO sales.transactions
                (sku_id, warehouse_id, txn_date, quantity, unit_price, buyer_id, is_stockout)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            """,
            batch,
        )

    # Re-enable trigger
    await conn.execute("ALTER TABLE sales.transactions ENABLE TRIGGER tr_notify_sale")

    # Update simulator state
    await conn.execute(
        """
        UPDATE simulator.state
        SET sim_clock = $1, sim_start_date = $1, updated_at = now()
        WHERE id = 1
        """,
        SIM_START_DATE,
    )

    await conn.close()

    # Summary
    stockout_count = sum(1 for t in transactions if t[6])
    print(f"Generated {total_records} sales transactions over {HISTORY_DAYS} days")
    print(f"  Stockout-period records: {stockout_count}")
    print(f"  Date range: {HISTORY_START} to {HISTORY_END}")
    print(f"  Simulation start date (today): {SIM_START_DATE}")

    # Print stockout summary
    print("\nStockout periods (data quality issues embedded):")
    for sku, wh, start, end in STOCKOUT_PERIODS:
        start_date = HISTORY_START + timedelta(days=start)
        end_date = HISTORY_START + timedelta(days=end)
        print(f"  {sku} @ {wh}: {start_date} to {end_date} ({end - start + 1} days)")


def main():
    parser = argparse.ArgumentParser(description="Generate 90 days of sales history")
    parser.add_argument(
        "--db-url",
        default=os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/tradling"),
        help="PostgreSQL connection URL",
    )
    args = parser.parse_args()

    print(f"Connecting to: {args.db_url}")
    asyncio.run(generate_and_insert_sales(args.db_url))
    print("\nDone! Sales history generated successfully.")


if __name__ == "__main__":
    main()
