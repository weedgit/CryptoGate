#!/usr/bin/env node
/**
 * Merchants with missed monthly invoices for Service Bills → More → Find missed invoice.
 *
 * Dedicated merchants named "Missed Seed …" (created once, reused on re-run):
 *   - stuck:     next bill date stuck in the past (one missed invoice each)
 *   - gap:       stuck 2–3 months (first row creatable, later rows "Create <date> first")
 *   - paused:    stuck while suspended (blocked)
 *   - waived:    stuck, on the Waive platform fee list ("Will be waived")
 *   - cancelled: schedule healthy, the last bill was cancelled ("Previously cancelled")
 *   - control:   bill for the period already exists (draft / paid / waived) → never listed
 *
 * Dates are relative to today (UTC), all within the last ~90 days, and several
 * within the last 3 days so the default search shows results.
 *
 * The daily job (00:00 UTC and on API start) creates stuck merchants' bills on
 * its next run, so re-run this script to bring the missed invoices back.
 *
 * Idempotent: resets bills, schedule, status and waivers of "Missed Seed" merchants only.
 *
 * Usage: node scripts/seed-missed-invoices.mjs
 */
import { randomUUID } from "node:crypto";
import { bootstrapMerchantCommercial } from "../apps/api/src/commercial/merchant-commercial-routes.mjs";
import { closePool, getPool } from "../apps/api/src/db/pool.mjs";
import { findPlatformOrg, insertOrgAccount, updateOrgStatus } from "../apps/api/src/orgs/org-store.mjs";
import { upsertFeeWaiver } from "../apps/api/src/service-bills/billing-waiver-store.mjs";
import { addOneMonthUtcDateString } from "../apps/api/src/service-bills/billing-anchor-rules.mjs";
import { loadSeedEnv } from "./seed-env.mjs";

const NAME_PREFIX = "Missed Seed";
const SEED_TAG = "missed-invoice-seed";

const TIERS = [
  { tier: "small", volumeFeePercent: "2.0" },
  { tier: "mid", volumeFeePercent: "1.2" },
  { tier: "enterprise", volumeFeePercent: "0.9" },
];

/**
 * `days`: how many days ago the missed bill date is.
 * @type {{ scenario: string, days: number, control?: string }[]}
 */
const SPECS = [
  ...[0, 1, 2, 3, 3, 5, 7, 9, 12, 15, 19, 23, 28, 34, 41, 50, 62, 75].map((days) => ({
    scenario: "stuck",
    days,
  })),
  ...[45, 58, 70, 88].map((days) => ({ scenario: "gap", days })),
  ...[2, 20, 40].map((days) => ({ scenario: "paused", days })),
  ...[1, 10, 30].map((days) => ({ scenario: "waived", days })),
  ...[1, 3, 8, 16, 22, 27].map((days) => ({ scenario: "cancelled", days })),
  { scenario: "control", days: 2, control: "draft" },
  { scenario: "control", days: 6, control: "paid" },
  { scenario: "control", days: 11, control: "waived" },
  { scenario: "control", days: 4, control: "reissued" },
];

const SCENARIO_LABEL = {
  stuck: "Stuck",
  gap: "Gap",
  paused: "Paused",
  waived: "Waived",
  cancelled: "Cancelled",
  control: "Billed",
};

function ymdDaysAgo(days) {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Same day one month earlier (clamped to month end). */
function subOneMonth(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 2, Math.min(d, last), 12)).toISOString().slice(0, 10);
}

