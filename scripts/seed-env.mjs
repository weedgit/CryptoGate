import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Load repo `.env`, then force `DATABASE_URL` from the host API env when present
 * (same behavior as `seed-local.mjs`).
 */
export function loadSeedEnv() {
  const envPath = join(root, ".env");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      if (!process.env[key]) process.env[key] = trimmed.slice(eq + 1).trim();
    }
  }

  for (const fallback of [
    "/etc/paymentgate/api.env",
    "/etc/cryptogate/api.env",
  ]) {
    if (!existsSync(fallback)) continue;
    for (const line of readFileSync(fallback, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      if (key === "DATABASE_URL") {
        process.env.DATABASE_URL = trimmed.slice(eq + 1).trim();
        return;
      }
    }
  }

  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL =
      "postgres://paymentgate:paymentgate@localhost:5432/paymentgate";
  }
}
