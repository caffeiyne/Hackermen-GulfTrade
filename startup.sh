#!/bin/sh
set -e

# Ensure SSL is in the connection string (Render Postgres requires it)
DB_URL="$DATABASE_URL"
case "$DB_URL" in
  *sslmode=*) ;;
  *) DB_URL="${DB_URL}&sslmode=require" ;;
esac

echo "[startup] Applying database schema..."
psql "$DB_URL" -f /app/db/schema.sql

echo "[startup] Applying seeds..."
psql "$DB_URL" -f /app/db/seeds.sql

echo "[startup] Applying disruptions..."
psql "$DB_URL" -f /app/db/disruptions.sql

if [ "$RUN_SEED" = "1" ]; then
  echo "[startup] Generating 90 days of sales data..."
  python /app/db/generate_sales.py --db-url "$DB_URL"
fi

echo "[startup] Starting uvicorn on port ${PORT:-8000}..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
