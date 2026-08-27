#!/usr/bin/env node
/**
 * Issue USD service bills for the previous calendar month (or --period YYYY-MM).
 * Usage: node apps/api/scripts/generate-service-bills.mjs
 *        node apps/api/scripts/generate-service-bills.mjs --period 2026-07
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { closePool } from "../src/db/pool.mjs";
import { generateServiceBillsForPeriod } from "../src/service-bills/generate.mjs";
import { resolveGeneratePeriod } from "../src/service-bills/generate-rules.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function loadEnv() {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!process.env[key]) process.env[key] = trimmed.slice(eq + 1).trim();
  }
}

function periodFromArg() {
  const idx = process.argv.indexOf("--period");
  const raw = idx >= 0 ? process.argv[idx + 1] : "";
  if (!raw) return {};
  if (!/^\d{4}-\d{2}$/.test(raw)) {
    console.error(" --period must be YYYY-MM");
    process.exit(1);
  }
  const start = `${raw}-01`;
  const [y, m] = raw.split("-").map(Number);
  const exclusive = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1));
  const end = new Date(exclusive.getTime() - 86_400_000).toISOString().slice(0, 10);
  return { periodStart: start, periodEnd: end };
}

async function main() {
  loadEnv();
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL =
      "postgres://cryptogate:cryptogate@localhost:5432/cryptogate";
  }
  const resolved = resolveGeneratePeriod(periodFromArg());
  if (!resolved.ok) {
    console.error(resolved.message);
    process.exit(1);
  }
  const result = await generateServiceBillsForPeriod(resolved);
  console.log(
    JSON.stringify(
      {
        periodStart: result.periodStart,
        periodEnd: result.periodEnd,
        issued: result.issued.length,
        skipped: result.skipped,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => closePool());