function dayBefore(ymd) {
  const d = new Date(`${ymd}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function at(ymd, hour = 10) {
  return `${ymd}T${String(hour).padStart(2, "0")}:00:00.000Z`;
}

async function ensureMerchant(pool, parentId, name, tierSpec) {
  const { rows } = await pool.query(
    `SELECT id FROM org_accounts WHERE type = 'merchant' AND name = $1 LIMIT 1`,
    [name],
  );
  let orgId = rows[0]?.id;
  if (!orgId) {
    const created = await insertOrgAccount({
      type: "merchant",
      name,
      parentId,
      maxAgentDepth: null,
      country: "MA",
      legalName: `${name} SARL`,
      billingEmail: `billing.${name.toLowerCase().replace(/[^a-z0-9]+/g, ".")}@paymentgate.io`,
    });
    if (!created.ok) throw new Error(`Could not create ${name}: ${created.code ?? "unknown"}`);
    orgId = created.row.id;
  }
  const { rows: mc } = await pool.query(
    `SELECT org_id FROM merchant_commercial WHERE org_id = $1`,
    [orgId],
  );
  if (mc.length === 0) {
    await bootstrapMerchantCommercial({
      orgId,
      tier: tierSpec.tier,
      volumeFeePercent: tierSpec.volumeFeePercent,
    });
  }
  return orgId;
}

async function setSchedule(pool, orgId, periodStart, nextInvoiceOn) {
  await pool.query(
    `UPDATE merchant_commercial
     SET billing_anchor_at = $2::timestamptz,
         volume_period_start = $3::date,
         next_invoice_on = $4::date,
         updated_at = now()
     WHERE org_id = $1`,
    [orgId, at(periodStart), periodStart, nextInvoiceOn],
  );
}

/**
 * @param {import("pg").Pool} pool
 * @param {{ orgId: string, kind: "monthly" | "activation", status: string,
 *   periodStart: string, periodEnd: string, subscription: string, eventDay: string }} b
 */
async function insertBill(pool, b) {
  const status = b.status;
  const eventAt = at(b.eventDay, 11);
  await pool.query(
    `INSERT INTO service_bills (
       id, org_id, period_start, period_end,
       subscription_amount, volume_fee_amount, total_amount,
       currency, status, due_at, paid_at, waived_at, cancelled_at, sent_at,
       billed_volume_usd, bill_kind, last_adjustment_reason,
       created_at, updated_at
     ) VALUES (
       $1, $2, $3::date, $4::date,
       $5, '0.00', $5,
       'USD', $6, $7::timestamptz, $8::timestamptz, $9::timestamptz, $10::timestamptz, $11::timestamptz,
       '0.00', $12, $13,
       $14::timestamptz, $14::timestamptz
     )`,
    [
      randomUUID(),
      b.orgId,
      b.periodStart,
      b.periodEnd,
      b.subscription,
      status,
      at(b.eventDay, 23),
      status === "paid" ? eventAt : null,
      status === "waived" ? eventAt : null,
      status === "cancelled" ? eventAt : null,
      status === "draft" ? null : at(b.eventDay, 9),
      b.kind,
      SEED_TAG,
      at(b.eventDay, 8),
    ],
  );
}

async function main() {
  loadSeedEnv();
  const pool = getPool();

  const { rows: agents } = await pool.query(
    `SELECT id FROM org_accounts WHERE type = 'agent' AND name = 'Kevin Agent' LIMIT 1`,
  );
  const parentId = agents[0]?.id ?? (await findPlatformOrg())?.id;
  if (!parentId) {
    throw new Error("No platform org — run `node scripts/seed-local.mjs` first.");
  }

  const counters = {};
  const merchants = [];
  for (const [i, spec] of SPECS.entries()) {
    counters[spec.scenario] = (counters[spec.scenario] ?? 0) + 1;
    const suffix = spec.control ? ` ${spec.control}` : "";
    const name = `${NAME_PREFIX} ${SCENARIO_LABEL[spec.scenario]} ${String(
      counters[spec.scenario],
    ).padStart(2, "0")}${suffix}`;
    const tierSpec = TIERS[i % TIERS.length];
    const orgId = await ensureMerchant(pool, parentId, name, tierSpec);
    merchants.push({ ...spec, name, orgId });
  }

  const orgIds = merchants.map((m) => m.orgId);
  await pool.query(`DELETE FROM service_bills WHERE org_id = ANY($1::uuid[])`, [orgIds]);
  await pool.query(`DELETE FROM billing_fee_waivers WHERE org_id = ANY($1::uuid[])`, [orgIds]);

  const expected = { creatable: 0, blocked: 0, cancelled: 0 };
  for (const m of merchants) {
    await updateOrgStatus(
      m.orgId,
      m.scenario === "paused" ? "paused" : "active",
      m.scenario === "paused" ? { reason: "Seed: suspended merchant" } : {},
    );

    const invoiceOn = ymdDaysAgo(m.days);
    let periodStart = subOneMonth(invoiceOn);
    let nextInvoiceOn = invoiceOn;

    if (m.scenario === "gap") {
      let steps = 0;
      for (let d = invoiceOn; d <= ymdDaysAgo(0); d = addOneMonthUtcDateString(at(d, 12))) {
        steps += 1;
      }
      expected.creatable += 1;
      expected.blocked += steps - 1;
    } else if (m.scenario === "paused") {
      expected.blocked += 1;
    } else if (m.scenario === "stuck" || m.scenario === "waived") {
      expected.creatable += 1;
    } else if (m.scenario === "cancelled") {
      expected.cancelled += 1;
      periodStart = invoiceOn;
      nextInvoiceOn = addOneMonthUtcDateString(at(invoiceOn, 12));
    }

    // Activation paid one month before the first monthly period.
    const activationDay =
      m.scenario === "cancelled" ? subOneMonth(subOneMonth(invoiceOn)) : subOneMonth(periodStart);
    await insertBill(pool, {
      orgId: m.orgId,
      kind: "activation",
      status: "paid",
      periodStart: activationDay,
      periodEnd: activationDay,
      subscription: "49.00",
      eventDay: activationDay,
    });

    if (m.scenario === "cancelled") {
      const cancelledStart = subOneMonth(invoiceOn);
      if (activationDay < cancelledStart) {
        await insertBill(pool, {
          orgId: m.orgId,
          kind: "monthly",
          status: "paid",
          periodStart: activationDay,
          periodEnd: dayBefore(cancelledStart),
          subscription: "49.00",
          eventDay: cancelledStart,
        });
      }
      await insertBill(pool, {
        orgId: m.orgId,
        kind: "monthly",
        status: "cancelled",
        periodStart: cancelledStart,
        periodEnd: dayBefore(invoiceOn),
        subscription: "49.00",
        eventDay: invoiceOn,
      });
    }

    if (m.scenario === "control") {
      if (m.control === "reissued") {
        await insertBill(pool, {
          orgId: m.orgId,
          kind: "monthly",
          status: "cancelled",
          periodStart,
          periodEnd: dayBefore(invoiceOn),
          subscription: "49.00",
          eventDay: invoiceOn,
        });
      }
      await insertBill(pool, {
        orgId: m.orgId,
        kind: "monthly",
        status: m.control === "reissued" ? "paid" : m.control,
        periodStart,
        periodEnd: dayBefore(invoiceOn),
        subscription: "49.00",
        eventDay: invoiceOn,
      });
      // Head period billed: the next daily run only advances the schedule.
    }

    await setSchedule(pool, m.orgId, periodStart, nextInvoiceOn);

    if (m.scenario === "waived") {
      await upsertFeeWaiver({ orgId: m.orgId, monthsLeft: 3, reason: "Seed: promo months" });
    }
  }

  console.log(`Missed-invoice seeds ready (${merchants.length} "${NAME_PREFIX}" merchants):`);
  for (const [scenario, n] of Object.entries(counters)) {
    console.log(`  ${SCENARIO_LABEL[scenario].padEnd(9)} ${n}`);
  }
  console.log(
    `\nExpected in a ${ymdDaysAgo(92)} → ${ymdDaysAgo(0)} search: ` +
      `${expected.creatable} creatable, ${expected.blocked} blocked, ` +
      `${expected.cancelled} previously cancelled. Billed merchants never appear.`,
  );
  console.log(
    "Service Bills → More → Find missed invoice. The daily job creates stuck bills at 00:00 UTC; re-run to reset.",
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => closePool());
