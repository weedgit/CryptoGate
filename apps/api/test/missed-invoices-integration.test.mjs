/**
 * Postgres integration — Service Bills → Find missed invoice.
 * Skipped when DATABASE_URL is unset.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createSession } from "../src/auth/sessions.mjs";
import { createUser } from "../src/auth/users.mjs";
import { getPool } from "../src/db/pool.mjs";
import { insertMembership } from "../src/orgs/membership-store.mjs";
import { findPlatformOrg, insertOrgAccount } from "../src/orgs/org-store.mjs";
import {
  findMerchantCommercial,
  insertMerchantCommercial,
} from "../src/commercial/merchant-commercial-store.mjs";
import {
  apiFetch,
  closePool,
  hasPostgres,
  runMigrations,
  startTestServer,
  stopTestServer,
} from "./helpers/postgres-integration.mjs";

const describePg = hasPostgres() ? describe : describe.skip;

/** UTC YYYY-MM-DD, `days` from today. */
function ymd(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** @param {unknown} v Postgres DATE as string or Date */
function day(v) {
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
}

describePg("find missed invoices (Postgres integration)", () => {
  /** @type {import("node:http").Server} */
  let server;
  let base = "";
  let token = "";
  let platformId = "";
  const prefix = `mi-${randomUUID().slice(0, 6)}`;

  /** Merchant whose schedule says the next invoice is `invoiceOn`. */
  async function scheduledMerchant(name, invoiceOn) {
    const created = await insertOrgAccount({
      type: "merchant",
      name: `${prefix}-${name}`,
      parentId: platformId,
      maxAgentDepth: null,
    });
    const orgId = created.row.id;
    await insertMerchantCommercial({ orgId, tier: "small", volumeFeePercent: "1.0" });
    await getPool().query(
      `UPDATE merchant_commercial
       SET billing_anchor_at = $2::date - interval '1 month',
           volume_period_start = $2::date - interval '1 month',
           next_invoice_on = $2::date
       WHERE org_id = $1`,
      [orgId, invoiceOn],
    );
    return orgId;
  }

  async function search(from, to) {
    const res = await apiFetch(base, `/v1/service-bills/missed?from=${from}&to=${to}`, {
      token,
    });
    assert.equal(res.status, 200);
    return res.json.missed.filter((m) => String(m.orgName).startsWith(prefix));
  }

  function create(orgId, periodStart) {
    return apiFetch(base, "/v1/service-bills/missed", {
      method: "POST",
      token,
      body: { orgId, periodStart },
    });
  }

  before(async () => {
    runMigrations();
    let platform = await findPlatformOrg();
    if (!platform) {
      const created = await insertOrgAccount({
        type: "platform",
        name: "Missed Invoice Test Platform",
        parentId: null,
        maxAgentDepth: 1,
      });
      platform = created.row;
    }
    platformId = platform.id;
    const u = await createUser({ email: `${prefix}@mi.test`, password: "MissedTest12!" });
    await insertMembership({ orgId: platform.id, userId: u.id, role: "owner" });
    token = (await createSession({ userId: u.id, mfaVerified: true })).token;
    ({ server, base } = await startTestServer());
  });

  after(async () => {
    if (server) await stopTestServer(server);
    await closePool();
  });

  it("rejects ranges past today or longer than 92 days", async () => {
    const future = await apiFetch(
      base,
      `/v1/service-bills/missed?from=${ymd(-2)}&to=${ymd(1)}`,
      { token },
    );
    assert.equal(future.status, 422);
    const long = await apiFetch(
      base,
      `/v1/service-bills/missed?from=${ymd(-100)}&to=${ymd(0)}`,
      { token },
    );
    assert.equal(long.status, 422);
  });

  it("lists a stuck schedule, creates it once, and advances the schedule", async () => {
    const orgId = await scheduledMerchant("stuck", ymd(-2));
    const rows = (await search(ymd(-3), ymd(0))).filter((m) => m.orgId === orgId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].invoiceOn, ymd(-2));
    assert.equal(rows[0].blocker, null);
    assert.equal(rows[0].previouslyCancelled, false);
    assert.ok(rows[0].estimate);

    const created = await create(orgId, rows[0].periodStart);
    assert.equal(created.status, 201);
    assert.equal(created.json.periodStart, rows[0].periodStart);
    // Pay within (default 7 days) counts from today, not the missed day.
    assert.equal(created.json.dueAt.slice(0, 10), ymd(7));
    const commercial = await findMerchantCommercial(orgId);
    assert.notEqual(day(commercial.next_invoice_on), ymd(-2));

    const again = await create(orgId, rows[0].periodStart);
    assert.equal(again.status, 409);
    const after = (await search(ymd(-3), ymd(0))).filter((m) => m.orgId === orgId);
    assert.equal(after.length, 0);
  });

  it("walks a multi-month gap; later months wait for the earlier one", async () => {
    const orgId = await scheduledMerchant("gap", ymd(-40));
    const rows = (await search(ymd(-45), ymd(0))).filter((m) => m.orgId === orgId);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].blocker, null);
    assert.equal(rows[1].blocker, "earlier_first");
    assert.equal(rows[1].earlierInvoiceOn, rows[0].invoiceOn);

    assert.equal((await create(orgId, rows[1].periodStart)).status, 422);
    assert.equal((await create(orgId, rows[0].periodStart)).status, 201);
    const next = (await search(ymd(-45), ymd(0))).filter((m) => m.orgId === orgId);
    assert.equal(next.length, 1);
    assert.equal(next[0].blocker, null);
    assert.equal((await create(orgId, next[0].periodStart)).status, 201);
  });

  it("skips periods that already have a paid or waived bill", async () => {
    for (const status of ["paid", "waived"]) {
      const orgId = await scheduledMerchant(`has-${status}`, ymd(-2));
      const commercial = await findMerchantCommercial(orgId);
      await getPool().query(
        `INSERT INTO service_bills (
           org_id, period_start, period_end, subscription_amount, volume_fee_amount,
           total_amount, currency, status, due_at, bill_kind
         ) VALUES ($1, $2::date, $3::date, '49.00', '0.00', '49.00', 'USD',
                   $4, now(), 'monthly')`,
        [orgId, commercial.volume_period_start, ymd(-3), status],
      );
      const rows = (await search(ymd(-3), ymd(0))).filter((m) => m.orgId === orgId);
      assert.equal(rows.length, 0, status);
      const periodStart = day(commercial.volume_period_start);
      assert.equal((await create(orgId, periodStart)).status, 409, status);
    }
  });

  it("flags a period whose only bill was cancelled, without moving the schedule", async () => {
    const orgId = await scheduledMerchant("cancelled", ymd(20));
    const periodStart = ymd(-33);
    await getPool().query(
      `INSERT INTO service_bills (
         org_id, period_start, period_end, subscription_amount, volume_fee_amount,
         total_amount, currency, status, due_at, bill_kind, cancelled_at
       ) VALUES ($1, $2::date, $3::date, '49.00', '0.00', '49.00', 'USD',
                 'cancelled', now(), 'monthly', now())`,
      [orgId, periodStart, ymd(-3)],
    );
    const rows = (await search(ymd(-3), ymd(0))).filter((m) => m.orgId === orgId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].previouslyCancelled, true);
    assert.equal(rows[0].invoiceOn, ymd(-2));

    const created = await create(orgId, periodStart);
    assert.equal(created.status, 201);
    const commercial = await findMerchantCommercial(orgId);
    assert.equal(day(commercial.next_invoice_on), ymd(20));
    assert.equal((await create(orgId, periodStart)).status, 409);
  });
});
