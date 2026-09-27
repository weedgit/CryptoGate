import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseMerchantBillingFlagsBody,
  toMerchantCommercialSettings,
  validateUpdateMerchantCommercialBody,
} from "../src/commercial/merchant-commercial-rules.mjs";
import {
  activationWaiverCloseReason,
  feeWaiverCloseReason,
  toFeeWaiver,
  validateActivationWaiverBody,
  validateFeeWaiverBody,
} from "../src/service-bills/billing-waiver-rules.mjs";
import { validateUpdateServiceBillBody } from "../src/service-bills/service-bill-rules.mjs";
import {
  ServiceBillStatus,
  ServiceBillUpdateAction,
} from "@paymentgate/domain";

describe("merchant billing flags", () => {
  it("parses next-period credit only; waivers moved to the waive lists", () => {
    const ok = parseMerchantBillingFlagsBody({ serviceBillCreditUsd: "25.00" });
    assert.equal(ok.ok, true);
    assert.equal(ok.hasBillingFlags, true);
    assert.equal(ok.serviceBillCreditUsd, "25.00");
    const legacy = parseMerchantBillingFlagsBody({
      feeExemptUntil: "2026-06-30",
      skipActivation: true,
      billingOpsNote: "Partner pilot",
    });
    assert.equal(legacy.ok, true);
    assert.equal(legacy.hasBillingFlags, false);
  });

  it("allows credit-only commercial PUT body", () => {
    const ok = validateUpdateMerchantCommercialBody(
      { serviceBillCreditUsd: "10.00" },
      "small",
    );
    assert.equal(ok.ok, true);
    assert.equal(ok.flagsOnly, true);
    assert.equal("skipActivation" in ok, false);
  });
});

describe("billing waive lists", () => {
  it("validates platform fee waiver months + reason", () => {
    const ok = validateFeeWaiverBody({ monthsLeft: 3, reason: " Partner pilot " });
    assert.deepEqual(ok, { ok: true, monthsLeft: 3, reason: "Partner pilot" });
    assert.equal(validateFeeWaiverBody({ monthsLeft: 0, reason: "x" }).ok, false);
    assert.equal(validateFeeWaiverBody({ monthsLeft: 1.5, reason: "x" }).ok, false);
    assert.equal(validateFeeWaiverBody({ monthsLeft: 121, reason: "x" }).ok, false);
    assert.equal(validateFeeWaiverBody({ monthsLeft: 2, reason: "  " }).ok, false);
    assert.equal(validateFeeWaiverBody({ monthsLeft: "2", reason: "x" }).ok, false);
  });

  it("validates activation waiver reason", () => {
    assert.equal(validateActivationWaiverBody({ reason: "Referral" }).ok, true);
    assert.equal(validateActivationWaiverBody({}).ok, false);
    assert.equal(validateActivationWaiverBody({ reason: "x".repeat(501) }).ok, false);
  });

  it("labels waived bills N of M", () => {
    assert.equal(
      feeWaiverCloseReason({ months_used: 0, months_granted: 3, reason: "Pilot" }),
      "Waived 1 of 3 — Pilot",
    );
    assert.equal(
      feeWaiverCloseReason({ months_used: 2, months_granted: 3, reason: "Pilot" }),
      "Waived 3 of 3 — Pilot",
    );
    assert.equal(
      activationWaiverCloseReason({ reason: "Referral" }),
      "Activation waived — Referral",
    );
  });

  it("maps months left", () => {
    const w = toFeeWaiver({
      org_id: "m1",
      org_name: "Acme",
      months_granted: 3,
      months_used: 1,
      reason: "Pilot",
      created_at: new Date("2026-09-01T00:00:00.000Z"),
      updated_at: null,
    });
    assert.equal(w.monthsLeft, 2);
    assert.equal(w.orgName, "Acme");
    assert.equal(w.createdAt, "2026-09-01T00:00:00.000Z");
  });

  it("exposes waived months on merchant commercial settings", () => {
    const out = toMerchantCommercialSettings(
      {
        org_id: "m1",
        tier: "small",
        volume_fee_percent: "1.0",
        rate_mode: "automatic",
        effective_from: "2026-09-01",
        service_bill_credit_usd: "0.00",
        billing_anchor_at: null,
        next_invoice_on: null,
      },
      { subscription_amount_usd: "29.00", volume_fee_min_percent: "0.5", volume_fee_max_percent: "2" },
      { waivedMonthsLeft: 2, activationWaived: true },
    );
    assert.equal(out.waivedMonthsLeft, 2);
    assert.equal(out.activationWaived, true);
    assert.equal("feeExemptUntil" in out, false);
    assert.equal("billingOpsNote" in out, false);
  });
});

describe("service bill line adjust + grant credit", () => {
  it("accepts line amount adjust", () => {
    const r = validateUpdateServiceBillBody(
      {
        action: ServiceBillUpdateAction.Adjust,
        reason: "Waiver",
        subscriptionAmount: "0.00",
        volumeFeeAmount: "10.00",
        opsNote: "Merchant requested",
      },
      ServiceBillStatus.Draft,
    );
    assert.equal(r.ok, true);
    assert.equal(r.mode, "lines");
    assert.equal(r.subscriptionAmount, "0.00");
    assert.equal(r.volumeFeeAmount, "10.00");
  });

  it("accepts grant_credit on paid only", () => {
    const ok = validateUpdateServiceBillBody(
      {
        action: ServiceBillUpdateAction.GrantCredit,
        reason: "Overpay",
        creditAmount: "15.00",
      },
      ServiceBillStatus.Paid,
    );
    assert.equal(ok.ok, true);
    const bad = validateUpdateServiceBillBody(
      {
        action: ServiceBillUpdateAction.GrantCredit,
        reason: "Overpay",
        creditAmount: "15.00",
      },
      ServiceBillStatus.Issued,
    );
    assert.equal(bad.ok, false);
  });
});
