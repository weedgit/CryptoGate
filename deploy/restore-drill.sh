#!/usr/bin/env bash
# Logical restore drill against a sidecar database. Does not stop live API/watcher.
set -euo pipefail

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="${PAYMENTGATE_DRILL_DIR:-/var/backups/paymentgate-drill}/$STAMP"
DRILL_DB="cg_drill_$(date -u +%Y%m%d%H%M%S)"
mkdir -p "$WORK"

echo "==> dump live paymentgate"
docker exec paymentgate-postgres pg_dump -U paymentgate -d paymentgate --format=custom \
  > "$WORK/source.dump"
chmod 600 "$WORK/source.dump"

echo "==> create $DRILL_DB"
docker exec paymentgate-postgres psql -U paymentgate -d postgres -v ON_ERROR_STOP=1 \
  -c "CREATE DATABASE ${DRILL_DB} OWNER paymentgate;"

echo "==> restore into sidecar"
docker cp "$WORK/source.dump" "paymentgate-postgres:/tmp/${DRILL_DB}.dump"
docker exec paymentgate-postgres pg_restore -U paymentgate -d "$DRILL_DB" --no-owner \
  "/tmp/${DRILL_DB}.dump"
docker exec paymentgate-postgres rm -f "/tmp/${DRILL_DB}.dump"

echo "==> smoke counts"
docker exec paymentgate-postgres psql -U paymentgate -d "$DRILL_DB" -v ON_ERROR_STOP=1 -c "
SELECT
  (SELECT count(*) FROM schema_migrations) AS migrations,
  (SELECT count(*) FROM users) AS users,
  (SELECT count(*) FROM payment_orders) AS orders;
"

echo "==> drop sidecar"
docker exec paymentgate-postgres psql -U paymentgate -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE ${DRILL_DB};"

echo "ok restore-drill $STAMP (live stack not interrupted)"
echo "$STAMP" > /var/backups/paymentgate-drill/last-ok
