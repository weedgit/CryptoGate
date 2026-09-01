#!/usr/bin/env bash
# Prepare a NEW mainnet database + env. Never reuse the UAT DB or SESSION_SECRET.
# Does not start a second API (this VPS already runs UAT + Qchat).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="/etc/cryptogate/mainnet-prep-$STAMP"
install -d -m 700 "$OUT"

if [[ "${CG_CONFIRM_NEW_DB:-}" != "yes" ]]; then
  echo "Refusing to create a production DB without CG_CONFIRM_NEW_DB=yes"
  echo "This script only prepares files + an isolated Postgres DB. It does not flip UAT."
  exit 2
fi

PG_PASSWORD="$(openssl rand -hex 24)"
SESSION_SECRET="$(openssl rand -hex 48)"

cat > "$OUT/postgres.env" <<EOF
POSTGRES_USER=cryptogate
POSTGRES_DB=cryptogate
POSTGRES_PASSWORD=${PG_PASSWORD}
EOF
chmod 600 "$OUT/postgres.env"

# Isolated compose project — port 5434 loopback only.
cat > "$OUT/docker-compose.yml" <<'YAML'
services:
  postgres:
    image: postgres:16-alpine
    container_name: cryptogate-postgres-mainnet
    restart: unless-stopped
    ports:
      - "127.0.0.1:5434:5432"
    env_file:
      - ./postgres.env
    environment:
      POSTGRES_USER: cryptogate
      POSTGRES_DB: cryptogate
    volumes:
      - cryptogate_mainnet_pgdata:/var/lib/postgresql/data
    mem_limit: 512m
    pids_limit: 200
    security_opt:
      - no-new-privileges:true
volumes:
  cryptogate_mainnet_pgdata:
YAML

python3 - "$OUT" "$PG_PASSWORD" "$SESSION_SECRET" <<'PY'
import sys
from pathlib import Path
out_dir, pg, secret = sys.argv[1], sys.argv[2], sys.argv[3]
src = Path("/etc/cryptogate/api.env").read_text()
lines = []
for line in src.splitlines():
    if line.startswith("DATABASE_URL="):
        lines.append(f"DATABASE_URL=postgres://cryptogate:{pg}@127.0.0.1:5434/cryptogate")
    elif line.startswith("SESSION_SECRET="):
        lines.append(f"SESSION_SECRET={secret}")
    elif line.startswith("CRYPTOGATE_CHAIN_ENV=") or line.startswith("VITE_CRYPTOGATE_CHAIN_ENV="):
        lines.append(f"{line.split('=',1)[0]}=mainnet")
    elif line.startswith("DEFAULT_NETWORK="):
        lines.append("DEFAULT_NETWORK=tron")
    else:
        lines.append(line)
Path(out_dir, "api.env").write_text("\n".join(lines) + "\n")
Path(out_dir, "api.env").chmod(0o600)
PY

cd "$OUT"
docker compose -f docker-compose.yml --env-file postgres.env up -d
for i in $(seq 1 30); do
  if docker exec cryptogate-postgres-mainnet pg_isready -U cryptogate -d cryptogate >/dev/null 2>&1; then
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
echo "UAT stack on :5433 is unchanged. Start a second API only after you point DNS / rebuild web with VITE_CRYPTOGATE_CHAIN_ENV=mainnet."
