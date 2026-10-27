"""
One-command setup script — gets the full demo running from scratch.

Usage:
    python setup.py                    # Interactive prompts
    python setup.py --db-url "postgresql://postgres:pass@host:5432/db"
    python setup.py --skip-sales       # Skip 90-day sales generation (faster)

What it does:
    1. Tests your database connection
    2. Runs schema.sql (tables, triggers, LISTEN/NOTIFY)
    3. Runs seeds.sql (SKUs, warehouses, transfer matrix, holding costs)
    4. Runs disruptions.sql (labelled disruption scenarios)
    5. Generates 90 days of sales history (unless --skip-sales)
    6. Sets up simulator/.env and dashboard/.env.local for you
    7. Prints next steps

Works with: Local PostgreSQL, Supabase (direct connection), Neon, or Docker.
"""

import argparse
import asyncio
import os
import subprocess
import sys
from pathlib import Path

# Color codes for terminal output
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
BOLD = "\033[1m"
RESET = "\033[0m"

PROJECT_ROOT = Path(__file__).parent
DB_DIR = PROJECT_ROOT / "db"
SIM_DIR = PROJECT_ROOT / "simulator"
DASH_DIR = PROJECT_ROOT / "dashboard"


def info(msg: str):
    print(f"{GREEN}[OK]{RESET} {msg}")


def warn(msg: str):
    print(f"{YELLOW}[WARN]{RESET} {msg}")


def error(msg: str):
    print(f"{RED}[ERROR]{RESET} {msg}")


def header(msg: str):
    print(f"\n{BOLD}{'=' * 60}{RESET}")
    print(f"{BOLD}  {msg}{RESET}")
    print(f"{BOLD}{'=' * 60}{RESET}\n")


async def test_connection(db_url: str) -> bool:
    """Test that the database is reachable."""
    import asyncpg

    try:
        conn = await asyncpg.connect(db_url)
        version = await conn.fetchval("SELECT version()")
        await conn.close()
        info(f"Connected to PostgreSQL: {version[:50]}...")
        return True
    except Exception as e:
        error(f"Cannot connect to database: {e}")
        return False


async def run_sql_file(db_url: str, filepath: Path, label: str):
    """Run a SQL file against the database."""
    import asyncpg

    if not filepath.exists():
        error(f"SQL file not found: {filepath}")
        return False

    sql = filepath.read_text(encoding="utf-8")
    conn = await asyncpg.connect(db_url)
    try:
        await conn.execute(sql)
        info(f"Executed {label}: {filepath.name}")
        return True
    except Exception as e:
        # Some SQL files may have DO blocks that throw on re-run
        if "already exists" in str(e).lower():
            warn(f"{label} partially applied (some objects already exist) — this is OK")
            return True
        error(f"Failed to execute {filepath.name}: {e}")
        return False
    finally:
        await conn.close()


