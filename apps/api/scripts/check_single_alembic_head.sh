#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "$API_DIR"

HEAD_OUTPUT="$(uv run alembic heads)"
HEAD_COUNT="$(printf '%s\n' "$HEAD_OUTPUT" | grep -c '(head)' || true)"

if [ "$HEAD_COUNT" -ne 1 ]; then
  echo "Expected exactly 1 Alembic head, found $HEAD_COUNT."
  echo ""
  echo "$HEAD_OUTPUT"
  exit 1
fi

echo "Alembic head check passed:"
echo "$HEAD_OUTPUT"
