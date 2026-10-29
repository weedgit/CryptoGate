#!/usr/bin/env bash
# Prepare a NEW mainnet database + env. Never reuse the UAT DB or its POS PIN pepper.
# Does not start a second API (this VPS already runs UAT + Qchat).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="/etc/paymentgate/mainnet-prep-$STAMP"
install -d -m 700 "$OUT"

if [[ "${CG_CONFIRM_NEW_DB:-}" != "yes" ]]; then
  echo "Refusing to create a production DB without CG_CONFIRM_NEW_DB=yes"
  echo "This script only prepares files + an isolated Postgres DB. It does not flip UAT."
  exit 2
fi

PG_PASSWORD="$(openssl rand -hex 24)"
POS_PIN_PEPPER="$(openssl rand -hex 32)"
SOURCE_ENV="${CG_SOURCE_ENV:-/etc/paymentgate/api.env}"
[[ -f "$SOURCE_ENV" ]] || SOURCE_ENV=/etc/cryptogate/api.env

cat > "$OUT/postgres.env" <<EOF
POSTGRES_USER=paymentgate
POSTGRES_DB=paymentgate
POSTGRES_PASSWORD=${PG_PASSWORD}
EOF
chmod 600 "$OUT/postgres.env"

# Isolated compose project — port 5434 loopback only.
cat > "$OUT/docker-compose.yml" <<'YAML'
services:
  postgres:
    image: postgres:16-alpine
    container_name: paymentgate-postgres-mainnet
    restart: unless-stopped
    ports:
      - "127.0.0.1:5434:5432"
    env_file:
      - ./postgres.env
    environment:
      POSTGRES_USER: paymentgate
      POSTGRES_DB: paymentgate
    volumes:
      - paymentgate_mainnet_pgdata:/var/lib/postgresql/data
    mem_limit: 512m
    pids_limit: 200
    security_opt:
      - no-new-privileges:true
volumes:
  paymentgate_mainnet_pgdata:
YAML

# Secrets go to python through the environment (root-only /proc/<pid>/environ), not argv,
# which any local user can read with ps (review D7).
CG_OUT="$OUT" CG_PG_PASSWORD="$PG_PASSWORD" CG_POS_PIN_PEPPER="$POS_PIN_PEPPER" \
  CG_SOURCE_ENV="$SOURCE_ENV" python3 - <<'PY'
"""Build the mainnet api.env from the UAT one (review D7).

- New database URL and POS_PIN_PEPPER (PIN hashes must not be portable from UAT).
- SESSION_SECRET is dropped: the API does not read it, so rotating it protected nothing.
- UAT-only switches are removed; NODE_ENV=production and Secure cookies are forced.
- Public URLs and CORS must be given for mainnet as MAINNET_<KEY> (they point at UAT now);
  any other MAINNET_<KEY> also overrides <KEY>, e.g. separate SMTP / Twilio credentials.
"""
import os
import sys
from pathlib import Path

out_dir = Path(os.environ["CG_OUT"])
src = Path(os.environ["CG_SOURCE_ENV"]).read_text(encoding="utf-8")

generated = {
    "DATABASE_URL": f"postgres://paymentgate:{os.environ['CG_PG_PASSWORD']}@127.0.0.1:5434/paymentgate",
    "POS_PIN_PEPPER": os.environ["CG_POS_PIN_PEPPER"],
    "NODE_ENV": "production",
    "SESSION_COOKIE_SECURE": "true",
    "PAYMENTGATE_CHAIN_ENV": "mainnet",
    "VITE_PAYMENTGATE_CHAIN_ENV": "mainnet",
    "CRYPTOGATE_CHAIN_ENV": "mainnet",
    "VITE_CRYPTOGATE_CHAIN_ENV": "mainnet",
    "DEFAULT_NETWORK": "tron",
}
dropped = {"SESSION_SECRET", "PASSWORD_RESET_EXPOSE_LINK"}
dropped_prefixes = ("WATCHER_STUB_", "TRON_NILE_")
must_override = ["PAYMENT_PAGE_BASE_URL", "CORS_ALLOWED_ORIGINS", "WEB_BASE_URL"]
shared_credentials = [
    "SMTP_USER", "SMTP_PASS", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN",
    "TWILIO_VERIFY_SERVICE_SID", "COINGECKO_DEMO_API_KEY", "TRON_API_KEY", "ETH_RPC_URL",
]
overrides = {
    key[len("MAINNET_"):]: value
    for key, value in os.environ.items()
    if key.startswith("MAINNET_") and value.strip()
}

present = set()
lines = []
for line in src.splitlines():
    key = line.split("=", 1)[0].strip() if "=" in line and not line.lstrip().startswith("#") else None
    if key is None:
        lines.append(line)
        continue
    present.add(key)
    if key in dropped or key.startswith(dropped_prefixes):
        continue
    if key in overrides:
        lines.append(f"{key}={overrides[key]}")
    elif key in generated:
        lines.append(f"{key}={generated[key]}")
    else:
        lines.append(line)
for key, value in {**generated, **overrides}.items():
    if key not in present:
        lines.append(f"{key}={value}")

missing = [k for k in must_override if k in present and k not in overrides]
if missing:
    sys.exit(
        "Refusing: these still point at UAT. Re-run with "
        + " ".join(f"MAINNET_{k}=..." for k in missing)
    )

target = out_dir / "api.env"
target.write_text("\n".join(lines) + "\n", encoding="utf-8")
target.chmod(0o600)
reused = [k for k in shared_credentials if k in present and k not in overrides]
if reused:
    print("note: reusing UAT credentials for " + ", ".join(reused)
          + " (set MAINNET_<KEY> to use separate mainnet ones)")
PY

cd "$OUT"
docker compose -f docker-compose.yml --env-file postgres.env up -d
for i in $(seq 1 30); do
  if docker exec paymentgate-postgres-mainnet pg_isready -U paymentgate -d paymentgate >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

set -a
# shellcheck disable=SC1091
source "$OUT/api.env"
set +a
cd "$ROOT"
node apps/api/scripts/migrate.mjs

echo "mainnet prep ready at $OUT"
echo "UAT stack on :5433 is unchanged. Start a second API only after you point DNS / rebuild web with VITE_PAYMENTGATE_CHAIN_ENV=mainnet."
