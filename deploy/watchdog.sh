#!/usr/bin/env bash
# Local uptime probe — logs failures only. Does not page off-box.
set -euo pipefail

LOG="${PAYMENTGATE_WATCHDOG_LOG:-/var/log/paymentgate-watchdog.log}"
HOST="${PAYMENTGATE_HEALTH_HOST:-api-cg.boostbunny.io}"

# Private temp file (a fixed /tmp path written as root can be pre-created by another user).
HEALTH_JSON="$(mktemp)"
trap 'rm -f "$HEALTH_JSON"' EXIT
code="$(curl -sS -o "$HEALTH_JSON" -w '%{http_code}' \
  --max-time 8 \
  --resolve "${HOST}:443:127.0.0.1" \
  "https://${HOST}/health" || echo 000)"

ok=0
if [[ "$code" == "200" ]] && grep -q '"status":"ok"' "$HEALTH_JSON" 2>/dev/null \
  && grep -q '"db":"ok"' "$HEALTH_JSON" 2>/dev/null; then
  ok=1
fi

if [[ "$ok" -ne 1 ]]; then
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) FAIL http=$code $(tr -d '\n' < "$HEALTH_JSON" 2>/dev/null | head -c 200)" >> "$LOG"
  exit 1
fi

if ! systemctl is-active --quiet paymentgate-watcher; then
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) FAIL watcher inactive" >> "$LOG"
  exit 1
fi
