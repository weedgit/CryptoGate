#!/usr/bin/env bash
# Wire nginx to nginx-paymentgate.conf after rebrand (replaces cryptogate.conf symlink).
set -euo pipefail

DEPLOY_ROOT="${PAYMENTGATE_DEPLOY_ROOT:-/root/CryptoGate}"
SITE_NAME="paymentgate.conf"
CONF="${DEPLOY_ROOT}/deploy/nginx-paymentgate.conf"

if [[ ! -f "$CONF" ]]; then
  echo "Missing ${CONF}" >&2
  exit 1
fi

# nginx-paymentgate.conf includes use /root/PaymentGate — keep that path valid.
if [[ ! -e /root/PaymentGate ]]; then
  ln -sfn "$DEPLOY_ROOT" /root/PaymentGate
  echo "Linked /root/PaymentGate -> ${DEPLOY_ROOT}"
fi

# TLS + env paths from rebrand still live under /etc/cryptogate on older VPS installs.
if [[ ! -e /etc/paymentgate && -d /etc/cryptogate ]]; then
  ln -sfn /etc/cryptogate /etc/paymentgate
  echo "Linked /etc/paymentgate -> /etc/cryptogate"
fi

ln -sfn "$CONF" "/etc/nginx/sites-available/${SITE_NAME}"
rm -f /etc/nginx/sites-enabled/cryptogate.conf
ln -sfn "/etc/nginx/sites-available/${SITE_NAME}" "/etc/nginx/sites-enabled/${SITE_NAME}"

echo "==> nginx -t"
nginx -t

if systemctl is-active --quiet nginx 2>/dev/null; then
  systemctl reload nginx
  echo "nginx reloaded"
else
  systemctl enable nginx
  systemctl start nginx
  echo "nginx started"
fi
