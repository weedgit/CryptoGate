#!/usr/bin/env node
/**
 * Merchant Service Bills fixture for "Kevin Multi Merchant" — exercises the
 * merchant monthly table: period chaining, the "Upcoming" estimate, credit,
 * waivers, activation row, Due now / overdue, and the year filter.
 *
 * Billing is anchored on the 15th, 12 months back, so the current period
 * always contains today and history spans two calendar years:
 *
 *   Activation   paid        (anchor day)
 *   Month 1–2    waived      (welcome waiver, amounts kept)
 *   Month 3      cancelled   + replacement paid for the same period
 *   Month 4–6    paid        at the old 1.50% rate
 *   Month 7–9    paid        at the current rate (month 8 has $5 credit applied)
 *   Month 10     paid late
 *   Month 11     overdue
 *   Month 12     issued      (due in 5 days)
 *   Current      upcoming    estimate on the page (next_invoice_on = next 15th)
 *
 * Commercial: automatic rate mode with a stale stored rate (Mid · 1.2%) — the
 * page must show the schedule band for the period's volume, like billing does.
 * $10.00 next-period credit; optional flags below.
 *
 * Read-only rate lookups (the billing resolver would rewrite the stored rate).
 *
 * Prerequisites: seed-local + seed-kevin-uat (merchant must exist).
 * Idempotent: removes bills tagged last_adjustment_reason = 'kevin-multi-bills-seed'
 * and any other activation / monthly bills of this merchant before inserting.
 *
 * Usage:
 *   node scripts/seed-merchant-bills-kevin-multi.mjs
 *   node scripts/seed-merchant-bills-kevin-multi.mjs --waive-next    # 1 waived month left → "Waived" estimate
 *   node scripts/seed-merchant-bills-kevin-multi.mjs --pending-rate  # 1.00% from next period
 *   node scripts/seed-merchant-bills-kevin-multi.mjs --reset         # back to unactivated (draft activation)
 */
import { randomUUID } from "node:crypto";
import { loadSeedEnv } from "./seed-env.mjs";

loadSeedEnv();

const { closePool, getPool } = await import("../apps/api/src/db/pool.mjs");
const { roundUsd, volumeFeeUsd } = await import(
  "../apps/api/src/service-bills/generate-rules.mjs"
);
const { sumCompletedPayableVolume } = await import(
  "../apps/api/src/service-bills/service-bill-store.mjs"
);
const { listOrgsInSubtree } = await import("../apps/api/src/orgs/org-scope.mjs");
const { listFeeTierBands, toFeeTierBand } = await import(
  "../apps/api/src/platform-settings/fee-tier-store.mjs"
);
const { resolveTierForVolume } = await import(
  "../apps/api/src/platform-settings/fee-tier-rules.mjs"
);
const { getBillingCalendarSettings } = await import(
  "../apps/api/src/platform-settings/billing-calendar-store.mjs"
);

const MERCHANT_NAME = "Kevin Multi Merchant";
const SEED_TAG = "kevin-multi-bills-seed";
const ANCHOR_DAY = 15;
const PAY_DAYS = 7;
const OLD_RATE = "1.50";
const CREDIT_USD = "10.00";
const MONTH_VOLUMES = [
  "820.00", "1340.00", "2150.50", "1780.00", "2640.25", "3120.00",
  "2890.40", "3405.75", "2980.00", "3712.60", "4105.30", "3860.90",
];

const STORED_TIER = "mid";
const STORED_RATE = "1.2";

const args = new Set(process.argv.slice(2));

/** Schedule band for a volume — same rule as automatic billing, without writes. */
function bandFor(bands, volumeUsd) {
  const tier = resolveTierForVolume(Number(volumeUsd), bands);
  const row = bands.find((b) => b.tier === tier);
  const band = row ? toFeeTierBand(row) : null;
  return {
    tier,
    volumeFeePercent: band?.defaultSignupPercent ?? STORED_RATE,
    subscriptionAmountUsd: band?.subscriptionAmountUsd ?? "49.00",
  };
}

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