async def generate_sales(db_url: str):
    """Run the sales history generator."""
    gen_script = DB_DIR / "generate_sales.py"
    if not gen_script.exists():
        error(f"Sales generator not found: {gen_script}")
        return False

    result = subprocess.run(
        [sys.executable, str(gen_script), "--db-url", db_url],
        cwd=str(PROJECT_ROOT),
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        info("Generated 90 days of sales history")
        return True
    else:
        error(f"Sales generation failed:\n{result.stderr}")
        return False


def write_env_files(db_url: str):
    """Create .env files for simulator and dashboard."""
    # simulator/.env
    sim_env = SIM_DIR / ".env"
    sim_env.write_text(
        f"DATABASE_URL={db_url}\n"
        f"API_TITLE=Tradeling Inventory Intelligence Simulator\n"
        f'API_VERSION=1.0.0\n'
        f'CORS_ORIGINS=["http://localhost:3000"]\n'
    )
    info(f"Created {sim_env}")

    # dashboard/.env.local
    dash_env = DASH_DIR / ".env.local"
    dash_env.write_text(
        "NEXT_PUBLIC_API_URL=http://localhost:8000\n"
        "NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws/live\n"
    )
    info(f"Created {dash_env}")


def print_next_steps():
    """Print the next steps for running the demo."""
    header("SETUP COMPLETE — Next Steps")

    print(f"  {BOLD}1. Start the backend (Terminal 1):{RESET}")
    print(f"     cd simulator")
    print(f"     pip install -r requirements.txt")
    print(f"     uvicorn app.main:app --reload --port 8000")
    print()

    print(f"  {BOLD}2. Start the frontend (Terminal 2):{RESET}")
    print(f"     cd dashboard")
    print(f"     npm install")
    print(f"     npm run dev")
    print()

    print(f"  {BOLD}3. Open the dashboard:{RESET}")
    print(f"     http://localhost:3000")
    print()

    print(f"  {BOLD}4. Start a simulation:{RESET}")
    print(f"     Go to the Simulator page → pick Scenario A → click Start")
    print(f"     Watch inventory change, agent reason, and transfers get proposed")
    print()

    print(f"  {BOLD}5. Inject a black swan (the fun part):{RESET}")
    print(f"     On the Simulator page, click any 'Black Swan Event' button")
    print(f"     Watch the agent wake up and reassess immediately")
    print()

    print(f"  {BOLD}API docs:{RESET} http://localhost:8000/docs")
    print(f"  {BOLD}WebSocket:{RESET} ws://localhost:8000/ws/live")
    print()


async def main():
    header("GulfTrade Intelligence — Setup Wizard")

    parser = argparse.ArgumentParser(description="One-command setup")
    parser.add_argument(
        "--db-url",
        help="PostgreSQL connection string (e.g. postgresql://postgres:pass@host:5432/db)",
    )
    parser.add_argument(
        "--skip-sales",
        action="store_true",
        help="Skip generating 90 days of sales history",
    )
    args = parser.parse_args()

    # --- Get DB URL ---
    db_url = args.db_url or os.environ.get("DATABASE_URL")

    if not db_url:
        print("Enter your PostgreSQL connection string.")
        print("Examples:")
        print("  Local:      postgresql://postgres:postgres@localhost:5432/tradling")
        print("  Supabase:   postgresql://postgres:yourpassword@db.xxxx.supabase.co:5432/postgres")
        print("  Neon:       postgresql://user:pass@ep-xxx.neon.tech/dbname?sslmode=require")
        print()
        db_url = input("DB URL: ").strip()

    if not db_url:
        error("No database URL provided. Cannot continue.")
        sys.exit(1)

    # --- Step 1: Test connection ---
    header("Step 1 — Testing database connection")
    if not await test_connection(db_url):
        print()
        print("Make sure your database is running and the connection string is correct.")
        print("For Supabase: use the DIRECT connection (port 5432), NOT the pooled one.")
        print("For Neon: append ?sslmode=require to your connection string.")
        sys.exit(1)

    # --- Step 2: Run schema ---
    header("Step 2 — Creating database schema")
    await run_sql_file(db_url, DB_DIR / "schema.sql", "Schema")

    # --- Step 3: Run seeds ---
    header("Step 3 — Loading seed data (SKUs, warehouses, routes)")
    await run_sql_file(db_url, DB_DIR / "seeds.sql", "Seeds")

    # --- Step 4: Run disruptions ---
    header("Step 4 — Loading disruption scenarios")
    await run_sql_file(db_url, DB_DIR / "disruptions.sql", "Disruptions")

    # --- Step 5: Generate sales history ---
    if not args.skip_sales:
        header("Step 5 — Generating 90 days of sales history")
        await generate_sales(db_url)
    else:
        warn("Skipping sales history generation (--skip-sales)")

    # --- Step 6: Write .env files ---
    header("Step 6 — Creating environment files")
    write_env_files(db_url)

    # --- Done ---
    print_next_steps()


if __name__ == "__main__":
    # Ensure asyncpg is available
    try:
        import asyncpg  # noqa
    except ImportError:
        print(f"{YELLOW}asyncpg not installed. Installing...{RESET}")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "asyncpg"])
        print()

    asyncio.run(main())
