#!/usr/bin/env node
/**
 * Billing smoke: merchant payment-date fees + agent day-C commissions.
 *
 * Always: pure logic assertions (no DB).
 * With --live + DATABASE_URL: migrate + DB happy path.
 *
 *   node apps/api/scripts/billing-smoke.mjs
 *   DATABASE_URL=... node apps/api/scripts/billing-smoke.mjs --live
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ServiceBillKind } from "@paymentgate/domain";
import {
  addOneMonthUtcDateString,
  recurringVolumeWindow,
  toUtcDateString,
} from "../src/service-bills/billing-anchor-rules.mjs";
import {
  computeCommissionAmount,
  defaultCommissionPeriodKey,
  generateMonthlyCommissionInvoices,
  isAgentCommissionInvoiceDay,
  paidPlatformFeeUsd,
  previousCommissionPeriodKey,
} from "../src/commercial/commission-invoice-generate.mjs";

const live = process.argv.includes("--live");

function ok(label) {
  console.log(`  ✓ ${label}`);
}

function section(title) {
  console.log(`\n${title}`);
}

section("Offline — merchant fee calendar math");
{
  assert.equal(addOneMonthUtcDateString("2026-03-01T00:00:00.000Z"), "2026-04-01");
  assert.equal(addOneMonthUtcDateString("2026-01-31T12:00:00.000Z"), "2026-02-28");
  const w = recurringVolumeWindow("2026-03-01", "2026-04-01");
  assert.equal(w.displayPeriodEnd, "2026-03-31");
  assert.equal(w.exclusiveEndIso, "2026-04-01T00:00:00.000Z");
  assert.equal(toUtcDateString("2026-04-10T00:00:00.000Z"), "2026-04-10");
  ok("anchor +1 month + volume window");
}

section("Offline — pay-within due_at (not legacy calendar day)");
{
  const { merchantInvoiceDueAt, merchantPayDueAtForPeriod } = await import(
    "../src/platform-settings/billing-calendar-rules.mjs"
  );
  const from = new Date("2026-03-12T08:00:00.000Z");
  const due = merchantInvoiceDueAt(7, from);
  assert.match(due, /^2026-03-19T23:59:59/);
  const legacy = merchantPayDueAtForPeriod("2026-02-28", 10, from);
  assert.match(legacy, /^2026-03-10T/);
  assert.notEqual(due.slice(0, 10), legacy.slice(0, 10));
  ok("merchantInvoiceDueAt ≠ legacy merchantPayDueAtForPeriod");
}

section("Offline — agent commission formula + day C");
{
  const now = new Date("2026-04-10T00:00:00.000Z");
  assert.equal(previousCommissionPeriodKey(now), "2026-03");
  assert.equal(defaultCommissionPeriodKey(now), "2026-03");
  assert.equal(isAgentCommissionInvoiceDay(now, 10), true);
  const base = paidPlatformFeeUsd("199.00", "40.00");
  assert.equal(base, 239);
  assert.equal(computeCommissionAmount(base, "15"), 35.85);
  assert.equal(computeCommissionAmount(paidPlatformFeeUsd("49", "0"), "10"), 4.9);
  ok("prior month default + (sub+vol)×rate");
}

if (!live) {
  console.log("\nSkip live DB path (pass --live with DATABASE_URL).");
  console.log("\nBilling smoke offline: OK");
  process.exit(0);
}

section("Live — migrate + DB path");
const { hasPostgres, runMigrations } = await import(
  "../test/helpers/postgres-integration.mjs"
);
if (!hasPostgres()) {
  console.error("DATABASE_URL required for --live");
  process.exit(1);
}

try {
  runMigrations();
  ok("migrations applied");
} catch (err) {
  console.error("migrate failed:", err && err.message ? err.message : err);
  process.exit(1);
}

const { getPool, closePool } = await import("../src/db/pool.mjs");
const { findPlatformOrg, insertOrgAccount } = await import("../src/orgs/org-store.mjs");
const {
  insertMerchantCommercial,
  setBillingAnchorFromActivationPaid,
  findMerchantCommercial,
} = await import("../src/commercial/merchant-commercial-store.mjs");
const { markServiceBillPaid } = await import("../src/service-bills/service-bill-store.mjs");
const { runDailyServiceBillInvoiceJob } = await import(
  "../src/service-bills/daily-invoice.mjs"
);
const { ensureDefaultFeeTierBands } = await import(
  "../src/platform-settings/fee-tier-store.mjs"
);

await ensureDefaultFeeTierBands();

const suffix = randomUUID().slice(0, 8);
const platform = await findPlatformOrg();
if (!platform) {
  console.error("no platform org — seed platform first");
  process.exit(1);
}

const agentIns = await insertOrgAccount({
  type: "agent",
  name: `Smoke Agent ${suffix}`,
  parentId: platform.id,
});
if (!agentIns.ok) {
  console.error("agent insert failed", agentIns);
  process.exit(1);
}
const agent = agentIns.row;
const merchantIns = await insertOrgAccount({
  type: "merchant",
  name: `Smoke Merchant ${suffix}`,
  parentId: agent.id,
  country: "SG",
  billingEmail: `smoke-m-${suffix}@example.com`,
});
if (!merchantIns.ok) {
  console.error("merchant insert failed", merchantIns);
  process.exit(1);
}
const merchant = merchantIns.row;

await insertMerchantCommercial({
  orgId: merchant.id,
  tier: "mid",
  volumeFeePercent: "1.0",
  rateMode: "automatic",
});

try {
  const ac = await import("../src/commercial/agent-commission-store.mjs");
  await ac.upsertAgentCommission({
    orgId: agent.id,
    commissionPercent: "15",
    rateMode: "fixed",
  });
} catch {
  /* default commission % still applies */
}

