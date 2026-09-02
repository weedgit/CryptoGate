#!/usr/bin/env bash
# Daily PaymentGate Postgres dump. Same-disk unless PAYMENTGATE_BACKUP_RCLONE_REMOTE is set.
set -euo pipefail

KEEP_DAYS="${PAYMENTGATE_BACKUP_KEEP_DAYS:-14}"
DEST="${PAYMENTGATE_BACKUP_DIR:-/var/backups/paymentgate}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$DEST/$STAMP"
mkdir -p "$OUT"

if ! docker exec paymentgate-postgres pg_isready -U paymentgate -d paymentgate >/dev/null 2>&1; then
  echo "paymentgate postgres not ready" >&2
  exit 1
fi

docker exec paymentgate-postgres pg_dump -U paymentgate -d paymentgate --format=custom \
  > "$OUT/paymentgate.dump"
chmod 600 "$OUT/paymentgate.dump"

if [[ -n "${PAYMENTGATE_BACKUP_RCLONE_REMOTE:-}" ]]; then
  rclone copy "$OUT" "${PAYMENTGATE_BACKUP_RCLONE_REMOTE%/}/$STAMP" --quiet || true
fi

find "$DEST" -mindepth 1 -maxdepth 1 -type d -mtime "+$KEEP_DAYS" -exec rm -rf {} +
echo "ok $OUT/paymentgate.dump"
