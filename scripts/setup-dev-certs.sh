#!/usr/bin/env bash
# Generates a trusted local TLS certificate for localhost + sslip.io dev domains.
# Run once per machine before starting dev servers with HTTPS.
# On WSL2 the Windows trust store is updated automatically — no manual steps.
#
# Usage: bash scripts/setup-dev-certs.sh
set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CERT_DIR="$REPO_ROOT/certs"
DEFAULT_PUBLIC_HOST="127.0.0.1.sslip.io"

PUBLIC_HOST="${LAUNCHLMS_DEV_PUBLIC_HOST:-}"
if [ -z "$PUBLIC_HOST" ] && grep -qi microsoft /proc/version 2>/dev/null; then
  WSL_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  if [ -n "$WSL_IP" ] && [ "$WSL_IP" != "127.0.0.1" ]; then
    PUBLIC_HOST="$WSL_IP.sslip.io"
  fi
fi
PUBLIC_HOST="${PUBLIC_HOST:-$DEFAULT_PUBLIC_HOST}"

mkdir -p "$CERT_DIR"

# Install mkcert if not already present
if ! command -v mkcert &>/dev/null; then
  echo "mkcert not found. Installing..."
  if command -v apt-get &>/dev/null; then
    sudo apt-get install -y mkcert libnss3-tools
  elif command -v brew &>/dev/null; then
    brew install mkcert nss
  else
    echo "Please install mkcert manually: https://github.com/FiloSottile/mkcert"
    exit 1
  fi
fi

# Install the local CA into the Linux/WSL trust stores
mkcert -install

# On WSL2: also import the CA into the Windows trust store so Chrome trusts it.
# Import-Certificate to CurrentUser\Root does not require admin.
if command -v powershell.exe &>/dev/null; then
  CAROOT=$(mkcert -CAROOT)
  CAROOT_WIN=$(wslpath -w "$CAROOT/rootCA.pem")
  echo "Importing CA into Windows trust store..."
  powershell.exe -Command "Import-Certificate -FilePath '$CAROOT_WIN' -CertStoreLocation Cert:\\CurrentUser\\Root" > /dev/null
  echo "Windows trust store updated."
fi

# Generate one cert that works for both the default Next.js localhost URL and
# the sslip.io domain we use for subdomain/cookie testing.
CERT_NAMES=(
  "localhost"
  "127.0.0.1"
  "::1"
  "$DEFAULT_PUBLIC_HOST"
  "*.$DEFAULT_PUBLIC_HOST"
)

if [ "$PUBLIC_HOST" != "$DEFAULT_PUBLIC_HOST" ]; then
  CERT_NAMES+=("$PUBLIC_HOST" "*.$PUBLIC_HOST")
fi

mkcert \
  -cert-file "$CERT_DIR/local.pem" \
  -key-file  "$CERT_DIR/local-key.pem" \
  "${CERT_NAMES[@]}"

echo ""
echo "Certificates written to $CERT_DIR/"
echo "Restart dev servers (api, web, collab) to pick up HTTPS."
echo ""
echo "  API:    uv run uvicorn app:app --reload --port 1338 --ssl-keyfile ../../certs/local-key.pem --ssl-certfile ../../certs/local.pem"
echo "  Web:    bun dev   (already configured in package.json)"
echo "  Collab: bun dev   (cert paths set in apps/collab/.env)"