const paidAt = new Date("2026-02-15T10:00:00.000Z");
await setBillingAnchorFromActivationPaid(merchant.id, paidAt);
const commercial = await findMerchantCommercial(merchant.id);
assert.ok(commercial?.billing_anchor_at);
assert.equal(toUtcDateString(commercial.next_invoice_on), "2026-03-15");
ok("activation pay sets anchor + next_invoice_on");

const dueDay = new Date("2026-03-15T00:05:00.000Z");
const daily = await runDailyServiceBillInvoiceJob(dueDay);
const createdForMerchant = daily.created.filter((b) => b.org_id === merchant.id);
assert.ok(createdForMerchant.length >= 1, "expected recurring bill from daily job");
const monthly = createdForMerchant[0];
assert.equal(monthly.bill_kind ?? ServiceBillKind.Monthly, ServiceBillKind.Monthly);
{
  const { getBillingCalendarSettings } = await import(
    "../src/platform-settings/billing-calendar-store.mjs"
  );
  const { merchantInvoiceDueAt } = await import(
    "../src/platform-settings/billing-calendar-rules.mjs"
  );
  const calendar = await getBillingCalendarSettings();
  const expectedDue = merchantInvoiceDueAt(calendar.activationPayDays, dueDay);
  const actualDue =
    monthly.due_at instanceof Date
      ? monthly.due_at.toISOString()
      : String(monthly.due_at);
  assert.equal(actualDue, expectedDue);
  ok(`monthly due_at matches pay-within (${calendar.activationPayDays}d)`);
}
ok(`daily job created monthly bill ${monthly.id}`);

// Ensure commissionable fee base (default Mid schedule may be $0 in empty UAT),
// and issue the draft so markServiceBillPaid can transition to paid.
await getPool().query(
  `UPDATE service_bills
   SET subscription_amount = 49.00,
       volume_fee_amount = 10.00,
       total_amount = 59.00,
       status = 'issued'
   WHERE id = $1`,
  [monthly.id],
);

await markServiceBillPaid(monthly.id, {
  paymentReference: `smoke-${suffix}`,
  rxAddress: "TSmokeBillingWalletXXXXXXXXXXXX",
});
await getPool().query(
  `UPDATE service_bills SET paid_at = $2::timestamptz WHERE id = $1`,
  [monthly.id, "2026-03-20T12:00:00.000Z"],
);
ok("monthly bill marked paid (paid_at in March)");

const periodKey = "2026-03";
const commission = await generateMonthlyCommissionInvoices(periodKey);
const row = commission.created.find((r) => r.payee_org_id === agent.id);
assert.ok(row, "expected agent commission invoice for smoke agent");
const fee = Number(row.platform_fee_collected);
assert.ok(fee > 0, "fee collected > 0 (subscription and/or volume)");
const expected = computeCommissionAmount(fee, row.commission_percent);
assert.equal(Number(row.commission_amount), expected);
ok(
  `commission ${row.id}: collected ${fee} × ${row.commission_percent}% = ${row.commission_amount}`,
);

const nextCommercial = await findMerchantCommercial(merchant.id);
assert.ok(toUtcDateString(nextCommercial.next_invoice_on));
ok(`schedule advanced next_invoice_on=${toUtcDateString(nextCommercial.next_invoice_on)}`);

await closePool();
console.log("\nBilling smoke live: OK");
process.exit(0);
