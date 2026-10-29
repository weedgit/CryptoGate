#!/usr/bin/env bash
# Move the deployment to a root-owned /opt tree served by unprivileged services (review D2).
#
# Today the API and watcher run as root from /root/CryptoGate with write access to it, nginx
# runs as root to read /root, and root's cron runs deploy/backup.sh from that tree: any code
# execution in the API could rewrite the pay page or a cron script. After this script:
#   - code lives in /opt/paymentgate, owned by root, not writable by the services;
#   - cryptogate-api / cryptogate-watcher run as the system user `paymentgate`;
#   - the API writes exports only to /var/lib/paymentgate;
#   - cron runs scripts from /opt/paymentgate/deploy;
#   - nginx serves /opt/paymentgate (and drops `user root` when no other site needs it).
#
# Run as root in a maintenance window, from the checkout to deploy:
#   sudo bash deploy/install-opt-layout.sh            # dry run: prints the plan
#   sudo bash deploy/install-opt-layout.sh --apply    # do it
# Rollback: restore /etc/systemd/system/*.pre-opt, /etc/nginx/*.pre-opt.*, /root/*.cron.pre-opt.*
# (all written by this script), then daemon-reload, reload nginx, restart the services.
set -euo pipefail

APPLY=0
[[ "${1:-}" == "--apply" ]] && APPLY=1

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST=/opt/paymentgate
SVC_USER=paymentgate
API_UNIT=${API_UNIT:-cryptogate-api}
WATCHER_UNIT=${WATCHER_UNIT:-cryptogate-watcher}
API_ENV=${API_ENV:-/etc/cryptogate/api.env}
WATCHER_ENV=${WATCHER_ENV:-/etc/cryptogate/watcher.env}
NGINX_SITE=${NGINX_SITE:-/etc/nginx/sites-enabled/paymentgate.conf}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)

run() {
  echo "+ $*"
  if [[ $APPLY -eq 1 ]]; then "$@"; fi
}

[[ $EUID -eq 0 ]] || { echo "run as root" >&2; exit 1; }
[[ -f "$SRC/apps/api/src/server.mjs" ]] || { echo "not a PaymentGate checkout: $SRC" >&2; exit 1; }
[[ -d "$SRC/node_modules" ]] || { echo "install dependencies in $SRC first (pnpm install)" >&2; exit 1; }
[[ -f "$API_ENV" && -f "$WATCHER_ENV" ]] || { echo "env files not found: $API_ENV $WATCHER_ENV" >&2; exit 1; }

echo "Source:      $SRC"
echo "Destination: $DEST (root:root, read-only for $SVC_USER)"
[[ $APPLY -eq 1 ]] || echo "(dry run: pass --apply to make changes)"

# 1. Service user.
if ! id "$SVC_USER" >/dev/null 2>&1; then
  run useradd --system --home-dir /nonexistent --no-create-home --shell /usr/sbin/nologin "$SVC_USER"
fi

# 2. Code tree, owned by root. Secrets stay in /etc; .git and local env files are not copied.
run mkdir -p "$DEST"
run rsync -a --delete --exclude .git --exclude '.env' --exclude '.env.*' --exclude '.claude' \
  --exclude 'BACKUPS*' --exclude '.data' "$SRC/" "$DEST/"
run chown -R root:root "$DEST"
run chmod -R go-w "$DEST"
# The copied nginx snippets and cron file point at the new location.
run sed -i "s#/root/PaymentGate#$DEST#g; s#/root/CryptoGate#$DEST#g" \
  "$DEST"/deploy/*.inc "$DEST"/deploy/*.conf "$DEST"/deploy/cron-paymentgate

# 3. Env files readable by systemd only (EnvironmentFile is read before dropping privileges).
run chmod 600 "$API_ENV" "$WATCHER_ENV"
# The API reads the backup status file.
if [[ -d /var/backups/paymentgate ]]; then
  run chmod o+x /var/backups/paymentgate
  [[ -f /var/backups/paymentgate/status.json ]] && run chmod o+r /var/backups/paymentgate/status.json
fi

# 4. systemd units (keep the old ones for rollback).
install_unit() {
  local name=$1 template=$2 envfile=$3
  local target=/etc/systemd/system/$name.service
  [[ -f "$target" ]] && run cp "$target" "$target.pre-opt"
  echo "+ write $target from $template (EnvironmentFile=$envfile)"
  if [[ $APPLY -eq 1 ]]; then
    sed -e "s#^EnvironmentFile=.*#EnvironmentFile=$envfile#" \
        -e "s#^SyslogIdentifier=.*#SyslogIdentifier=$name#" \
        "$template" > "$target"
  fi
}
install_unit "$API_UNIT" "$DEST/deploy/paymentgate-api.service" "$API_ENV"
install_unit "$WATCHER_UNIT" "$DEST/deploy/paymentgate-watcher.service" "$WATCHER_ENV"
run systemctl daemon-reload

# 5. nginx: the site file becomes a real file (today it is a symlink into the code tree).
if [[ -e "$NGINX_SITE" ]]; then
  site_target=$(readlink -f "$NGINX_SITE")
  echo "  current site: $NGINX_SITE -> $site_target"
  run cp "$site_target" "/etc/nginx/paymentgate.conf.pre-opt.$STAMP"
  run rm -f /etc/nginx/sites-available/paymentgate.conf
  run install -m 644 "$DEST/deploy/nginx-paymentgate.conf" /etc/nginx/sites-available/paymentgate.conf
  run ln -sfn /etc/nginx/sites-available/paymentgate.conf "$NGINX_SITE"
fi
if grep -qE '^\s*user\s+root\s*;' /etc/nginx/nginx.conf; then
  if grep -rqsE '(root|alias|include)\s+/root/' /etc/nginx/sites-enabled /etc/nginx/conf.d \
     --exclude=paymentgate.conf; then
    echo "! other nginx sites still read /root; leaving 'user root' (fix those, then rerun)"
  else
    run cp /etc/nginx/nginx.conf "/etc/nginx/nginx.conf.pre-opt.$STAMP"
    run sed -i -E 's/^\s*user\s+root\s*;/user www-data;/' /etc/nginx/nginx.conf
  fi
fi
run nginx -t
run systemctl reload nginx

# 6. Cron: same jobs, run from the root-owned tree.
for cronfile in /etc/cron.d/cryptogate /etc/cron.d/paymentgate; do
  [[ -f "$cronfile" ]] || continue
  if grep -qE '/root/(CryptoGate|PaymentGate)/deploy/' "$cronfile"; then
    run cp "$cronfile" "/root/$(basename "$cronfile").cron.pre-opt.$STAMP"
    run sed -i -E "s#/root/(CryptoGate|PaymentGate)/deploy/#$DEST/deploy/#g" "$cronfile"
  fi
done
if crontab -l 2>/dev/null | grep -qE '/root/(CryptoGate|PaymentGate)/deploy/'; then
  echo "+ point root's crontab entries at $DEST/deploy"
  if [[ $APPLY -eq 1 ]]; then
    crontab -l | sed -E "s#/root/(CryptoGate|PaymentGate)/deploy/#$DEST/deploy/#g" | crontab -
  fi
fi

# 7. Restart on the new layout.
run systemctl restart "$API_UNIT" "$WATCHER_UNIT"
if [[ $APPLY -eq 1 ]]; then
  sleep 3
  systemctl --no-pager --lines=0 status "$API_UNIT" "$WATCHER_UNIT" || true
  curl -fsS http://127.0.0.1:3000/health >/dev/null && echo "API health OK"
fi
echo "Done. Future deploys: update $SRC, then rerun this script (or rsync + chown root)."
