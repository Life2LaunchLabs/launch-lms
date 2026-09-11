#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_DIR="$ROOT_DIR/apps/api"
WEB_DIR="${UI_TEST_WEB_ROOT:-$ROOT_DIR/apps/web}"
API_PORT="${UI_TEST_API_PORT:-19001}"
WEB_PORT="${UI_TEST_WEB_PORT:-13100}"
PUBLIC_HOST="${UI_TEST_PUBLIC_HOST:-127.0.0.1.sslip.io}"
USE_HTTPS="${UI_TEST_HTTPS:-true}"
WEB_MODE="${UI_TEST_WEB_MODE:-dev}"
WEB_PROTOCOL=http
web_tls_args=()
node_ca_file=''
if [[ "$USE_HTTPS" == true ]]; then
  WEB_PROTOCOL=https
  node_ca_file="$(mkcert -CAROOT)/rootCA.pem"
  web_tls_args=(--experimental-https --experimental-https-cert "$ROOT_DIR/certs/local.pem" --experimental-https-key "$ROOT_DIR/certs/local-key.pem")
fi

: "${UI_TEST_DATABASE_URL:?Set UI_TEST_DATABASE_URL to a dedicated disposable database.}"
: "${UI_TEST_EMAIL:?Set UI_TEST_EMAIL to a synthetic account.}"
: "${UI_TEST_PASSWORD:?Set UI_TEST_PASSWORD for the synthetic account.}"

if [[ "$UI_TEST_DATABASE_URL" != *"bot"* && "$UI_TEST_DATABASE_URL" != *"test"* ]]; then
  echo "UI_TEST_DATABASE_URL must visibly identify a bot/test database." >&2
  exit 1
fi

api_log="${TMPDIR:-/tmp}/launch-lms-ui-api-${API_PORT}.log"
web_log="${TMPDIR:-/tmp}/launch-lms-ui-web-${WEB_PORT}.log"
runtime_config_path="$WEB_DIR/public/runtime-config.js"
runtime_config_created=false
api_pid=''
web_pid=''
cleanup() {
  if [[ -n "$web_pid" ]]; then kill "$web_pid" 2>/dev/null || true; fi
  if [[ -n "$api_pid" ]]; then kill "$api_pid" 2>/dev/null || true; fi
  if [[ "$runtime_config_created" == true ]]; then rm -f "$runtime_config_path"; fi
}
trap cleanup EXIT INT TERM

# The production container generates this optional client config before start.
# Mirror that contract when the browser harness launches Next directly.
if [[ ! -f "$runtime_config_path" ]]; then
  printf '%s\n' 'window.__RUNTIME_CONFIG__ = {};' > "$runtime_config_path"
  runtime_config_created=true
fi

cd "$API_DIR"
LAUNCHLMS_SQL_CONNECTION_STRING="$UI_TEST_DATABASE_URL" \
LAUNCHLMS_REDIS_CONNECTION_STRING="${UI_TEST_REDIS_URL:-redis://127.0.0.1:6379/1}" \
LAUNCHLMS_AUTH_JWT_SECRET_KEY="ui-test-secret-key-at-least-32-chars" \
LAUNCHLMS_INITIAL_ADMIN_EMAIL="$UI_TEST_EMAIL" LAUNCHLMS_INITIAL_ADMIN_PASSWORD="$UI_TEST_PASSWORD" \
LAUNCHLMS_DEVELOPMENT_MODE=true LAUNCHLMS_UI_TEST_FIXTURES=true \
LAUNCHLMS_DOMAIN="$PUBLIC_HOST:$API_PORT" \
LAUNCHLMS_FRONTEND_DOMAIN="$PUBLIC_HOST:$WEB_PORT" \
LAUNCHLMS_COOKIE_DOMAIN=".$PUBLIC_HOST" LAUNCHLMS_SSL="$USE_HTTPS" \
COLLAB_INTERNAL_KEY="ui-test-collab-key" \
.venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port "$API_PORT" >"$api_log" 2>&1 &
api_pid=$!

cd "$WEB_DIR"
if [[ "$WEB_MODE" == start ]]; then
  web_command=(node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port "$WEB_PORT")
elif [[ "$WEB_MODE" == dev ]]; then
  web_command=(node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port "$WEB_PORT")
else
  echo "UI_TEST_WEB_MODE must be 'dev' or 'start'." >&2
  exit 1
fi
NODE_EXTRA_CA_CERTS="$node_ca_file" NODE_TLS_REJECT_UNAUTHORIZED=0 \
LAUNCHLMS_INTERNAL_API_URL="http://127.0.0.1:$API_PORT/api/v1/" \
LAUNCHLMS_INTERNAL_BACKEND_URL="http://127.0.0.1:$API_PORT" \
NEXT_PUBLIC_LAUNCHLMS_BACKEND_URL="http://127.0.0.1:$API_PORT" \
NEXT_PUBLIC_LAUNCHLMS_DOMAIN="$PUBLIC_HOST:$WEB_PORT" \
NEXT_PUBLIC_LAUNCHLMS_TOP_DOMAIN="$PUBLIC_HOST" NEXT_PUBLIC_LAUNCHLMS_HTTPS="$USE_HTTPS" \
NEXT_DIST_DIR="${UI_TEST_NEXT_DIST_DIR:-.next-ui-test}" \
"${web_command[@]}" "${web_tls_args[@]}" >"$web_log" 2>&1 &
web_pid=$!

for attempt in $(seq 1 120); do
  if curl -fsS "http://127.0.0.1:$API_PORT/api/v1/health" >/dev/null 2>&1 \
    && curl -fsk "$WEB_PROTOCOL://$PUBLIC_HOST:$WEB_PORT/login" >/dev/null 2>&1; then
    break
  fi
  if [[ "$attempt" == 120 ]]; then
    tail -80 "$api_log" >&2
    tail -80 "$web_log" >&2
    exit 1
  fi
  sleep 1
done

cd "$ROOT_DIR/apps/web"
UI_TEST_BASE_URL="$WEB_PROTOCOL://$PUBLIC_HOST:$WEB_PORT" UI_TEST_TARGET_KIND=local \
UI_TEST_ORG_SLUG="${UI_TEST_ORG_SLUG:-life2launch}" \
UI_TEST_HUB_PATH="${UI_TEST_HUB_PATH:-/hub}" UI_TEST_PLANS_PATH="${UI_TEST_PLANS_PATH:-/plans}" \
UI_TEST_CAPTURE="${UI_TEST_CAPTURE:-true}" \
bun tests/ui/doctor.ts
UI_TEST_BASE_URL="$WEB_PROTOCOL://$PUBLIC_HOST:$WEB_PORT" UI_TEST_TARGET_KIND=local \
UI_TEST_ORG_SLUG="${UI_TEST_ORG_SLUG:-life2launch}" \
UI_TEST_HUB_PATH="${UI_TEST_HUB_PATH:-/hub}" UI_TEST_PLANS_PATH="${UI_TEST_PLANS_PATH:-/plans}" \
UI_TEST_CAPTURE="${UI_TEST_CAPTURE:-true}" \
bunx playwright test "$@"
