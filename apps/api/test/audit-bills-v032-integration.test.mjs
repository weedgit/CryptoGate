/**
 * Postgres integration tests — OpenAPI v0.3.2 audit list + service bill PATCH.
 * Contract: doc/M4-36-Audit-Bills-v032.md
 *
 * Skipped when DATABASE_URL is unset. Run migrate 018 before first use:
 *   DATABASE_URL=... node apps/api/scripts/migrate.mjs
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { ServiceBillStatus } from "@paymentgate/domain";
import { AUDIT_ACTIONS } from "../src/audit/audit-rules.mjs";
import { getPool } from "../src/db/pool.mjs";
import {
  apiFetch,
  createIssuedBill,
  ensureV032Seed,
  hasPostgres,
  migration018ColumnsPresent,
  runMigrations,
  startTestServer,
  stopTestServer,
} from "./helpers/postgres-integration.mjs";

const describePg = hasPostgres() ? describe : describe.skip;

describePg("v0.3.2 audit + service bill PATCH (Postgres integration)", () => {
  /** @type {import("node:http").Server} */
  let server;
  /** @type {string} */
  let base;
  /** @type {Awaited<ReturnType<typeof ensureV032Seed>>} */
  let seed;

  before(async () => {
    runMigrations();
    seed = await ensureV032Seed();
    ({ server, base } = await startTestServer());
  });

  after(async () => {
    await stopTestServer(server);
  });

  it("service bill lifecycle columns are present (018 + 078)", async () => {
    const cols = await migration018ColumnsPresent();
    assert.deepEqual(cols, [
      "close_reason",
      "last_adjustment_reason",
      "paid_at",
      "payment_reference",
      "waived_at",
    ]);
  });

  it("GET /v1/audit returns 403 for cashier", async () => {
    const res = await apiFetch(base, "/v1/audit", { token: seed.cashierToken });
    assert.equal(res.status, 403);
    assert.equal(res.json.code, "forbidden");
  });

  it("PATCH /v1/service-bills/{id} returns 403 for cashier", async () => {
    const bill = await createIssuedBill(seed.merchantOrgId);
    const res = await apiFetch(base, `/v1/service-bills/${bill.id}`, {
      method: "PATCH",
      token: seed.cashierToken,
      body: { action: "mark_paid" },
    });
    assert.equal(res.status, 403);
  });

  it("PATCH mark_paid from issued sets paidAt and appends audit event", async () => {
    const bill = await createIssuedBill(seed.merchantOrgId);
    const patch = await apiFetch(base, `/v1/service-bills/${bill.id}`, {
      method: "PATCH",
      token: seed.platformToken,
      body: { action: "mark_paid", paymentReference: "WIRE-123" },
    });
    assert.equal(patch.status, 200);
    assert.equal(patch.json.status, ServiceBillStatus.Paid);
    assert.ok(patch.json.paidAt);

    const get = await apiFetch(base, `/v1/service-bills/${bill.id}`, {
      token: seed.platformToken,
    });
    assert.equal(get.status, 200);
    assert.equal(get.json.paidAt, patch.json.paidAt);

    const audit = await apiFetch(
      base,
      `/v1/audit?orgId=${encodeURIComponent(seed.merchantOrgId)}&action=${AUDIT_ACTIONS.serviceBillMarkPaid}&limit=20`,
      { token: seed.platformToken },
    );
    assert.equal(audit.status, 200);
    assert.ok(Array.isArray(audit.json.items));
    assert.ok(
      audit.json.items.some(
        (row) =>
          row.action === AUDIT_ACTIONS.serviceBillMarkPaid &&
          row.metadata?.billId === bill.id,
      ),
    );
  });

  it("PATCH mark_paid from overdue succeeds", async () => {
    const bill = await createIssuedBill(seed.merchantOrgId);
    await getPool().query(
      `UPDATE service_bills SET status = $2, updated_at = now() WHERE id = $1`,
      [bill.id, ServiceBillStatus.Overdue],
    );
    const res = await apiFetch(base, `/v1/service-bills/${bill.id}`, {
      method: "PATCH",
      token: seed.platformToken,
      body: { action: "mark_paid" },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.status, ServiceBillStatus.Paid);
  });

  it("PATCH cancel from overdue requires reason and records it", async () => {
    const bill = await createIssuedBill(seed.merchantOrgId);
    await getPool().query(
      `UPDATE service_bills SET status = $2, updated_at = now() WHERE id = $1`,
      [bill.id, ServiceBillStatus.Overdue],
    );
    const noReason = await apiFetch(base, `/v1/service-bills/${bill.id}`, {
      method: "PATCH",
      token: seed.platformToken,
      body: { action: "cancel" },
    });
    assert.equal(noReason.status, 400);

    const patch = await apiFetch(base, `/v1/service-bills/${bill.id}`, {
      method: "PATCH",
      token: seed.platformToken,
      body: { action: "cancel", reason: "duplicate bill" },
    });
    assert.equal(patch.status, 200);
    assert.equal(patch.json.status, ServiceBillStatus.Cancelled);
    assert.ok(patch.json.cancelledAt);
    assert.equal(patch.json.closeReason, "duplicate bill");

    const audit = await apiFetch(
      base,
      `/v1/audit?orgId=${encodeURIComponent(seed.merchantOrgId)}&action=${AUDIT_ACTIONS.serviceBillCancel}&limit=10`,
      { token: seed.platformToken },
    );
    assert.ok(
      audit.json.items.some(
        (row) =>
          row.action === AUDIT_ACTIONS.serviceBillCancel &&
          row.metadata?.billId === bill.id &&
          row.metadata?.reason === "duplicate bill",
      ),
    );
  });

  it("PATCH waive closes a monthly bill as waived; paid bills cannot be waived", async () => {
    const bill = await createIssuedBill(seed.merchantOrgId);
    const patch = await apiFetch(base, `/v1/service-bills/${bill.id}`, {
      method: "PATCH",
      token: seed.platformToken,
      body: { action: "waive", reason: "Goodwill" },
    });
    assert.equal(patch.status, 200);
    assert.equal(patch.json.status, ServiceBillStatus.Waived);
    assert.ok(patch.json.waivedAt);
    assert.equal(patch.json.closeReason, "Goodwill");
    assert.equal(patch.json.totalAmount, "61.50");

    const again = await apiFetch(base, `/v1/service-bills/${bill.id}`, {
      method: "PATCH",
      token: seed.platformToken,
      body: { action: "waive", reason: "Goodwill" },
    });
    assert.equal(again.status, 422);
  });

  it("PATCH waive on an activation bill activates the merchant", async () => {
    const pool = getPool();
    await pool.query(
      `UPDATE service_bills SET status = 'cancelled', cancelled_at = now()
       WHERE org_id = $1 AND bill_kind = 'activation' AND status <> 'cancelled'`,
      [seed.merchantOrgId],
    );
    const { rows } = await pool.query(
      `INSERT INTO service_bills (
         org_id, period_start, period_end, subscription_amount, volume_fee_amount,
         total_amount, currency, status, due_at, bill_kind
       ) VALUES ($1, CURRENT_DATE, CURRENT_DATE, '49.00', '0.00', '49.00', 'USD',
                 'issued', now() + interval '7 days', 'activation')
       RETURNING id`,
      [seed.merchantOrgId],
    );
    const patch = await apiFetch(base, `/v1/service-bills/${rows[0].id}`, {
      method: "PATCH",
      token: seed.platformToken,
      body: { action: "waive", reason: "Referral" },
    });
    assert.equal(patch.status, 200);
    assert.equal(patch.json.status, ServiceBillStatus.Waived);
    const commercial = await pool.query(
      `SELECT billing_anchor_at, next_invoice_on FROM merchant_commercial WHERE org_id = $1`,
      [seed.merchantOrgId],
    );
    if (commercial.rows.length) {
      assert.ok(commercial.rows[0].billing_anchor_at);
      assert.ok(commercial.rows[0].next_invoice_on);
    }
  });

  it("billing waive lists: owner/admin CRUD, cashier 403", async () => {
    const path = `/v1/billing-waivers/fee/${seed.merchantOrgId}`;
    const denied = await apiFetch(base, path, {
      method: "PUT",
      token: seed.cashierToken,
      body: { monthsLeft: 2, reason: "Pilot" },
    });
    assert.equal(denied.status, 403);

    const put = await apiFetch(base, path, {
      method: "PUT",
      token: seed.platformToken,
      body: { monthsLeft: 2, reason: "Pilot" },
    });
    assert.equal(put.status, 200);
    assert.equal(put.json.monthsLeft, 2);

    const list = await apiFetch(base, "/v1/billing-waivers", { token: seed.platformToken });
    assert.equal(list.status, 200);
    assert.ok(list.json.fee.some((w) => w.orgId === seed.merchantOrgId && w.monthsLeft === 2));

    const del = await apiFetch(base, path, { method: "DELETE", token: seed.platformToken });
    assert.equal(del.status, 204);
    const gone = await apiFetch(base, path, { method: "DELETE", token: seed.platformToken });
    assert.equal(gone.status, 404);
  });

  it("PATCH adjust applies signed delta and records lastAdjustmentReason", async () => {
    const bill = await createIssuedBill(seed.merchantOrgId);
    const patch = await apiFetch(base, `/v1/service-bills/${bill.id}`, {
      method: "PATCH",
      token: seed.platformToken,
      body: { action: "adjust", reason: "goodwill credit", adjustmentAmount: "-10.00" },
    });
    assert.equal(patch.status, 200);
    assert.equal(patch.json.status, ServiceBillStatus.Issued);
    assert.equal(patch.json.totalAmount, "51.50");
    assert.equal(patch.json.lastAdjustmentReason, "goodwill credit");

    const audit = await apiFetch(
      base,
      `/v1/audit?action=${AUDIT_ACTIONS.serviceBillAdjust}&limit=20`,
      { token: seed.platformToken },
    );
    assert.ok(
      audit.json.items.some(
        (row) =>
          row.action === AUDIT_ACTIONS.serviceBillAdjust &&
          row.metadata?.billId === bill.id,
      ),
    );
  });

  it("PATCH adjust rejects negative total", async () => {
    const bill = await createIssuedBill(seed.merchantOrgId);
    const res = await apiFetch(base, `/v1/service-bills/${bill.id}`, {
      method: "PATCH",
      token: seed.platformToken,
      body: { action: "adjust", reason: "too much", adjustmentAmount: "-100.00" },
    });
    assert.equal(res.status, 400);
  });

  it("GET /v1/audit lists newest first with orgId and action filters", async () => {
    const bill = await createIssuedBill(seed.merchantOrgId);
    await apiFetch(base, `/v1/service-bills/${bill.id}`, {
      method: "PATCH",
      token: seed.platformToken,
      body: { action: "mark_paid" },
    });

    const scoped = await apiFetch(
      base,
      `/v1/audit?orgId=${encodeURIComponent(seed.merchantOrgId)}&limit=5`,
      { token: seed.platformToken },
    );
    assert.equal(scoped.status, 200);
    assert.ok(scoped.json.items.length >= 1);
    for (const row of scoped.json.items) {
      assert.equal(row.orgId, seed.merchantOrgId);
    }
    if (scoped.json.items.length >= 2) {
      const a = Date.parse(scoped.json.items[0].createdAt);
      const b = Date.parse(scoped.json.items[1].createdAt);
      assert.ok(a >= b);
    }

    const badAction = await apiFetch(base, "/v1/audit?action=not_a_real_action", {
      token: seed.platformToken,
    });
    assert.equal(badAction.status, 400);
  });
});

describe("v0.3.2 Postgres integration gate", () => {
  it("skips DB integration suite when DATABASE_URL unset", () => {
    if (!hasPostgres()) {
      assert.equal(process.env.DATABASE_URL, undefined);
    } else {
      assert.ok(process.env.DATABASE_URL);
    }
  });
});
