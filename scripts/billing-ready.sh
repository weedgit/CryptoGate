#!/usr/bin/env bash
# Host helper: migrate billing schema + live smoke + optional API restart.
# Run on the machine that can reach Postgres / Docker.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f /etc/cryptogate/api.env ]]; then
  set -a
  # shellcheck disable=SC1091
  . /etc/cryptogate/api.env
  set +a
elif [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL not set (need /etc/cryptogate/api.env or .env)" >&2
  exit 1
fi

echo "==> DB $(node -e "const u=new URL(process.env.DATABASE_URL); console.log(u.host+u.pathname)")"
echo "==> migrate"
(cd apps/api && node scripts/migrate.mjs)
echo "==> billing smoke --live"
(cd apps/api && node scripts/billing-smoke.mjs --live)

if [[ "${1:-}" == "--restart-api" ]]; then
  echo "==> restart API"
  pkill -f 'apps/api/src/server.mjs' 2>/dev/null || true
  sleep 1
  NODE_ENV=production nohup node apps/api/src/server.mjs >/tmp/cryptogate-api.log 2>&1 &
  echo "API pid $!"
  sleep 1
  tail -n 8 /tmp/cryptogate-api.log || true
fi

echo "OK — hard-refresh portal; see doc/Billing-Commission-UAT.md"
