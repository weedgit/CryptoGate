#!/usr/bin/env node
/**
 * Dense service-bill rows for Platform Service Bills UI testing.
 * Covers every status tab: Ready (draft), Unpaid (issued), Overdue,
 * New merchant (activation), Paid, Voided, Cancelled.
 *
 * Prerequisites: seed-local (+ seed-kevin-uat recommended).
 * Idempotent: deletes prior UI seeds tagged last_adjustment_reason = 'ui-bill-seed'
 *             or payment_reference LIKE 'ui-bill-%'.
 *
 * Usage: node scripts/seed-service-bills-ui.mjs
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { closePool, getPool } from "../apps/api/src/db/pool.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEED_TAG = "ui-bill-seed";
const SEED_PREFIX = "ui-bill-";

const COUNTS = {
  draft: 18,
  issued: 16,
  overdue: 10,
  paid: 24,
  voided: 16,
  cancelled: 16,
  activationOpen: 5,
};

function loadEnv() {
  for (const envPath of [
    join(root, ".env"),
    "/etc/cryptogate/api.env",
    "/etc/paymentgate/api.env",
  ]) {
    if (!existsSync(envPath)) continue;
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
      "postgres://paymentgate:paymentgate@localhost:5432/paymentgate";
  }
}

function money(n) {
  return (Math.round(n * 100) / 100).toFixed(2);
}

function daysFromNow(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(15, 0, 0, 0);
  return d;
}

function toDateOnly(d) {
  return d.toISOString().slice(0, 10);
}

/** Unique synthetic period (avoids colliding with real monthly bills). */
function periodForSlot(slot) {
  const start = new Date(Date.UTC(2019, 0, 1));
  start.setUTCDate(start.getUTCDate() + slot * 30);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 27);
  return { start: toDateOnly(start), end: toDateOnly(end) };
}

function fakeEvmTxHash(seed) {
  return `0x${createHash("sha256").update(`pg-service-bill:${seed}`).digest("hex")}`;
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} bill
 */
