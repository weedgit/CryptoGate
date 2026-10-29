#!/usr/bin/env bash
# Restore drill: load the latest *actual* backup (deploy/backup.sh) into a sidecar database and
# smoke-check it. Does not stop the live API/watcher, does not dump the live database, and
# keeps no copies (review D6). Credentials/container match deploy/backup.sh.
set -euo pipefail
umask 077

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DRILL_ROOT="${PAYMENTGATE_DRILL_DIR:-/var/backups/paymentgate-drill}"
BACKUP_DIR="${PAYMENTGATE_BACKUP_DIR:-/var/backups/paymentgate}"
SOURCE="${PAYMENTGATE_DRILL_SOURCE:-$BACKUP_DIR/latest/paymentgate.dump}"
MAX_AGE_HOURS="${PAYMENTGATE_DRILL_MAX_BACKUP_AGE_HOURS:-36}"
CONTAINER="${PAYMENTGATE_BACKUP_CONTAINER:-paymentgate-postgres}"
PG_USER="${PAYMENTGATE_BACKUP_PGUSER:-cryptogate}"
PG_DB="${PAYMENTGATE_BACKUP_PGDB:-cryptogate}"
DRILL_DB="cg_drill_$(date -u +%Y%m%d%H%M%S)"
mkdir -p "$DRILL_ROOT"

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

# Older drills copied a fresh live dump into a dated folder and never removed it.
find "$DRILL_ROOT" -mindepth 1 -maxdepth 1 -type d -name '2*' -exec rm -rf {} + 2>/dev/null || true

SOURCE_REAL="$(readlink -f "$SOURCE" || true)"
if [[ -z "$SOURCE_REAL" || ! -s "$SOURCE_REAL" ]]; then
  echo "no backup to restore at $SOURCE" >&2
  exit 1
fi
AGE_HOURS=$(( ( $(date +%s) - $(stat -c %Y "$SOURCE_REAL") ) / 3600 ))
if [[ "$AGE_HOURS" -gt "$MAX_AGE_HOURS" ]]; then
  echo "latest backup is ${AGE_HOURS}h old (> ${MAX_AGE_HOURS}h): $SOURCE_REAL" >&2
  exit 1
fi
echo "==> restoring $SOURCE_REAL (${AGE_HOURS}h old) into sidecar (container ${CONTAINER}, user ${PG_USER})"
if ! docker exec "$CONTAINER" pg_isready -U "$PG_USER" -d "$PG_DB" >/dev/null 2>&1; then
  echo "postgres not ready ($CONTAINER / $PG_USER / $PG_DB)" >&2
  exit 1
fi

echo "==> create $DRILL_DB"
docker exec "$CONTAINER" psql -U "$PG_USER" -d postgres -v ON_ERROR_STOP=1 \
  -c "CREATE DATABASE ${DRILL_DB} OWNER ${PG_USER};"

echo "==> restore into sidecar"
docker cp "$SOURCE_REAL" "${CONTAINER}:/tmp/${DRILL_DB}.dump"
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
echo "$STAMP $SOURCE_REAL" > "$DRILL_ROOT/last-ok"