function utcDate(y, m, d) {
  return new Date(Date.UTC(y, m, d));
}

function addMonths(d, n) {
  return utcDate(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate());
}

function addDays(d, n) {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

function at(d, hours) {
  const out = new Date(d.getTime());
  out.setUTCHours(hours, 0, 0, 0);
  return out;
}

function dueFrom(invoiceOn) {
  const d = addDays(invoiceOn, PAY_DAYS);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

function cents(s) {
  return Math.round(Number.parseFloat(s) * 100);
}

function usd(c) {
  return (Math.max(0, c) / 100).toFixed(2);
}

/** @param {import("pg").Pool} pool */
async function insertBill(pool, b) {
  await pool.query(
    `INSERT INTO service_bills (
       id, org_id, period_start, period_end,
       subscription_amount, volume_fee_amount, total_amount, credit_applied_usd,
       currency, status, due_at, sent_at, paid_at, waived_at, cancelled_at, close_reason,
       payment_reference, tier, volume_fee_percent, billed_volume_usd, bill_kind,
       last_adjustment_reason, created_at, updated_at
     ) VALUES (
       $1, $2, $3::date, $4::date,
       $5, $6, $7, $8,
       'USD', $9, $10::timestamptz, $11::timestamptz, $12::timestamptz, $13::timestamptz,
       $14::timestamptz, $15,
       $16, $17, $18, $19, $20,
       $21, $22::timestamptz, $22::timestamptz
     )`,
    [
      randomUUID(),
      b.orgId,
      b.periodStart,
      b.periodEnd,
      b.subscription,
      b.volumeFee,
      b.total,
      b.creditApplied ?? null,
      b.status,
      b.dueAt.toISOString(),
      b.sentAt?.toISOString() ?? null,
      b.paidAt?.toISOString() ?? null,
      b.waivedAt?.toISOString() ?? null,
      b.cancelledAt?.toISOString() ?? null,
      b.closeReason ?? null,
      b.paymentReference ?? null,
      b.tier,
      b.volumeFeePercent,
      b.billedVolumeUsd,
      b.billKind,
      SEED_TAG,
      b.createdAt.toISOString(),
    ],
  );
}

async function main() {
  const pool = getPool();
  const { rows: found } = await pool.query(
    `SELECT id FROM org_accounts WHERE name = $1 AND type = 'merchant' LIMIT 1`,
    [MERCHANT_NAME],
  );
  const orgId = found[0]?.id;
  if (!orgId) {
    throw new Error(`${MERCHANT_NAME} not found — run scripts/seed-kevin-uat.mjs first.`);
  }

  const calendar = await getBillingCalendarSettings();
  const activationFee = roundUsd(calendar.activationFeeUsd ?? "49.00");

  const { rowCount: cleared } = await pool.query(
    `DELETE FROM service_bills
     WHERE org_id = $1
       AND (last_adjustment_reason = $2 OR bill_kind IN ('activation', 'monthly'))`,
    [orgId, SEED_TAG],
  );
  await pool.query(`DELETE FROM billing_fee_waivers WHERE org_id = $1`, [orgId]);

  if (args.has("--reset")) {
    await pool.query(
      `UPDATE merchant_commercial
       SET billing_anchor_at = NULL, next_invoice_on = NULL, volume_period_start = NULL,
           service_bill_credit_usd = '0.00',
           pending_volume_fee_percent = NULL, pending_effective_from = NULL,
           updated_at = now()
       WHERE org_id = $1`,
      [orgId],
    );
    const today = at(new Date(), 0);
    await insertBill(pool, {
      orgId,
      periodStart: ymd(today),
      periodEnd: ymd(today),
      subscription: activationFee,
      volumeFee: "0.00",
      total: activationFee,
      status: "draft",
      dueAt: dueFrom(today),
      tier: "mid",
      volumeFeePercent: "0",
      billedVolumeUsd: "0.00",
      billKind: "activation",
      createdAt: new Date(),
    });
    console.log(`Reset ${MERCHANT_NAME}: cleared ${cleared ?? 0} bills, draft activation restored.`);
    return;
  }

  const now = new Date();
  const todayUtc = utcDate(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const currentStart =
    todayUtc.getUTCDate() >= ANCHOR_DAY
      ? utcDate(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), ANCHOR_DAY)
      : utcDate(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth() - 1, ANCHOR_DAY);
  const nextInvoiceOn = addMonths(currentStart, 1);
  const anchor = addMonths(currentStart, -12);

  await pool.query(
    `UPDATE merchant_commercial
     SET rate_mode = 'automatic', tier = $8, volume_fee_percent = $9,
         billing_anchor_at = $2::timestamptz,
         next_invoice_on = $3::date,
         volume_period_start = $4::date,
         service_bill_credit_usd = $5,
         pending_volume_fee_percent = $6,
         pending_effective_from = $7::date,
         updated_at = now()
     WHERE org_id = $1`,
    [
      orgId,
      at(anchor, 12).toISOString(),
      ymd(nextInvoiceOn),
      ymd(currentStart),
      CREDIT_USD,
      args.has("--pending-rate") ? "1.00" : null,
      args.has("--pending-rate") ? ymd(nextInvoiceOn) : null,
      STORED_TIER,
      STORED_RATE,
    ],
  );
  const bands = await listFeeTierBands();

  if (args.has("--waive-next")) {
    await pool.query(
      `INSERT INTO billing_fee_waivers (org_id, months_granted, months_used, reason)
       VALUES ($1, 2, 1, 'Seed: one waived month left')`,
      [orgId],
    );
  }

  await insertBill(pool, {
    orgId,
    periodStart: ymd(anchor),
    periodEnd: ymd(anchor),
    subscription: activationFee,
    volumeFee: "0.00",
    total: activationFee,
    status: "paid",
    dueAt: dueFrom(anchor),
    sentAt: at(anchor, 9),
    paidAt: at(anchor, 12),
    paymentReference: `seed-kevin-multi-activation`,
    tier: "mid",
    volumeFeePercent: "0",
    billedVolumeUsd: "0.00",
    billKind: "activation",
    createdAt: at(anchor, 9),
  });

  const summary = [];
  for (let i = 0; i < 12; i += 1) {
    const start = addMonths(anchor, i);
    const invoiceOn = addMonths(anchor, i + 1);
    const end = addDays(invoiceOn, -1);
    const volume = MONTH_VOLUMES[i];
    const rates = bandFor(bands, volume);
    const subscription = roundUsd(rates?.subscriptionAmountUsd ?? "49.00");
    const pct = i >= 3 && i <= 5 ? OLD_RATE : String(rates?.volumeFeePercent ?? "1.20");
    const volumeFee = volumeFeeUsd(volume, pct);
    const gross = cents(subscription) + cents(volumeFee);
    const creditApplied = i === 7 ? "5.00" : null;
    const total = usd(gross - (creditApplied ? cents(creditApplied) : 0));
    const due = i === 11 ? at(addDays(todayUtc, 5), 23) : dueFrom(invoiceOn);
    const base = {
      orgId,
      periodStart: ymd(start),
      periodEnd: ymd(end),
      subscription,
      volumeFee,
      total,
      creditApplied,
      dueAt: due,
      sentAt: at(invoiceOn, 9),
      tier: rates?.tier ?? "mid",
      volumeFeePercent: pct,
      billedVolumeUsd: volume,
      billKind: "monthly",
      createdAt: at(invoiceOn, 8),
    };

    let status;
    if (i <= 1) {
      status = "waived";
      await insertBill(pool, {
        ...base,
        status,
        waivedAt: at(invoiceOn, 8),
        closeReason: "Welcome waiver (2 months)",
      });
    } else if (i === 2) {
      await insertBill(pool, {
        ...base,
        total: usd(gross + 2500),
        volumeFee: usd(cents(volumeFee) + 2500),
        status: "cancelled",
        cancelledAt: at(invoiceOn, 11),
        closeReason: "Wrong volume — reissued",
      });
      status = "paid";
      await insertBill(pool, {
        ...base,
        status,
        paidAt: at(addDays(invoiceOn, 3), 14),
        paymentReference: `seed-kevin-multi-m${i + 1}`,
        createdAt: at(invoiceOn, 12),
      });
      summary.push({ month: ymd(start), status: "cancelled", total: usd(gross + 2500) });
    } else if (i <= 9) {
      status = "paid";
      const paidAt = i === 9 ? at(addDays(due, 4), 10) : at(addDays(invoiceOn, 2), 14);
      await insertBill(pool, {
        ...base,
        status,
        paidAt,
        paymentReference: `seed-kevin-multi-m${i + 1}`,
      });
    } else if (i === 10) {
      status = "overdue";
      await insertBill(pool, { ...base, status });
    } else {
      status = "issued";
      await insertBill(pool, { ...base, status });
    }
    summary.push({
      month: ymd(start),
      period: `${ymd(start)} → ${ymd(end)}`,
      status,
      volume,
      pct,
      subscription,
      volumeFee,
      credit: creditApplied ?? "",
      total,
      due: ymd(due),
    });
  }

  console.log(`\n${MERCHANT_NAME} (${orgId}) — cleared ${cleared ?? 0} bills, seeded:\n`);
  console.log(`  Activation  ${ymd(anchor)}  paid  $${activationFee}`);
  console.table(summary);

  const subtree = await listOrgsInSubtree([orgId]);
  const volumeOrgIds = subtree
    .filter((r) => r.type === "merchant" || r.type === "merchant_site")
    .map((r) => r.id);
  const periodVolume = roundUsd(
    await sumCompletedPayableVolume(
      volumeOrgIds,
      `${ymd(currentStart)}T00:00:00.000Z`,
      `${ymd(nextInvoiceOn)}T00:00:00.000Z`,
    ),
  );
  const periodRates = bandFor(bands, periodVolume);
  const periodSub = roundUsd(periodRates.subscriptionAmountUsd);
  const periodFee = volumeFeeUsd(periodVolume, periodRates.volumeFeePercent);
  const exact = {
    subscriptionAmount: periodSub,
    billedVolumeUsd: periodVolume,
    volumeFeePercent: periodRates.volumeFeePercent,
    tier: periodRates.tier,
    totalAmount: usd(cents(periodSub) + cents(periodFee)),
  };
  const openRows = summary.filter((r) => r.status === "issued" || r.status === "overdue");
  const dueNow = usd(openRows.reduce((sum, r) => sum + cents(r.total), 0));

  console.log("\nExpected on the merchant Service Bills page:");
  console.log(`  Due now      $${dueNow}  (${openRows.length} open bills · overdue)`);
  if (args.has("--waive-next")) {
    console.log(`  Next bill    Waived · invoiced ${ymd(nextInvoiceOn)} · 1 waived month left`);
  } else {
    const est = usd(cents(exact.totalAmount) - cents(CREDIT_USD));
    console.log(
      `  Next bill    ~$${est}  invoiced ${ymd(nextInvoiceOn)}` +
        `  (server: $${exact.subscriptionAmount} + ${exact.billedVolumeUsd} × ${exact.volumeFeePercent}%` +
        ` = $${exact.totalAmount}, − $${CREDIT_USD} credit)`,
    );
    console.log(
      `  Upcoming row ${ymd(currentStart)} → ${ymd(addDays(nextInvoiceOn, -1))}` +
        "  (page sums settled orders in this window, viewer timezone)",
    );
  }
  console.log(
    `  Plan card    Automatic · ${exact.tier} · ${exact.volumeFeePercent}% (stored rate is ${STORED_TIER} ${STORED_RATE}% — must NOT show)`,
  );
  console.log(`  Plan         credit $${CREDIT_USD}${args.has("--pending-rate") ? " · 1.00% from next period" : ""}`);
  console.log(`  Years        ${ymd(anchor).slice(0, 4)} and ${ymd(currentStart).slice(0, 4)}`);
  console.log(`\nLogin: own.multi@paymentgate.io → Service Bills`);
}

try {
  await main();
} finally {
  await closePool();
}
