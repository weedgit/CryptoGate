#!/usr/bin/env bash
# Logical restore drill against a sidecar database. Does not stop live API/watcher.
# Credentials/container match deploy/backup.sh (PAYMENTGATE_BACKUP_* env).
set -euo pipefail

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="${PAYMENTGATE_DRILL_DIR:-/var/backups/paymentgate-drill}/$STAMP"
CONTAINER="${PAYMENTGATE_BACKUP_CONTAINER:-paymentgate-postgres}"
PG_USER="${PAYMENTGATE_BACKUP_PGUSER:-cryptogate}"
PG_DB="${PAYMENTGATE_BACKUP_PGDB:-cryptogate}"
DRILL_DB="cg_drill_$(date -u +%Y%m%d%H%M%S)"
mkdir -p "$WORK"

cleanup() {
  local code=$?
  docker exec "$CONTAINER" rm -f "/tmp/${DRILL_DB}.dump" 2>/dev/null || true
  if docker exec "$CONTAINER" psql -U "$PG_USER" -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname='${DRILL_DB}'" 2>/dev/null | grep -q 1; then
    docker exec "$CONTAINER" psql -U "$PG_USER" -d postgres -v ON_ERROR_STOP=1 \
      -c "DROP DATABASE IF EXISTS ${DRILL_DB};" 2>/dev/null || true
  fi
  if [[ "$code" -ne 0 ]]; then
    echo "restore-drill FAILED (exit $code) — live stack not modified" >&2
  fi
}
trap cleanup EXIT

echo "==> dump live ${PG_DB} (container ${CONTAINER}, user ${PG_USER})"
if ! docker exec "$CONTAINER" pg_isready -U "$PG_USER" -d "$PG_DB" >/dev/null 2>&1; then
  echo "postgres not ready ($CONTAINER / $PG_USER / $PG_DB)" >&2
  exit 1
fi

docker exec "$CONTAINER" pg_dump -U "$PG_USER" -d "$PG_DB" --format=custom \
  > "$WORK/source.dump"
chmod 600 "$WORK/source.dump"

DUMP_BYTES="$(wc -c < "$WORK/source.dump" | tr -d ' ')"
if [[ "${DUMP_BYTES:-0}" -lt 64 ]]; then
  echo "pg_dump produced empty/too-small dump ($DUMP_BYTES bytes)" >&2
  exit 1
fi

echo "==> create $DRILL_DB"
docker exec "$CONTAINER" psql -U "$PG_USER" -d postgres -v ON_ERROR_STOP=1 \
  -c "CREATE DATABASE ${DRILL_DB} OWNER ${PG_USER};"

echo "==> restore into sidecar"
docker cp "$WORK/source.dump" "${CONTAINER}:/tmp/${DRILL_DB}.dump"
docker exec "$CONTAINER" pg_restore -U "$PG_USER" -d "$DRILL_DB" --no-owner \
  "/tmp/${DRILL_DB}.dump"
docker exec "$CONTAINER" rm -f "/tmp/${DRILL_DB}.dump"

echo "==> smoke counts"
docker exec "$CONTAINER" psql -U "$PG_USER" -d "$DRILL_DB" -v ON_ERROR_STOP=1 -c "
SELECT
  (SELECT count(*) FROM schema_migrations) AS migrations,
  (SELECT count(*) FROM users) AS users,
  (SELECT count(*) FROM payment_orders) AS orders;
"

echo "==> drop sidecar"
docker exec "$CONTAINER" psql -U "$PG_USER" -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE ${DRILL_DB};"

trap - EXIT
echo "ok restore-drill $STAMP (live stack not interrupted)"
echo "$STAMP" > "${PAYMENTGATE_DRILL_DIR:-/var/backups/paymentgate-drill}/last-ok"
