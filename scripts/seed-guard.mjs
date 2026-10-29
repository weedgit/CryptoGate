/**
 * Seed and cleanup scripts create fixed-password accounts and several TRUNCATE or DELETE
 * tables. On the VPS they pick up the live API env, so they refuse a database that looks live
 * unless the operator names it: SEED_CONFIRM_DATABASE=<database name> (review D1).
 */
import { existsSync, readFileSync } from "node:fs";
import { getPool } from "../apps/api/src/db/pool.mjs";

/** Env files of the deployed API on this host. */
const HOST_API_ENV_FILES = ["/etc/paymentgate/api.env", "/etc/cryptogate/api.env"];

/**
 * Host env file whose DATABASE_URL is the one this script is about to use, if any.
 * @param {string} url
 */
export function deployedEnvFileFor(url) {
  for (const file of HOST_API_ENV_FILES) {
    if (!existsSync(file)) continue;
    let text = "";
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
      if (m && m[1].replace(/^["']|["']$/g, "") === url.trim()) return file;
    }
  }
  return null;
}

/**
 * Exit (code 2) when DATABASE_URL points at a live-looking database without confirmation.
 * Call after the script has loaded its env and before it writes anything.
 */
export async function guardSeedDatabase() {
  if (!process.env.DATABASE_URL) return;
  const pool = getPool();
  const { rows } = await pool.query("SELECT current_database() AS name");
  const name = rows[0]?.name ?? "";
  let paidOrders = 0;
  try {
    const paid = await pool.query(
      "SELECT count(*)::int AS n FROM payment_orders WHERE tx_hash IS NOT NULL",
    );
    paidOrders = paid.rows[0]?.n ?? 0;
  } catch {
    // Fresh database without the orders table.
  }
  const reasons = [];
  const deployed = deployedEnvFileFor(process.env.DATABASE_URL);
  if (deployed) reasons.push(`it is the deployed API's database (${deployed})`);
  if (process.env.NODE_ENV === "production") reasons.push("NODE_ENV=production");
  if (paidOrders > 0) reasons.push(`${paidOrders} orders with on-chain payments`);
  if (reasons.length === 0 || process.env.SEED_CONFIRM_DATABASE === name) return;
  console.error(
    `Refusing to run a seed/cleanup script against database "${name}" (${reasons.join(", ")}).\n` +
      `It writes known-password accounts and may delete data. If this really is a disposable ` +
      `database, re-run with SEED_CONFIRM_DATABASE=${name}`,
  );
  process.exit(2);
}