async function insertUiBill(pool, bill) {
  await pool.query(
    `INSERT INTO service_bills (
       id, org_id, period_start, period_end,
       subscription_amount, volume_fee_amount, total_amount,
       currency, status, due_at, paid_at, voided_at, cancelled_at, sent_at,
       payment_reference, rx_address, tx_address,
       tier, volume_fee_percent, billed_volume_usd, bill_kind,
       last_adjustment_reason,
       created_at, updated_at
     ) VALUES (
       $1, $2, $3::date, $4::date,
       $5, $6, $7,
       'USD', $8, $9::timestamptz, $10::timestamptz, $11::timestamptz, $12::timestamptz, $13::timestamptz,
       $14, $15, $16,
       $17, $18, $19, $20,
       $21,
       $22::timestamptz, $22::timestamptz
     )`,
    [
      bill.id,
      bill.orgId,
      bill.periodStart,
      bill.periodEnd,
      bill.subscription,
      bill.volumeFee,
      bill.total,
      bill.status,
      bill.dueAt.toISOString(),
      bill.paidAt ? bill.paidAt.toISOString() : null,
      bill.voidedAt ? bill.voidedAt.toISOString() : null,
      bill.cancelledAt ? bill.cancelledAt.toISOString() : null,
      bill.sentAt ? bill.sentAt.toISOString() : null,
      bill.paymentReference,
      bill.rxAddress,
      bill.txAddress,
      bill.tier,
      bill.volumeFeePercent,
      bill.billedVolumeUsd,
      bill.billKind,
      SEED_TAG,
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
       AND COALESCE(status, 'active') <> 'paused'
     ORDER BY
       CASE WHEN name LIKE 'Kevin %' THEN 0 ELSE 1 END,
       name ASC
     LIMIT 60`,
  );

  if (merchants.length === 0) {
    throw new Error(
      "No merchants found — run `node scripts/seed-local.mjs` and `node scripts/seed-kevin-uat.mjs` first.",
    );
  }

  console.log(`Using ${merchants.length} merchants for UI bill seeds…`);

  const { rowCount: deleted } = await pool.query(
    `DELETE FROM service_bills
     WHERE last_adjustment_reason = $1
        OR payment_reference LIKE $2`,
    [SEED_TAG, `${SEED_PREFIX}%`],
  );
  console.log(`Cleared ${deleted ?? 0} previous UI bill rows.`);

  let payTo = null;
  try {
    const { rows } = await pool.query(
      `SELECT pay_to FROM platform_billing_settings
       ORDER BY updated_at DESC NULLS LAST LIMIT 1`,
    );
    payTo = rows[0]?.pay_to?.trim() || null;
  } catch {
    payTo = null;
  }

  let inserted = 0;
  /** Global counter so monthly period_start stays unique per org. */
  let periodSlot = 0;

  /**
   * @param {number} n
   * @param {(i: number, merchant: {id: string, name: string}, slot: number) => object} build
   */
  async function seedMany(n, build) {
    for (let i = 0; i < n; i += 1) {
      const merchant = merchants[i % merchants.length];
      const slot = periodSlot;
      periodSlot += 1;
      // Spread slots across orgs: same org only every merchants.length inserts → unique slot/N.
      const bill = build(i, merchant, slot);
      try {
        await insertUiBill(pool, bill);
        inserted += 1;
      } catch (err) {
        console.warn(
          `  skip ${bill.status}/${bill.billKind} #${i} (${merchant.name}): ${err.message}`,
        );
      }
    }
  }

  // Ready — due dates inside the default 1m window (not future)
  await seedMany(COUNTS.draft, (i, merchant, slot) => {
    const period = periodForSlot(slot);
    const sub = 49 + (i % 20);
    const fee = 5 + (i % 40) + (i % 7) / 10;
    return {
      id: randomUUID(),
      orgId: merchant.id,
      periodStart: period.start,
      periodEnd: period.end,
      subscription: money(sub),
      volumeFee: money(fee),
      total: money(sub + fee),
      status: "draft",
      dueAt: daysFromNow(-(i % 26)),
      paidAt: null,
      voidedAt: null,
      cancelledAt: null,
      sentAt: null,
      paymentReference: `${SEED_PREFIX}draft-${i}`,
      rxAddress: null,
      txAddress: null,
      tier: "mid",
      volumeFeePercent: "1.20",
      billedVolumeUsd: money(800 + i * 37),
      billKind: "monthly",
      createdAt: daysFromNow(-(1 + (i % 4))),
    };
  });

  // Unpaid
  await seedMany(COUNTS.issued, (i, merchant, slot) => {
    const period = periodForSlot(slot);
    const sub = 49 + (i % 30);
    const fee = 10 + (i % 55) + (i % 5) / 10;
    return {
      id: randomUUID(),
      orgId: merchant.id,
      periodStart: period.start,
      periodEnd: period.end,
      subscription: money(sub),
      volumeFee: money(fee),
      total: money(sub + fee),
      status: "issued",
      // Keep due dates in the near future so status stays issued (not flipped overdue).
      dueAt: daysFromNow(2 + (i % 12)),
      paidAt: null,
      voidedAt: null,
      cancelledAt: null,
      sentAt: daysFromNow(-(2 + (i % 5))),
      paymentReference: `${SEED_PREFIX}issued-${i}`,
      rxAddress: payTo,
      txAddress: null,
      tier: "mid",
      volumeFeePercent: "1.20",
      billedVolumeUsd: money(1200 + i * 51),
      billKind: "monthly",
      createdAt: daysFromNow(-(4 + (i % 6))),
    };
  });

  // Overdue
  await seedMany(COUNTS.overdue, (i, merchant, slot) => {
    const period = periodForSlot(slot);
    const sub = 49 + (i % 25);
    const fee = 20 + (i % 80) + (i % 9) / 10;
    return {
      id: randomUUID(),
      orgId: merchant.id,
      periodStart: period.start,
      periodEnd: period.end,
      subscription: money(sub),
      volumeFee: money(fee),
      total: money(sub + fee),
      status: "overdue",
      dueAt: daysFromNow(-(5 + (i % 20))),
      paidAt: null,
      voidedAt: null,
      cancelledAt: null,
      sentAt: daysFromNow(-(25 + (i % 10))),
      paymentReference: `${SEED_PREFIX}overdue-${i}`,
      rxAddress: payTo,
      txAddress: null,
      tier: "mid",
      volumeFeePercent: "1.50",
      billedVolumeUsd: money(2000 + i * 88),
      billKind: "monthly",
      createdAt: daysFromNow(-(28 + (i % 8))),
    };
  });

  // Paid — due dates within last ~3 weeks so 1m tab counts show
  await seedMany(COUNTS.paid, (i, merchant, slot) => {
    const period = periodForSlot(slot);
    const sub = 49 + (i % 35);
    const fee = 15 + (i % 120) + (i % 6) / 10;
    const key = `paid-${i}`;
    return {
      id: randomUUID(),
      orgId: merchant.id,
      periodStart: period.start,
      periodEnd: period.end,
      subscription: money(sub),
      volumeFee: money(fee),
      total: money(sub + fee),
      status: "paid",
      dueAt: daysFromNow(-(1 + (i % 27))),
      paidAt: daysFromNow(-(i % 20)),
      voidedAt: null,
      cancelledAt: null,
      sentAt: daysFromNow(-(15 + (i % 10))),
      paymentReference: fakeEvmTxHash(`${SEED_PREFIX}${key}`),
      rxAddress: payTo || "TUIRxSeedPlatformRemit1111111111111",
      txAddress: `TUITxPayer${String(i).padStart(3, "0")}xxxxxxxxxxxxxxxxx`,
      tier: i % 3 === 0 ? "enterprise" : "mid",
      volumeFeePercent: i % 3 === 0 ? "0.90" : "1.20",
      billedVolumeUsd: money(1500 + i * 73),
      billKind: "monthly",
      createdAt: daysFromNow(-(16 + (i % 12))),
    };
  });

  // Voided (excluded from unique period index)
  await seedMany(COUNTS.voided, (i, merchant, slot) => {
    const period = periodForSlot(slot);
    const sub = 49 + (i % 15);
    const fee = 4 + (i % 30);
    return {
      id: randomUUID(),
      orgId: merchant.id,
      periodStart: period.start,
      periodEnd: period.end,
      subscription: money(sub),
      volumeFee: money(fee),
      total: money(sub + fee),
      status: "voided",
      dueAt: daysFromNow(-(1 + (i % 25))),
      paidAt: null,
      voidedAt: daysFromNow(-(i % 12)),
      cancelledAt: null,
      sentAt: daysFromNow(-(10 + (i % 5))),
      paymentReference: `${SEED_PREFIX}voided-${i}`,
      rxAddress: null,
      txAddress: null,
      tier: "mid",
      volumeFeePercent: "1.20",
      billedVolumeUsd: money(400 + i * 22),
      billKind: "monthly",
      createdAt: daysFromNow(-(12 + (i % 6))),
    };
  });

  // Cancelled — due dates inside 1m window (not future)
  await seedMany(COUNTS.cancelled, (i, merchant, slot) => {
    const period = periodForSlot(slot);
    const sub = 49 + (i % 12);
    const fee = 3 + (i % 25);
    return {
      id: randomUUID(),
      orgId: merchant.id,
      periodStart: period.start,
      periodEnd: period.end,
      subscription: money(sub),
      volumeFee: money(fee),
      total: money(sub + fee),
      status: "cancelled",
      dueAt: daysFromNow(-(2 + (i % 24))),
      paidAt: null,
      voidedAt: null,
      cancelledAt: daysFromNow(-(i % 10)),
      sentAt: i % 2 === 0 ? daysFromNow(-(3 + (i % 4))) : null,
      paymentReference: `${SEED_PREFIX}cancelled-${i}`,
      rxAddress: null,
      txAddress: null,
      tier: "small",
      volumeFeePercent: "1.50",
      billedVolumeUsd: money(200 + i * 18),
      billKind: "monthly",
      createdAt: daysFromNow(-(7 + (i % 5))),
    };
  });

  // New merchant — one open activation per merchant (unique index).
  const actN = Math.min(COUNTS.activationOpen, merchants.length);
  for (let i = 0; i < actN; i += 1) {
    const merchant = merchants[i];
    // Drop any leftover open activation for this org so we can insert.
    await pool.query(
      `DELETE FROM service_bills
       WHERE org_id = $1
         AND bill_kind = 'activation'
         AND status NOT IN ('voided', 'cancelled')`,
      [merchant.id],
    );
    const status = i % 2 === 0 ? "issued" : "overdue";
    const dueAt =
      status === "overdue" ? daysFromNow(-(2 + (i % 5))) : daysFromNow(5 + (i % 4));
    try {
      await insertUiBill(pool, {
        id: randomUUID(),
        orgId: merchant.id,
        periodStart: toDateOnly(daysFromNow(-1)),
        periodEnd: toDateOnly(daysFromNow(-1)),
        subscription: "49.00",
        volumeFee: "0.00",
        total: "49.00",
        status,
        dueAt,
        paidAt: null,
        voidedAt: null,
        cancelledAt: null,
        sentAt: daysFromNow(-(1 + (i % 3))),
        paymentReference: `${SEED_PREFIX}act-open-${i}`,
        rxAddress: payTo,
        txAddress: null,
        tier: null,
        volumeFeePercent: null,
        billedVolumeUsd: "0.00",
        billKind: "activation",
        createdAt: daysFromNow(-(2 + (i % 4))),
      });
      inserted += 1;
    } catch (err) {
      console.warn(`  skip activation #${i} (${merchant.name}): ${err.message}`);
    }
  }

  const { rows: summary } = await pool.query(
    `SELECT status, COALESCE(bill_kind, 'monthly') AS kind, COUNT(*)::int AS n
     FROM service_bills
     WHERE last_adjustment_reason = $1
     GROUP BY 1, 2
     ORDER BY 2, 1`,
    [SEED_TAG],
  );

  console.log("\nService Bills UI seeds ready:");
  console.log(`  Inserted this run: ${inserted}`);
  for (const row of summary) {
    console.log(`  ${row.kind}/${row.status}: ${row.n}`);
  }
  console.log(
    "\nTabs: All · Unpaid · Overdue · Ready · New merchant · Paid · Voided · Cancelled",
  );
  console.log("Refresh Platform → Service bills (period 1m) to review.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => closePool());
