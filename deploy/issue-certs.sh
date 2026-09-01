#!/usr/bin/env bash
# Issue or skip Let's Encrypt for CryptoGate boostbunny.io hosts.
# Safe to run from cron. Requires A records pointing at this VPS.
set -euo pipefail

DOMAINS=(
  api-cg.boostbunny.io
  pay-cg.boostbunny.io
  app-cg.boostbunny.io
  platform-cg.boostbunny.io
  agent-cg.boostbunny.io
  merchant-cg.boostbunny.io
)
CURRENT="/etc/cryptogate/tls/current"
WEBROOT="/var/www/letsencrypt"
STAMP_FILE="/etc/cryptogate/tls/letsencrypt.ok"

live_dir_for_cg() {
  for name in api-cg.boostbunny.io pay-cg.boostbunny.io app-cg.boostbunny.io platform-cg.boostbunny.io agent-cg.boostbunny.io merchant-cg.boostbunny.io; do
    if [[ -f "/etc/letsencrypt/live/$name/fullchain.pem" ]]; then
      echo "/etc/letsencrypt/live/$name"
      return 0
    fi
  done
  return 1
}

if [[ -f "$STAMP_FILE" ]] && live_dir_for_cg >/dev/null; then
  exit 0
fi

mkdir -p "$WEBROOT"

ARGS=()
for d in "${DOMAINS[@]}"; do
  ARGS+=(-d "$d")
done

if ! certbot certonly --webroot -w "$WEBROOT" --agree-tos --non-interactive \
  --keep-until-expiring --expand \
  --email "ops@boostbunny.io" \
  "${ARGS[@]}"; then
  echo "certbot not ready (DNS likely not pointed yet)"
  exit 0
fi

LIVE_DIR="$(live_dir_for_cg || true)"
if [[ -z "${LIVE_DIR:-}" ]]; then
  echo "certbot succeeded but CryptoGate live cert not found"
  exit 1
fi

ln -sfn "$LIVE_DIR/fullchain.pem" "$CURRENT/fullchain.pem"
ln -sfn "$LIVE_DIR/privkey.pem" "$CURRENT/privkey.pem"
date -u +"%Y-%m-%dT%H:%M:%SZ" > "$STAMP_FILE"
nginx -t && systemctl reload nginx
echo "Let's Encrypt installed from $LIVE_DIR"
