#!/usr/bin/env node
/**
 * Seed service bills (invoices) + volume fees for Load merchants and Load shops.
 * Idempotent via payment_reference prefix `load-bill-`.
 *
 * Prerequisites: `seed-local`, `seed-load-orgs`, optionally `seed-load-accounts-rich`
 * Usage: node scripts/seed-load-bills.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { closePool, getPool } from "../apps/api/src/db/pool.mjs";

const PREFIX = "Load";
const BILL_REF_PREFIX = "load-bill-";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
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
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL =
      "postgres://cryptogate:cryptogate@localhost:5432/cryptogate";
  }
}

function daysAgo(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

function toDateOnly(d) {
  return d.toISOString().slice(0, 10);
}

function money(n) {
  return n.toFixed(2);
}

/**
 * @param {import("pg").Pool} pool
 * @param {{
 *   orgId: string,
 *   periodStart: string,
 *   periodEnd: string,
 *   subscription: string,
 *   volumeFee: string,
 *   total: string,
 *   status: "issued" | "paid" | "overdue" | "voided",
 *   dueAt: Date,
 *   paidAt: Date | null,
 *   createdAt: Date,
 *   paymentReference: string,
 * }} bill
 */
async function insertBill(pool, bill) {
  await pool.query(
    `INSERT INTO service_bills (
       org_id, period_start, period_end,
       subscription_amount, volume_fee_amount, total_amount,
       currency, status, due_at, paid_at, payment_reference,
       created_at, updated_at
     ) VALUES (
       $1, $2::date, $3::date,
       $4, $5, $6,
       'USD', $7, $8, $9, $10,
       $11, $11
     )
     ON CONFLICT DO NOTHING`,
    [
      bill.orgId,
      bill.periodStart,
      bill.periodEnd,
      bill.subscription,
      bill.volumeFee,
      bill.total,
      bill.status,
      bill.dueAt.toISOString(),
      bill.paidAt ? bill.paidAt.toISOString() : null,
      bill.paymentReference,
      bill.createdAt.toISOString(),
    ],
  );
}

async function main() {
  loadEnv();
  const pool = getPool();

  const { rows: merchants } = await pool.query(
    `SELECT id, name FROM org_accounts
     WHERE type = 'merchant'
       AND (name LIKE $1 OR name LIKE $2)
     ORDER BY name ASC`,
    [`${PREFIX} Merchant %`, `${PREFIX} Shop %`],
  );

  if (merchants.length === 0) {
    throw new Error(
      `No ${PREFIX} merchants found — run \`node scripts/seed-load-orgs.mjs\` first.`,
    );
  }

  const { rows: existing } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM service_bills
     WHERE payment_reference LIKE $1`,
    [`${BILL_REF_PREFIX}%`],
  );
  if ((existing[0]?.n ?? 0) > 0) {
    console.log(
      `Replacing existing load bills (${existing[0].n} rows with ${BILL_REF_PREFIX}*)…`,
    );
    await pool.query(
      `DELETE FROM service_bills WHERE payment_reference LIKE $1`,
      [`${BILL_REF_PREFIX}%`],
    );
  }

  console.log(`Seeding service bills for ${merchants.length} merchants…`);

  let inserted = 0;
  let paidFees = 0;

  for (let i = 0; i < merchants.length; i++) {
    const merchant = merchants[i];
    const n = i + 1;

    // 3 bills per merchant: paid (recent), issued (open), overdue — covers invoice + fee cards.
    const plans = [
      {
        status: /** @type {const} */ ("paid"),
        daysBack: 8 + (n % 20),
        periodLen: 30,
        sub: 49 + (n % 40),
        fee: 12 + (n % 90) + (n % 7) / 10,
        dueOffset: -3,
      },
      {
        status: /** @type {const} */ ("issued"),
        daysBack: 2 + (n % 6),
        periodLen: 30,
        sub: 49 + ((n + 3) % 40),
        fee: 8 + (n % 55) + (n % 5) / 10,
        dueOffset: 14,
      },
      {
        status: /** @type {const} */ ("overdue"),
        daysBack: 25 + (n % 15),
        periodLen: 30,
        sub: 49 + ((n + 7) % 40),
        fee: 15 + (n % 70) + (n % 9) / 10,
        dueOffset: -12,
      },
    ];

    // Extra paid bill inside last 7d for ~1/3 merchants (dashboard Today/7d fees).
    if (n % 3 === 0) {
      plans.push({
        status: /** @type {const} */ ("paid"),
        daysBack: 1 + (n % 5),
        periodLen: 14,
        sub: 29 + (n % 20),
        fee: 5 + (n % 35) + (n % 4) / 10,
        dueOffset: -1,
      });
    }

    for (let b = 0; b < plans.length; b++) {
      const plan = plans[b];
      const periodEnd = daysAgo(plan.daysBack);
      const periodStart = daysAgo(plan.daysBack + plan.periodLen);
      const dueAt =
        plan.dueOffset >= 0
          ? (() => {
              const d = new Date();
              d.setUTCDate(d.getUTCDate() + plan.dueOffset);
              return d;
            })()
          : daysAgo(Math.abs(plan.dueOffset));
      const paidAt =
        plan.status === "paid" ? daysAgo(Math.max(0, plan.daysBack - 2)) : null;
      const createdAt = daysAgo(plan.daysBack + 1);
      const subscription = money(plan.sub);
      const volumeFee = money(plan.fee);
      const total = money(plan.sub + plan.fee);
      const paymentReference = `${BILL_REF_PREFIX}${merchant.id.slice(0, 8)}-${b}`;

      const { rows: dup } = await pool.query(
        `SELECT 1 FROM service_bills WHERE payment_reference = $1 LIMIT 1`,
        [paymentReference],
      );
      if (dup.length) continue;

      await insertBill(pool, {
        orgId: merchant.id,
        periodStart: toDateOnly(periodStart),
        periodEnd: toDateOnly(periodEnd),
        subscription,
        volumeFee,
        total,
        status: plan.status,
        dueAt,
        paidAt,
        createdAt,
        paymentReference,
      });
      inserted += 1;
      if (plan.status === "paid") paidFees += plan.fee;
    }

    if ((i + 1) % 20 === 0) {
      console.log(`  merchants ${i + 1}/${merchants.length}`);
    }
  }

  console.log("\nLoad bills ready:");
  console.log(`  Merchants:     ${merchants.length}`);
  console.log(`  Service bills: ${inserted}`);
  console.log(`  Paid fee sum:  ~$${money(paidFees)} (volume fees on paid bills)`);
  console.log("  Status mix:    paid / issued / overdue (backdated for 7d–2m windows)");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => closePool());
