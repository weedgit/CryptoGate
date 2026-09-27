/**
 * Postgres integration — waive platform fee / waive activation lists.
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
import { createRecurringInvoiceForMerchant } from "../src/service-bills/daily-invoice.mjs";
import { findFeeWaiver, upsertFeeWaiver } from "../src/service-bills/billing-waiver-store.mjs";
import {
  apiFetch,
  closePool,
  hasPostgres,
  runMigrations,
  startTestServer,
  stopTestServer,
} from "./helpers/postgres-integration.mjs";

const describePg = hasPostgres() ? describe : describe.skip;

describePg("billing waive lists (Postgres integration)", () => {
  /** @type {import("node:http").Server} */
  let server;
  let base = "";
  let token = "";
  let platformId = "";
  const prefix = `bw-${randomUUID().slice(0, 6)}`;

  async function merchant(name) {
    const created = await insertOrgAccount({
      type: "merchant",
      name: `${prefix}-${name}`,
      parentId: platformId,
      maxAgentDepth: null,
    });
    return created.row.id;
  }

  /** Anchored merchant whose next monthly invoice is due on `invoiceOn`. */
  async function anchoredMerchant(name, invoiceOn) {
    const orgId = await merchant(name);
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

  before(async () => {
    runMigrations();
    let platform = await findPlatformOrg();
    if (!platform) {
      const created = await insertOrgAccount({
        type: "platform",
        name: "Waiver Test Platform",
        parentId: null,
        maxAgentDepth: 1,
      });
      platform = created.row;
    }
    platformId = platform.id;
    const u = await createUser({ email: `${prefix}@bw.test`, password: "WaiverTest12!" });
    await insertMembership({ orgId: platform.id, userId: u.id, role: "owner" });
    token = (await createSession({ userId: u.id, mfaVerified: true })).token;
    ({ server, base } = await startTestServer());
  });

  after(async () => {
    if (server) await stopTestServer(server);
    await closePool();
  });

  it("monthly bills are saved as waived N of M, then billing resumes", async () => {
    const orgId = await anchoredMerchant("fee", "2026-06-05");
    await upsertFeeWaiver({ orgId, monthsLeft: 2, reason: "Pilot" });

    const first = await createRecurringInvoiceForMerchant(
      await findMerchantCommercial(orgId),
      { autoSend: true },
    );
    assert.equal(first.ok, true);
    assert.equal(first.bill.status, "waived");
    assert.equal(first.bill.close_reason, "Waived 1 of 2 — Pilot");
    assert.ok(first.bill.waived_at);
    assert.equal((await findFeeWaiver(orgId)).months_used, 1);

    const second = await createRecurringInvoiceForMerchant(
      await findMerchantCommercial(orgId),
      { autoSend: true },
    );
    assert.equal(second.bill.status, "waived");
    assert.equal(second.bill.close_reason, "Waived 2 of 2 — Pilot");
    assert.equal(await findFeeWaiver(orgId), null);

    const third = await createRecurringInvoiceForMerchant(
      await findMerchantCommercial(orgId),
      { autoSend: true },
    );
    assert.equal(third.bill.status, "issued");
  });

  it("editing months left keeps used months for the N of M label", async () => {
    const orgId = await anchoredMerchant("edit", "2026-06-05");
    await upsertFeeWaiver({ orgId, monthsLeft: 1, reason: "Pilot" });
    await createRecurringInvoiceForMerchant(await findMerchantCommercial(orgId), {
      autoSend: true,
    });
    assert.equal(await findFeeWaiver(orgId), null);

    const put = await apiFetch(base, `/v1/billing-waivers/fee/${orgId}`, {
      method: "PUT",
      token,
      body: { monthsLeft: 3, reason: "Extended pilot" },
    });
    assert.equal(put.status, 200);
    assert.equal(put.json.monthsLeft, 3);
    const edit = await apiFetch(base, `/v1/billing-waivers/fee/${orgId}`, {
      method: "PUT",
      token,
      body: { monthsLeft: 2, reason: "Extended pilot" },
    });
    assert.equal(edit.json.monthsLeft, 2);
    assert.equal(edit.json.monthsGranted, 2);
  });

  it("activation waiver: listed until setup, or waives an open activation bill now", async () => {
    const pending = await merchant("act-pending");
    await insertMerchantCommercial({ orgId: pending, tier: "small", volumeFeePercent: "1.0" });
    const listed = await apiFetch(base, `/v1/billing-waivers/activation/${pending}`, {
      method: "PUT",
      token,
      body: { reason: "Referral" },
    });
    assert.equal(listed.status, 200);
    assert.equal(listed.json.activated, false);
    const list = await apiFetch(base, "/v1/billing-waivers", { token });
    assert.ok(list.json.activation.some((w) => w.orgId === pending));

    const commercial = await apiFetch(base, `/v1/orgs/${pending}/commercial`, { token });
    assert.equal(commercial.json.activationWaived, true);

    const open = await merchant("act-open");
    await insertMerchantCommercial({ orgId: open, tier: "small", volumeFeePercent: "1.0" });
    const { rows } = await getPool().query(
      `INSERT INTO service_bills (
         org_id, period_start, period_end, subscription_amount, volume_fee_amount,
         total_amount, currency, status, due_at, bill_kind
       ) VALUES ($1, CURRENT_DATE, CURRENT_DATE, '49.00', '0.00', '49.00', 'USD',
                 'issued', now() + interval '7 days', 'activation')
       RETURNING id`,
      [open],
    );
    const now = await apiFetch(base, `/v1/billing-waivers/activation/${open}`, {
      method: "PUT",
      token,
      body: { reason: "Referral" },
    });
    assert.equal(now.status, 200);
    assert.equal(now.json.activated, true);
    const bill = await apiFetch(base, `/v1/service-bills/${rows[0].id}`, { token });
    assert.equal(bill.json.status, "waived");
    assert.equal(bill.json.closeReason, "Activation waived — Referral");
    const anchored = await findMerchantCommercial(open);
    assert.ok(anchored.billing_anchor_at);

    const again = await apiFetch(base, `/v1/billing-waivers/activation/${open}`, {
      method: "PUT",
      token,
      body: { reason: "Referral" },
    });
    assert.equal(again.status, 409);
  });
});
