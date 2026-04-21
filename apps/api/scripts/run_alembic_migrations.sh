#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "$API_DIR"

if [ -z "${LAUNCHLMS_SQL_CONNECTION_STRING:-}" ] && [ -z "${DATABASE_URL:-}" ]; then
  echo "Error: set LAUNCHLMS_SQL_CONNECTION_STRING or DATABASE_URL before running migrations."
  exit 1
fi

./scripts/check_single_alembic_head.sh

echo "Running Alembic migrations from ${API_DIR}..."
if uv run python ./scripts/needs_alembic_bootstrap.py; then
  :
else
  status=$?
  if [ "$status" -eq 10 ]; then
    echo "Bootstrapping Alembic state for legacy database schema..."
    uv run alembic stamp head
  elif [ "$status" -eq 11 ]; then
    echo "Bootstrapping fresh database schema from current models..."
    uv run python ./scripts/bootstrap_fresh_database.py
    uv run alembic stamp head
  else
    exit "$status"
  fi
fi

uv run alembic upgrade head
echo "Alembic migrations completed successfully."
