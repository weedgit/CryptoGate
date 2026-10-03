#!/usr/bin/env bash
# Cloud Agent install phase: durable, idempotent repository bootstrap.
# Runs after checkout (and once per environment build to bake the snapshot).
set -euo pipefail

cd "$(dirname "$0")/.."

echo "[install] Installing PostgreSQL 16 (if missing)…"
if ! command -v pg_ctlcluster >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    postgresql postgresql-contrib
fi

echo "[install] Ensuring PostgreSQL role/database (paymentgate)…"
sudo pg_ctlcluster 16 main start >/dev/null 2>&1 || true
for _ in $(seq 1 30); do
  sudo -u postgres pg_isready -q && break
  sleep 1
done
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='paymentgate'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE ROLE paymentgate LOGIN PASSWORD 'paymentgate' SUPERUSER;"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='paymentgate'" | grep -q 1 \
  || sudo -u postgres createdb -O paymentgate paymentgate

echo "[install] Preparing .env…"
[ -f .env ] || cp .env.example .env

echo "[install] Installing workspace dependencies…"
npx pnpm@9.15.0 install --frozen-lockfile

echo "[install] Linking workspace + building shared packages…"
node scripts/link-workspace.mjs
# Clear incremental build info so tsc always emits dist/ (mirrors scripts/check.mjs).
rm -f packages/domain/tsconfig.tsbuildinfo packages/matching/tsconfig.tsbuildinfo
npx pnpm@9.15.0 --filter @paymentgate/domain run build
npx pnpm@9.15.0 --filter @paymentgate/matching run build

echo "[install] Done."
