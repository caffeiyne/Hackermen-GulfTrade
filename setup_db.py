"""
One-command database setup script.

Usage:
  python setup_db.py                          # Uses DATABASE_URL from .env or default localhost
  python setup_db.py --db-url "postgresql://postgres:password@db.xxx.supabase.co:5432/postgres"

What it does:
  1. Connects to PostgreSQL
  2. Creates the database (if it doesn't exist)
  3. Runs schema.sql, seeds.sql, disruptions.sql
  4. Runs the 90-day sales history generator

Prerequisites:
  pip install asyncpg
"""

import argparse
import asyncio
import os
import sys
from pathlib import Path

# DB setup script — ensure we can import asyncpg
try:
    import asyncpg
except ImportError:
    print("Installing asyncpg...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "asyncpg"])
    import asyncpg

DB_DIR = Path(__file__).parent / "db"
SCHEMA_FILE = DB_DIR / "schema.sql"
SEEDS_FILE = DB_DIR / "seeds.sql"
DISRUPTIONS_FILE = DB_DIR / "disruptions.sql"


async def run_sql_file(conn, filepath: Path, label: str):
    """Execute a SQL file against the connection."""
    print(f"  Running {label} ({filepath.name})...")
    sql = filepath.read_text(encoding="utf-8")
    await conn.execute(sql)
    print(f"  Done.")


async def check_table_counts(conn):
    """Print row counts for key tables to verify seeding."""
    queries = [
        ("SKUs", "SELECT count(*) FROM master.skus"),
        ("Warehouses", "SELECT count(*) FROM master.warehouses"),
        ("Transfer routes", "SELECT count(*) FROM master.transfer_matrix"),
        ("Stock levels", "SELECT count(*) FROM inventory.stock_levels"),
        ("Stock age buckets", "SELECT count(*) FROM inventory.stock_age"),
        ("Inbound orders", "SELECT count(*) FROM orders.inbound"),
        ("Disruptions", "SELECT count(*) FROM events.disruptions"),
    ]
    print("\n  Seed verification:")
    for label, query in queries:
        try:
            row = await conn.fetchrow(query)
            count = row["count"] if row else 0
            print(f"    {label:.<25} {count}")
        except Exception as e:
            print(f"    {label:.<25} ERROR: {e}")


async def setup_database(db_url: str, create_db: bool = False):
    """Set up the full database from scratch."""
    # Parse connection string to extract db name
    # Format: postgresql://user:pass@host:port/dbname
    # If create_db=True, we connect to 'postgres' db first and create the target db
    if create_db:
        # Replace the database name with 'postgres' for the initial connection
        parts = db_url.rsplit("/", 1)
        base_url = parts[0] + "/postgres"
        target_db = parts[1].split("?")[0] if len(parts) > 1 else "tradling"

        print(f"Connecting to PostgreSQL server to create database '{target_db}'...")
        server_conn = await asyncpg.connect(base_url)
        try:
            exists = await server_conn.fetchval(
                "SELECT 1 FROM pg_database WHERE datname = $1", target_db
            )
            if not exists:
                await server_conn.execute(f'CREATE DATABASE "{target_db}"')
                print(f"  Created database: {target_db}")
            else:
                print(f"  Database '{target_db}' already exists, skipping creation.")
        finally:
            await server_conn.close()

    print(f"\nConnecting to: {db_url}")
    conn = await asyncpg.connect(db_url)
    try:
        print("Running SQL scripts...\n")
        await run_sql_file(conn, SCHEMA_FILE, "Schema (tables, triggers, NOTIFY)")
        await run_sql_file(conn, SEEDS_FILE, "Seed data (SKUs, warehouses, inventory, orders)")
        await run_sql_file(conn, DISRUPTIONS_FILE, "Disruption scenarios")
        await check_table_counts(conn)
    finally:
        await conn.close()

    print("\n" + "=" * 60)
    print("Database setup complete!")
    print("=" * 60)
    print("\nNext steps:")
    print("  1. Generate 90 days of sales history:")
    print("     cd db && python generate_sales.py --db-url \"" + db_url + "\"")
    print("  2. Start the FastAPI backend:")
    print("     cd simulator && uvicorn app.main:app --reload --port 8000")
    print("  3. Start the Next.js dashboard:")
    print("     cd dashboard && npm install && npm run dev")


def main():
    parser = argparse.ArgumentParser(description="Set up the Tradeling simulator database")
    parser.add_argument(
        "--db-url",
        default=os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/tradling"),
        help="PostgreSQL connection string",
    )
    parser.add_argument(
        "--create-db",
        action="store_true",
        help="Create the database if it doesn't exist (connects to 'postgres' db first)",
    )
    args = parser.parse_args()

    try:
        asyncio.run(setup_database(args.db_url, create_db=args.create_db))
    except Exception as e:
        print(f"\nERROR: {e}", file=sys.stderr)
        print("\nTroubleshooting:")
        print("  - For Supabase: use the 'Direct connection' string (not pooled)")
        print("  - For Neon: append ?sslmode=require to the connection string")
        print("  - For local: ensure PostgreSQL is running on localhost:5432")
        sys.exit(1)


if __name__ == "__main__":
    main()
