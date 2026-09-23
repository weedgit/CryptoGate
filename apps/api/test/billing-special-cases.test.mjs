import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseMerchantBillingFlagsBody,
  validateUpdateMerchantCommercialBody,
} from "../src/commercial/merchant-commercial-rules.mjs";
import { validateUpdateServiceBillBody } from "../src/service-bills/service-bill-rules.mjs";
import {
  ServiceBillStatus,
  ServiceBillUpdateAction,
} from "@paymentgate/domain";

describe("merchant billing flags", () => {
  it("parses fee exempt / skip activation / credit", () => {
    const ok = parseMerchantBillingFlagsBody({
      feeExemptUntil: "2026-06-30",
      skipActivation: true,
      billingOpsNote: "Partner pilot",
      serviceBillCreditUsd: "25.00",
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.hasBillingFlags, true);
    assert.equal(ok.feeExemptUntil, "2026-06-30");
    assert.equal(ok.skipActivation, true);
    assert.equal(ok.serviceBillCreditUsd, "25.00");
  });

  it("allows flags-only commercial PUT body", () => {
    const ok = validateUpdateMerchantCommercialBody(
      { feeExemptUntil: null, skipActivation: true },
      "small",
    );
    assert.equal(ok.ok, true);
    assert.equal(ok.flagsOnly, true);
    assert.equal(ok.skipActivation, true);
    assert.equal(ok.feeExemptUntil, null);
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
