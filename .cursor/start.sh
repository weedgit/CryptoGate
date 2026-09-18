#!/usr/bin/env bash
# Cloud Agent start phase: per-boot runtime reconciliation.
# Starts PostgreSQL, applies migrations, and seeds demo data once.
# Must be idempotent and return after reaching a ready state.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "[start] Starting PostgreSQL…"
sudo pg_ctlcluster 16 main start >/dev/null 2>&1 || true
for _ in $(seq 1 30); do
  sudo -u postgres pg_isready -q && break
  sleep 1
done
sudo -u postgres pg_isready -q || { echo "[start] PostgreSQL did not become ready"; exit 1; }

# Safety net in case the role/db are absent (e.g. fresh cluster).
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='paymentgate'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE ROLE paymentgate LOGIN PASSWORD 'paymentgate' SUPERUSER;"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='paymentgate'" | grep -q 1 \
  || sudo -u postgres createdb -O paymentgate paymentgate

[ -f .env ] || cp .env.example .env
set -a; . ./.env; set +a
export DATABASE_URL="${DATABASE_URL:-postgres://paymentgate:paymentgate@localhost:5432/paymentgate}"

echo "[start] Applying database migrations…"
node apps/api/scripts/migrate.mjs

# Seed the platform owner only if the database has not been seeded yet, so a
# restart never wipes work created during a session.
seeded=$(PGPASSWORD=paymentgate psql -h localhost -U paymentgate -d paymentgate -tAc \
  "SELECT 1 FROM users WHERE lower(email)=lower('own.platform@paymentgate.io') LIMIT 1" 2>/dev/null || true)
if [ "$seeded" != "1" ]; then
  echo "[start] Seeding demo platform owner…"
  node scripts/seed-local.mjs
else
  echo "[start] Demo data already present — skipping seed."
fi

echo "[start] Ready. Services are launched in the api/watcher/web terminals."
