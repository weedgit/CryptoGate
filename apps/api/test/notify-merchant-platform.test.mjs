import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CASHIER_NOTIFICATION_EVENT_TYPES,
  NOTIFICATION_EVENT_TYPES,
  PLATFORM_NOTIFICATION_EVENT_TYPES,
  defaultEmailFor,
  mergeNotificationPreferences,
  notificationEventTypesForOrgType,
  validateNotificationPrefsBody,
} from "../src/notifications/notification-rules.mjs";
import {
  buildNotificationEmail,
  claimWebhookFailureSlot,
  resetWebhookFailureThrottle,
} from "../src/notifications/notify.mjs";

describe("merchant + platform notification rules", () => {
  it("gives platform orgs their own event list", () => {
    assert.equal(notificationEventTypesForOrgType("platform"), PLATFORM_NOTIFICATION_EVENT_TYPES);
    assert.equal(notificationEventTypesForOrgType("platform", "viewer"), PLATFORM_NOTIFICATION_EVENT_TYPES);
    assert.ok(PLATFORM_NOTIFICATION_EVENT_TYPES.includes("platform_bill_overdue"));
    assert.ok(PLATFORM_NOTIFICATION_EVENT_TYPES.includes("platform_system_health"));
  });

  it("keeps payment-completed email opt-in; everything else defaults on", () => {
    assert.equal(defaultEmailFor("payment_completed"), false);
    for (const t of NOTIFICATION_EVENT_TYPES.filter((e) => e !== "payment_completed")) {
      assert.equal(defaultEmailFor(t), true, t);
    }
    const merged = mergeNotificationPreferences(new Map(), NOTIFICATION_EVENT_TYPES);
    assert.equal(merged.find((r) => r.eventType === "payment_completed").email, false);
    assert.equal(merged.find((r) => r.eventType === "payment_completed").inApp, true);
    const filled = validateNotificationPrefsBody(
      { items: [{ eventType: "payment_anomaly", email: false, inApp: true }] },
      CASHIER_NOTIFICATION_EVENT_TYPES,
    );
    assert.equal(filled.ok, true);
    assert.equal(filled.items.find((r) => r.eventType === "payment_completed").email, false);
  });
});

describe("notification email body", () => {
  it("links to the right portal and its Alerts tab", () => {
    const merchant = buildNotificationEmail("merchant", {
      subject: "Payment completed — order 1001",
      lines: ["Order 1001 is completed."],
      path: "orders/abc",
    });
    assert.equal(merchant.subject, "PaymentGate — Payment completed — order 1001");
    assert.match(merchant.text, /Order 1001 is completed\./);
    assert.match(merchant.text, /Open: .*\/orders\/abc/);
    assert.match(merchant.text, /change these emails in Alerts: .*\/settings\/notifications/);
  });
});

describe("webhook failure email throttle", () => {
  it("allows one email per endpoint per hour", () => {
    resetWebhookFailureThrottle();
    const t0 = 1_000_000;
    assert.equal(claimWebhookFailureSlot("wh-1", t0), true);
    assert.equal(claimWebhookFailureSlot("wh-1", t0 + 59 * 60_000), false);
    assert.equal(claimWebhookFailureSlot("wh-2", t0 + 1), true);
    assert.equal(claimWebhookFailureSlot("wh-1", t0 + 60 * 60_000), true);
  });
});
