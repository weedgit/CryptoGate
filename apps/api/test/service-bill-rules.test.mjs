import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addUsdAmounts,
  checkoutAllowedForBillStatus,
  parseServiceBillStatusFilter,
  serviceBillQrPayload,
  toServiceBill,
  toServiceBillCheckout,
  validateIssueServiceBillBody,
} from "../src/service-bills/service-bill-rules.mjs";
import { ServiceBillStatus } from "@cryptogate/domain";
import {
  canCheckoutServiceBill,
  canIssueServiceBill,
  serviceBillListScope,
} from "../src/orgs/role-policy.mjs";

describe("service-bill rules (M3-16)", () => {
  it("adds USD amounts without float", () => {
    assert.equal(addUsdAmounts("49.00", "12.50"), "61.50");
    assert.equal(addUsdAmounts("0.10", "0.20"), "0.30");
  });

  it("validates issue body and totals", () => {
    const ok = validateIssueServiceBillBody({
      orgId: "11111111-1111-1111-1111-111111111111",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      subscriptionAmount: "49.00",
      volumeFeeAmount: "12.50",
      dueAt: "2026-09-15T00:00:00.000Z",
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.totalAmount, "61.50");

    const bad = validateIssueServiceBillBody({
      orgId: "m1",
      periodStart: "2026-08-31",
      periodEnd: "2026-08-01",
      subscriptionAmount: "49.00",
      volumeFeeAmount: "12.50",
      dueAt: "2026-09-15T00:00:00.000Z",
    });
    assert.equal(bad.ok, false);
  });

  it("maps checkout without PaymentDetails fields", () => {
    const prev = process.env.PLATFORM_BILLING_PAY_TO;
    process.env.PLATFORM_BILLING_PAY_TO = "TPlatformWallet1234567890123456789012";
    try {
      const checkout = toServiceBillCheckout({
        id: "b1",
        total_amount: "61.50",
        currency: "USD",
      });
      assert.equal(checkout.billId, "b1");
      assert.equal(checkout.payTo, "TPlatformWallet1234567890123456789012");
      assert.equal("receiveAddress" in checkout, false);
      assert.equal("paymentPageUrl" in checkout, false);
      assert.match(checkout.instructions, /not a merchant payment order/i);
      assert.match(checkout.qrPayload ?? "", /^tron:TPlatformWallet1234567890123456789012\?/);
    } finally {
      if (prev === undefined) delete process.env.PLATFORM_BILLING_PAY_TO;
      else process.env.PLATFORM_BILLING_PAY_TO = prev;
    }
  });

  it("maps bill rows to OpenAPI shape including invoice snapshot", () => {
    const bill = toServiceBill({
      id: "b1",
      org_id: "o1",
      period_start: new Date("2026-08-01T00:00:00.000Z"),
      period_end: new Date("2026-08-31T00:00:00.000Z"),
      subscription_amount: "49.00",
      volume_fee_amount: "12.50",
      total_amount: "61.50",
      currency: "USD",
      status: "issued",
      due_at: new Date("2026-09-15T00:00:00.000Z"),
      tier: "mid",
      volume_fee_percent: "1.20",
      billed_volume_usd: "1041.67",
      payment_reference: null,
      created_at: new Date("2026-09-01T12:00:00.000Z"),
    });
    assert.equal(bill.periodStart, "2026-08-01");
    assert.equal(bill.status, "issued");
    assert.equal(bill.tier, "mid");
    assert.equal(bill.volumeFeePercent, "1.20");
    assert.equal(bill.billedVolumeUsd, "1041.67");
    assert.equal(bill.createdAt, "2026-09-01T12:00:00.000Z");
  });

  it("parses status filter", () => {
    assert.equal(parseServiceBillStatusFilter("issued").ok, true);
    assert.equal(parseServiceBillStatusFilter("nope").ok, false);
  });

  it("allows checkout for issued/overdue only (M4-13)", () => {
    assert.equal(checkoutAllowedForBillStatus(ServiceBillStatus.Issued), true);
    assert.equal(checkoutAllowedForBillStatus(ServiceBillStatus.Overdue), true);
    assert.equal(checkoutAllowedForBillStatus(ServiceBillStatus.Paid), false);
    assert.equal(checkoutAllowedForBillStatus(ServiceBillStatus.Voided), false);
  });

  it("builds Tron qrPayload for platform billing wallet", () => {
    const uri = serviceBillQrPayload("TPlatformWallet1234567890123456789012", "61.50");
    assert.match(uri ?? "", /^tron:TPlatform/);
    assert.equal(serviceBillQrPayload("not-tron", "1.00"), null);
  });
});

describe("service-bill role scope", () => {
  it("lets only platform operators issue", () => {
    assert.equal(canIssueServiceBill({ platformOperator: true }), true);
    assert.equal(canIssueServiceBill({ platformOperator: false }), false);
  });

  it("denies cashiers on list scope", () => {
    const scope = serviceBillListScope({
      platformOperator: false,
      memberships: [
        { orgId: "m1", role: "cashier", orgType: "merchant" },
      ],
    });
    assert.equal(scope.kind, "none");
  });

  it("allows merchant owner checkout and denies cashier", () => {
    const org = { id: "m1", type: "merchant" };
    assert.equal(
      canCheckoutServiceBill(
        {
          platformOwner: false,
          memberships: [{ orgId: "m1", role: "owner" }],
        },
        org,
      ),
      true,
    );
    assert.equal(
      canCheckoutServiceBill(
        {
          platformOwner: false,
          memberships: [{ orgId: "m1", role: "cashier" }],
        },
        org,
      ),
      false,
    );
  });
});
