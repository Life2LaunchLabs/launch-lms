#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "$API_DIR"

if [ -z "${LAUNCHLMS_SQL_CONNECTION_STRING:-}" ] && [ -z "${DATABASE_URL:-}" ]; then
  echo "Error: set LAUNCHLMS_SQL_CONNECTION_STRING or DATABASE_URL before running migrations."
  exit 1
fi

echo "Running Alembic migrations from ${API_DIR}..."
uv run alembic upgrade head
echo "Alembic migrations completed successfully."
