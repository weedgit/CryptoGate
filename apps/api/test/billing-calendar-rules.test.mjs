import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  defaultActivationDueAt,
  merchantInvoiceDueAt,
  merchantPayDueAtForPeriod,
  validateUpdateBillingCalendarBody,
} from "../src/platform-settings/billing-calendar-rules.mjs";
import {
  parseServiceBillStatusFilter,
  validateUpdateServiceBillBody,
} from "../src/service-bills/service-bill-rules.mjs";
import { ServiceBillStatus, ServiceBillUpdateAction } from "@paymentgate/domain";

describe("billing calendar rules", () => {
  it("validates owner calendar body", () => {
    const ok = validateUpdateBillingCalendarBody({
      merchantPayDayStart: 5,
      merchantPayDayEnd: 10,
      agentPayDayStart: 10,
      agentPayDayEnd: 15,
      activationFeeUsd: "49.00",
      activationPayDays: 7,
      autoSendInvoices: false,
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.merchantPayDayEnd, 10);
    assert.equal(ok.activationFeeUsd, "49.00");

    const badWindow = validateUpdateBillingCalendarBody({
      merchantPayDayStart: 12,
      merchantPayDayEnd: 10,
      agentPayDayStart: 10,
      agentPayDayEnd: 15,
      activationFeeUsd: "49.00",
      activationPayDays: 7,
      autoSendInvoices: true,
    });
    assert.equal(badWindow.ok, false);
  });

  it("computes merchant pay-by for period end → next month window (legacy)", () => {
    const due = merchantPayDueAtForPeriod("2026-02-28", 10);
    assert.match(due, /^2026-03-10T/);
  });

  it("merchantInvoiceDueAt matches activation clock and ignores legacy window", () => {
    const from = new Date("2026-03-12T08:00:00.000Z");
    const due = merchantInvoiceDueAt(7, from);
    assert.equal(due, defaultActivationDueAt(7, from));
    assert.match(due, /^2026-03-19T23:59:59/);
    // Legacy calendar day for period would be 2026-04-10 — must not match.
    const legacy = merchantPayDueAtForPeriod("2026-03-31", 10, from);
    assert.match(legacy, /^2026-04-10T/);
    assert.notEqual(due.slice(0, 10), legacy.slice(0, 10));
  });

  it("computes activation due from pay days", () => {
    const from = new Date("2026-03-12T08:00:00.000Z");
    const due = defaultActivationDueAt(7, from);
    assert.match(due, /^2026-03-19T23:59:59/);
  });
});

describe("service bill send / cancel transitions", () => {
  it("allows send from draft only", () => {
    const send = validateUpdateServiceBillBody(
      { action: ServiceBillUpdateAction.Send },
      ServiceBillStatus.Draft,
    );
    assert.equal(send.ok, true);
    const bad = validateUpdateServiceBillBody(
      { action: ServiceBillUpdateAction.Send },
      ServiceBillStatus.Issued,
    );
    assert.equal(bad.ok, false);
  });

  it("allows cancel from draft issued overdue", () => {
    for (const status of [
      ServiceBillStatus.Draft,
      ServiceBillStatus.Issued,
      ServiceBillStatus.Overdue,
    ]) {
      const r = validateUpdateServiceBillBody(
        { action: ServiceBillUpdateAction.Cancel, reason: "ops" },
        status,
      );
      assert.equal(r.ok, true, status);
    }
    const paid = validateUpdateServiceBillBody(
      { action: ServiceBillUpdateAction.Cancel },
      ServiceBillStatus.Paid,
    );
    assert.equal(paid.ok, false);
  });

  it("accepts draft and cancelled status filters", () => {
    assert.equal(parseServiceBillStatusFilter("draft").ok, true);
    assert.equal(parseServiceBillStatusFilter("cancelled").ok, true);
    assert.equal(parseServiceBillStatusFilter("nope").ok, false);
  });
});
