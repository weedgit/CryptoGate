#!/usr/bin/env bash
# Cloud Agent start phase: per-boot runtime reconciliation.
#
# This script is self-healing: booting from a prebuilt environment does a fresh
# repository checkout and does NOT re-run the install phase, and the build
# snapshot does not reliably retain in-repo artifacts (node_modules, package
# dist) or system packages. Each step below is therefore guarded so it only does
# work when something is actually missing — warm boots skip straight through.
set -euo pipefail

cd "$(dirname "$0")/.."

# 1. Ensure PostgreSQL 16 is installed (fast no-op once present).
if ! command -v pg_ctlcluster >/dev/null 2>&1; then
  echo "[start] Installing PostgreSQL 16…"
  sudo apt-get update -y
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    postgresql postgresql-contrib
fi

# 2. Start the cluster and wait until it accepts connections.
echo "[start] Starting PostgreSQL…"
sudo pg_ctlcluster 16 main start >/dev/null 2>&1 || true
for _ in $(seq 1 30); do
  sudo -u postgres pg_isready -q && break
  sleep 1
done
sudo -u postgres pg_isready -q || { echo "[start] PostgreSQL did not become ready"; exit 1; }

# 3. Ensure the application role/database exist.
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='paymentgate'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE ROLE paymentgate LOGIN PASSWORD 'paymentgate' SUPERUSER;"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='paymentgate'" | grep -q 1 \
  || sudo -u postgres createdb -O paymentgate paymentgate

# 4. Ensure Node dependencies and shared package builds are present.
if [ ! -d node_modules ] || [ ! -f packages/domain/dist/index.js ] || [ ! -f packages/matching/dist/index.js ]; then
  echo "[start] Installing workspace dependencies + building shared packages…"
  npx pnpm@9.15.0 install --frozen-lockfile
  node scripts/link-workspace.mjs
  # Clear incremental build info so tsc always emits dist/ (mirrors scripts/check.mjs).
  rm -f packages/domain/tsconfig.tsbuildinfo packages/matching/tsconfig.tsbuildinfo
  npx pnpm@9.15.0 --filter @paymentgate/domain run build
  npx pnpm@9.15.0 --filter @paymentgate/matching run build
fi

# 5. Environment file + database URL.
[ -f .env ] || cp .env.example .env
set -a; . ./.env; set +a
export DATABASE_URL="${DATABASE_URL:-postgres://paymentgate:paymentgate@localhost:5432/paymentgate}"

# 6. Apply migrations (idempotent — already-applied ones are skipped).
echo "[start] Applying database migrations…"
node apps/api/scripts/migrate.mjs

# 7. Seed the demo platform owner only if the DB has not been seeded yet, so a
#    restart never wipes work created during a session.
seeded=$(PGPASSWORD=paymentgate psql -h localhost -U paymentgate -d paymentgate -tAc \
  "SELECT 1 FROM users WHERE lower(email)=lower('own.platform@paymentgate.io') LIMIT 1" 2>/dev/null || true)
if [ "$seeded" != "1" ]; then
  echo "[start] Seeding demo platform owner…"
  node scripts/seed-local.mjs
else
  echo "[start] Demo data already present — skipping seed."
fi

echo "[start] Ready. Services are launched in the api/watcher/web terminals."
