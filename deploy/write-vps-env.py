#!/usr/bin/env python3
"""Update PaymentGate .env and write /etc/paymentgate runtime env files."""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

ROOT = Path("/root/PaymentGate")
ENV_PATH = ROOT / ".env"
ETC = Path("/etc/paymentgate")

API_ONLY = {
    "SESSION_SECRET",
    "SESSION_COOKIE_SECURE",
    "PASSWORD_RESET_EXPOSE_LINK",
    "CORS_ALLOWED_ORIGINS",
    "API_PUBLIC_BASE_URL",
    "PAYMENT_PAGE_BASE_URL",
    "WEB_BASE_URL",
    "PLATFORM_WEB_ORIGIN",
    "AGENT_WEB_ORIGIN",
    "MERCHANT_WEB_ORIGIN",
    "API_HOST",
    "API_PORT",
    "PASSWORD_MIN_LENGTH",
    "RATE_LIMIT_API_KEY_PER_MINUTE",
    "RATE_LIMIT_IP_PER_MINUTE",
    "RATE_LIMIT_LOGIN_PER_MINUTE",
    "RATE_LIMIT_GUEST_PAYMENT_PER_MINUTE",
    "ORDER_EXPIRY_INTERVAL_MS",
    "ORDER_EXPIRY_ENABLED",
    "SETTLEMENT_COOLDOWN_MS",
    "HD_POOL_COOLDOWN_MS",
    "WEBHOOK_DELIVERY_INTERVAL_MS",
    "WEBHOOK_DELIVERY_ENABLED",
    "WEBHOOK_HTTP_TIMEOUT_MS",
}


def parse_env(text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        out[key.strip()] = val.strip()
    return out


def set_line(text: str, key: str, value: str) -> str:
    replacement = f"{key}={value}"
    active = re.compile(rf"^{re.escape(key)}=.*$", re.M)
    if active.search(text):
        return active.sub(replacement, text, count=1)
    commented = re.compile(rf"^#\s*{re.escape(key)}=.*$", re.M)
    if commented.search(text):
        return commented.sub(replacement, text, count=1)
    return text.rstrip() + f"\n{replacement}\n"


def uncomment_key(text: str, key: str) -> str:
    pattern = re.compile(rf"^#\s*{re.escape(key)}=(.*)$", re.M)
    match = pattern.search(text)
    if match and f"{key}=" not in [
        ln.split("=", 1)[0].strip()
        for ln in text.splitlines()
        if ln.strip() and not ln.strip().startswith("#") and "=" in ln
    ]:
        return pattern.sub(rf"{key}=\1", text, count=1)
    return text


def main() -> int:
    secrets = {
        "SESSION_SECRET": os.environ["CG_SESSION_SECRET"],
        "PG_PASSWORD": os.environ["CG_PG_PASSWORD"],
    }
    text = ENV_PATH.read_text(encoding="utf-8")
    values = parse_env(text)
    infura = ""
    eth = values.get("ETH_RPC_URL", "")
    m = re.search(r"/v3/([0-9a-fA-F]+)", eth)
    if m:
        infura = m.group(1)
    polygon_mainnet = (
        f"https://polygon-mainnet.infura.io/v3/{infura}"
        if infura
        else "https://polygon-rpc.com"
    )
    db_url = f"postgres://paymentgate:{secrets['PG_PASSWORD']}@127.0.0.1:5433/paymentgate"

    updates = {
        "DATABASE_URL": db_url,
        "API_HOST": "127.0.0.1",
        "API_PORT": "3000",
        "API_PUBLIC_BASE_URL": "https://api-cg.boostbunny.io",
        "PAYMENT_PAGE_BASE_URL": "https://pay-cg.boostbunny.io",
        "WEB_BASE_URL": "https://merchant-cg.boostbunny.io",
        "PLATFORM_WEB_ORIGIN": "https://platform-cg.boostbunny.io",
        "AGENT_WEB_ORIGIN": "https://agent-cg.boostbunny.io",
        "MERCHANT_WEB_ORIGIN": "https://merchant-cg.boostbunny.io",
        "VITE_PLATFORM_WEB_ORIGIN": "https://platform-cg.boostbunny.io",
        "VITE_AGENT_WEB_ORIGIN": "https://agent-cg.boostbunny.io",
        "VITE_MERCHANT_WEB_ORIGIN": "https://merchant-cg.boostbunny.io",
        "CORS_ALLOWED_ORIGINS": ",".join(
            [
                "https://pay-cg.boostbunny.io",
                "https://platform-cg.boostbunny.io",
                "https://agent-cg.boostbunny.io",
                "https://merchant-cg.boostbunny.io",
                "https://api-cg.boostbunny.io",
            ]
        ),
        "SESSION_SECRET": secrets["SESSION_SECRET"],
        "SESSION_COOKIE_SECURE": "true",
        "PASSWORD_RESET_EXPOSE_LINK": "false",
        "PAYMENTGATE_CHAIN_ENV": "testnet",
        "VITE_PAYMENTGATE_CHAIN_ENV": "testnet",
        "VITE_API_BASE": "/v1",
        "POLYGON_RPC_URL": polygon_mainnet,
        "WATCHER_MULTI_NETWORK": "true",
        "WATCHER_POLL_INTERVAL_MS": "8000",
        "WATCHER_CONFIRM_CONCURRENCY": "8",
        "WATCHER_SCOPE_CONCURRENCY": "4",
        "DEFAULT_ASSET": "USDT",
        "DEFAULT_NETWORK": "tron_nile",
    }
    for key, val in updates.items():
        text = set_line(text, key, val)
    text = uncomment_key(text, "TON_API_KEY")
    ENV_PATH.write_text(text, encoding="utf-8")
    os.chmod(ENV_PATH, 0o600)

    merged = parse_env(text)
    merged["NODE_ENV"] = "production"

    def write_env(path: Path, keys: list[str] | None = None, exclude: set[str] | None = None) -> None:
        lines = ["# generated — do not commit", "NODE_ENV=production"]
        seen = {"NODE_ENV"}
        for k, v in merged.items():
            if k in seen:
                continue
            if exclude and k in exclude:
                continue
            if keys is not None and k not in keys and k not in API_ONLY:
                # watcher/api both get chain + db keys
                pass
            lines.append(f"{k}={v}")
            seen.add(k)
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        os.chmod(path, 0o600)

    write_env(ETC / "api.env")
    write_env(ETC / "watcher.env", exclude={"SESSION_SECRET", "SESSION_COOKIE_SECURE", "PASSWORD_RESET_EXPOSE_LINK"})

    (ETC / "postgres.env").write_text(
        f"POSTGRES_USER=paymentgate\nPOSTGRES_DB=paymentgate\nPOSTGRES_PASSWORD={secrets['PG_PASSWORD']}\n",
        encoding="utf-8",
    )
    os.chmod(ETC / "postgres.env", 0o600)

    (ETC / "pay-config.js").write_text(
        'window.PAYMENTGATE_API_BASE = "https://api-cg.boostbunny.io";\n',
        encoding="utf-8",
    )
    os.chmod(ETC / "pay-config.js", 0o644)
    print("env written")
    return 0


if __name__ == "__main__":
    sys.exit(main())
