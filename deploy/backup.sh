#!/usr/bin/env bash
# Daily CryptoGate Postgres dump. Same-disk unless CRYPTOGATE_BACKUP_RCLONE_REMOTE is set.
set -euo pipefail

KEEP_DAYS="${CRYPTOGATE_BACKUP_KEEP_DAYS:-14}"
DEST="${CRYPTOGATE_BACKUP_DIR:-/var/backups/cryptogate}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$DEST/$STAMP"
mkdir -p "$OUT"

if ! docker exec cryptogate-postgres pg_isready -U cryptogate -d cryptogate >/dev/null 2>&1; then
  echo "cryptogate postgres not ready" >&2
  exit 1
fi

docker exec cryptogate-postgres pg_dump -U cryptogate -d cryptogate --format=custom \
  > "$OUT/cryptogate.dump"
chmod 600 "$OUT/cryptogate.dump"

if [[ -n "${CRYPTOGATE_BACKUP_RCLONE_REMOTE:-}" ]]; then
  rclone copy "$OUT" "${CRYPTOGATE_BACKUP_RCLONE_REMOTE%/}/$STAMP" --quiet || true
fi

find "$DEST" -mindepth 1 -maxdepth 1 -type d -mtime "+$KEEP_DAYS" -exec rm -rf {} +
echo "ok $OUT/cryptogate.dump"
