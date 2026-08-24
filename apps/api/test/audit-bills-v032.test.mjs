import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ServiceBillStatus, ServiceBillUpdateAction } from "@cryptogate/domain";
import {
  applyUsdAdjustment,
  validateUpdateServiceBillBody,
  toServiceBill,
} from "../src/service-bills/service-bill-rules.mjs";
import {
  parseAuditActionFilter,
  parseAuditLimit,
} from "../src/audit/audit-list-rules.mjs";
import {
  auditListScope,
  canUpdateServiceBill,
} from "../src/orgs/role-policy.mjs";

describe("service bill update rules (v0.3.2)", () => {
  it("mark_paid from issued/overdue only", () => {
    const ok = validateUpdateServiceBillBody(
      { action: ServiceBillUpdateAction.MarkPaid },
      ServiceBillStatus.Issued,
    );
    assert.equal(ok.ok, true);

    const bad = validateUpdateServiceBillBody(
      { action: ServiceBillUpdateAction.MarkPaid },
      ServiceBillStatus.Paid,
    );
    assert.equal(bad.ok, false);
    assert.equal(bad.status, 422);
  });

  it("void from issued only", () => {
    const ok = validateUpdateServiceBillBody(
      { action: ServiceBillUpdateAction.Void, reason: "duplicate" },
      ServiceBillStatus.Issued,
    );
    assert.equal(ok.ok, true);

    const bad = validateUpdateServiceBillBody(
      { action: ServiceBillUpdateAction.Void, reason: "late" },
      ServiceBillStatus.Overdue,
    );
    assert.equal(bad.ok, false);
  });

  it("adjust applies signed delta and rejects negative total", () => {
    assert.equal(applyUsdAdjustment("61.50", "-10.00"), "51.50");
    assert.throws(() => applyUsdAdjustment("5.00", "-10.00"));
  });

  it("maps lifecycle columns on GET shape", () => {
    const bill = toServiceBill({
      id: "b1",
      org_id: "m1",
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      subscription_amount: "49.00",
      volume_fee_amount: "12.50",
      total_amount: "61.50",
      currency: "USD",
      status: "paid",
      due_at: new Date("2026-09-15T00:00:00.000Z"),
      paid_at: new Date("2026-09-10T12:00:00.000Z"),
      last_adjustment_reason: "credit",
    });
    assert.equal(bill.paidAt, "2026-09-10T12:00:00.000Z");
    assert.equal(bill.lastAdjustmentReason, "credit");
  });
});

describe("audit list rules (v0.3.2)", () => {
  it("validates action and limit", () => {
    assert.equal(parseAuditActionFilter("login").ok, true);
    assert.equal(parseAuditActionFilter("nope").ok, false);
    assert.equal(parseAuditLimit("500").ok, true);
    assert.equal(parseAuditLimit("501").ok, false);
  });

  it("scopes audit list; PATCH platform-only", () => {
    assert.equal(
      auditListScope({
        platformOperator: true,
        memberships: [{ orgId: "p", role: "owner", orgType: "platform" }],
      }).kind,
      "all",
    );
    assert.equal(
      auditListScope({
        platformOperator: false,
        memberships: [{ orgId: "m", role: "cashier", orgType: "merchant" }],
      }).kind,
      "none",
    );
    assert.equal(canUpdateServiceBill({ platformOperator: false }), false);
    assert.equal(canUpdateServiceBill({ platformOperator: true }), true);
  });
});
