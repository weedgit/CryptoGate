#!/usr/bin/env bash
# Local uptime probe — logs failures only. Does not page off-box.
set -euo pipefail

LOG="${CRYPTOGATE_WATCHDOG_LOG:-/var/log/cryptogate-watchdog.log}"
HOST="${CRYPTOGATE_HEALTH_HOST:-api-cg.boostbunny.io}"

code="$(curl -sS -o /tmp/cg-health.json -w '%{http_code}' \
  --max-time 8 \
  --resolve "${HOST}:443:127.0.0.1" \
  "https://${HOST}/health" || echo 000)"

ok=0
if [[ "$code" == "200" ]] && grep -q '"status":"ok"' /tmp/cg-health.json 2>/dev/null \
  && grep -q '"db":"ok"' /tmp/cg-health.json 2>/dev/null; then
  ok=1
fi

if [[ "$ok" -ne 1 ]]; then
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) FAIL http=$code $(tr -d '\n' < /tmp/cg-health.json 2>/dev/null | head -c 200)" >> "$LOG"
  exit 1
fi

if ! systemctl is-active --quiet cryptogate-watcher; then
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) FAIL watcher inactive" >> "$LOG"
  exit 1
fi
