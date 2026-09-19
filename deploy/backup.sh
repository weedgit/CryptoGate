#!/usr/bin/env bash
# Daily PaymentGate Postgres dump. Same-disk unless PAYMENTGATE_BACKUP_RCLONE_REMOTE is set.
# Writes $DEST/status.json for API / dashboard health (PAYMENTGATE_BACKUP_STATUS_PATH).
set -euo pipefail

KEEP_DAYS="${PAYMENTGATE_BACKUP_KEEP_DAYS:-14}"
DEST="${PAYMENTGATE_BACKUP_DIR:-/var/backups/paymentgate}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$DEST/$STAMP"
STATUS_PATH="${PAYMENTGATE_BACKUP_STATUS_PATH:-$DEST/status.json}"
CONTAINER="${PAYMENTGATE_BACKUP_CONTAINER:-paymentgate-postgres}"
PG_USER="${PAYMENTGATE_BACKUP_PGUSER:-cryptogate}"
PG_DB="${PAYMENTGATE_BACKUP_PGDB:-cryptogate}"
OFFSITE=false
ERRORS=0
MESSAGE="ok"
DUMP_BYTES=0

mkdir -p "$DEST" "$OUT"

write_status() {
  local ok_flag="$1"
  python3 - "$STATUS_PATH" "$ok_flag" "$STAMP" "$OUT" "$DUMP_BYTES" "$OFFSITE" "$ERRORS" "$MESSAGE" <<'PY'
import json, sys, socket
from datetime import datetime, timezone

(
    path,
    ok_flag,
    stamp,
    out_dir,
    dump_bytes,
    offsite,
    errors,
    message,
) = sys.argv[1:9]

data = {
    "ok": str(ok_flag).lower() in ("1", "true", "yes"),
    "stamp": stamp,
    "finishedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
    "path": out_dir,
    "bytes": int(dump_bytes or 0),
    "offsite": str(offsite).lower() in ("1", "true", "yes"),
    "errors": int(errors or 0),
    "message": message,
    "host": socket.gethostname(),
}
with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PY
}

on_fail() {
  local code=$?
  if [[ "$code" -ne 0 ]]; then
    ERRORS=$((ERRORS + 1))
    if [[ "$MESSAGE" == "ok" ]]; then
      MESSAGE="backup failed (exit $code)"
    fi
    write_status 0 || true
  fi
}
trap on_fail EXIT

if ! docker exec "$CONTAINER" pg_isready -U "$PG_USER" -d "$PG_DB" >/dev/null 2>&1; then
  MESSAGE="postgres not ready ($CONTAINER / $PG_USER / $PG_DB)"
  echo "$MESSAGE" >&2
  exit 1
fi

if ! docker exec "$CONTAINER" pg_dump -U "$PG_USER" -d "$PG_DB" --format=custom \
  > "$OUT/paymentgate.dump"; then
  MESSAGE="pg_dump failed"
  echo "$MESSAGE" >&2
  exit 1
fi

chmod 600 "$OUT/paymentgate.dump"
DUMP_BYTES="$(wc -c < "$OUT/paymentgate.dump" | tr -d ' ')"

if [[ "${DUMP_BYTES:-0}" -lt 64 ]]; then
  MESSAGE="pg_dump produced empty/too-small dump ($DUMP_BYTES bytes)"
  echo "$MESSAGE" >&2
  exit 1
fi

if [[ -n "${PAYMENTGATE_BACKUP_RCLONE_REMOTE:-}" ]]; then
  if command -v rclone >/dev/null 2>&1 \
    && rclone copy "$OUT" "${PAYMENTGATE_BACKUP_RCLONE_REMOTE%/}/$STAMP" --quiet; then
    OFFSITE=true
  else
    MESSAGE="pg_dump ok; offsite rclone failed"
    ERRORS=$((ERRORS + 1))
    echo "$MESSAGE" >&2
  fi
fi

find "$DEST" -mindepth 1 -maxdepth 1 -type d -name '2*' -mtime "+$KEEP_DAYS" -exec rm -rf {} + 2>/dev/null || true
ln -sfn "$STAMP" "$DEST/latest"

if [[ "$ERRORS" -gt 0 ]]; then
  write_status 0
  trap - EXIT
  echo "backup finished with errors: $OUT/paymentgate.dump" >&2
  exit 1
fi

write_status 1
trap - EXIT
echo "ok $OUT/paymentgate.dump ($DUMP_BYTES bytes)"
