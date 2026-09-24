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
  if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files cryptogate-api.service >/dev/null 2>&1; then
    # Prefer systemd so we do not fight the unit with orphan nohup processes.
    if systemctl is-system-running >/dev/null 2>&1 || systemctl status cryptogate-api >/dev/null 2>&1; then
      systemctl restart cryptogate-api
      systemctl --no-pager -l status cryptogate-api | head -n 20 || true
    else
      echo "systemctl unavailable in this namespace — falling back to process restart" >&2
      pkill -f 'apps/api/src/server.mjs' 2>/dev/null || true
      sleep 1
      NODE_ENV=production nohup node apps/api/src/server.mjs >/tmp/cryptogate-api.log 2>&1 &
      echo "API pid $!"
      sleep 1
      tail -n 8 /tmp/cryptogate-api.log || true
    fi
  else
    pkill -f 'apps/api/src/server.mjs' 2>/dev/null || true
    sleep 1
    NODE_ENV=production nohup node apps/api/src/server.mjs >/tmp/cryptogate-api.log 2>&1 &
    echo "API pid $!"
    sleep 1
    tail -n 8 /tmp/cryptogate-api.log || true
  fi
fi

echo "OK — hard-refresh portal; see doc/Billing-Commission-UAT.md"
