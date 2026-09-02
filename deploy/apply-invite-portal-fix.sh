#!/usr/bin/env bash
# Apply portal subdomain env + reload API/nginx after invite-link fixes.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ROOT}/.env"
API_ENV="/etc/paymentgate/api.env"

patch_env_file() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  local tmp
  tmp="$(mktemp)"
  python3 - "$file" <<'PY' >"$tmp"
import re
import sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
updates = {
    "WEB_BASE_URL": "https://app-cg.boostbunny.io",
    "PLATFORM_WEB_ORIGIN": "https://platform-cg.boostbunny.io",
    "AGENT_WEB_ORIGIN": "https://agent-cg.boostbunny.io",
    "MERCHANT_WEB_ORIGIN": "https://merchant-cg.boostbunny.io",
}

def set_line(src: str, key: str, value: str) -> str:
    line = f"{key}={value}"
    active = re.compile(rf"^{re.escape(key)}=.*$", re.M)
    if active.search(src):
        return active.sub(line, src, count=1)
    commented = re.compile(rf"^#\s*{re.escape(key)}=.*$", re.M)
    if commented.search(src):
        return commented.sub(line, src, count=1)
    return src.rstrip() + f"\n{line}\n"

for k, v in updates.items():
    text = set_line(text, k, v)
path.write_text(text, encoding="utf-8")
print(f"patched {path}")
PY
  mv "$tmp" "$file"
  chmod 600 "$file" 2>/dev/null || true
}

echo "==> Patching portal origins in ${ENV_FILE}"
patch_env_file "$ENV_FILE"

if [[ -f "$API_ENV" ]]; then
  echo "==> Patching portal origins in ${API_ENV}"
  patch_env_file "$API_ENV"
else
  echo "==> Skipping ${API_ENV} (not present — run deploy/write-vps-env.py on VPS first)"
fi

echo "==> Building web"
(cd "$ROOT" && pnpm --filter @paymentgate/web build)

if command -v nginx >/dev/null 2>&1; then
  echo "==> Ensuring nginx site (paymentgate.conf)"
  PAYMENTGATE_DEPLOY_ROOT="$ROOT" bash "$ROOT/deploy/ensure-nginx-site.sh"
fi

if systemctl is-active --quiet paymentgate-api 2>/dev/null; then
  echo "==> Restarting paymentgate-api"
  systemctl restart paymentgate-api
else
  echo "==> paymentgate-api service not running — start manually after deploy"
fi

echo "Done. Re-invite a test user — link should be https://agent-cg.boostbunny.io/reset-password?token=..."
