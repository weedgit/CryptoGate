import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AGENT_NOTIFICATION_EVENT_TYPES,
  CASHIER_NOTIFICATION_EVENT_TYPES,
  NOTIFICATION_EVENT_TYPES,
  mergeNotificationPreferences,
  notificationEventTypesForOrgType,
  validateNotificationPrefsBody,
} from "../src/notifications/notification-rules.mjs";

describe("notification preference rules", () => {
  it("picks the agent event list for agent orgs only", () => {
    assert.equal(notificationEventTypesForOrgType("agent"), AGENT_NOTIFICATION_EVENT_TYPES);
    assert.equal(notificationEventTypesForOrgType("merchant"), NOTIFICATION_EVENT_TYPES);
    assert.ok(AGENT_NOTIFICATION_EVENT_TYPES.includes("commission_paid"));
  });

  it("gives merchant cashiers only the order events they can act on", () => {
    assert.equal(
      notificationEventTypesForOrgType("merchant", "cashier"),
      CASHIER_NOTIFICATION_EVENT_TYPES,
    );
    assert.deepEqual([...CASHIER_NOTIFICATION_EVENT_TYPES], ["payment_completed", "payment_anomaly"]);
    assert.equal(notificationEventTypesForOrgType("merchant", "owner"), NOTIFICATION_EVENT_TYPES);
    assert.equal(notificationEventTypesForOrgType("agent", "cashier"), AGENT_NOTIFICATION_EVENT_TYPES);
    const rejected = validateNotificationPrefsBody(
      { items: [{ eventType: "xpub_change", email: false, inApp: true }] },
      CASHIER_NOTIFICATION_EVENT_TYPES,
    );
    assert.equal(rejected.ok, false);
  });

  it("validates agent items and fills missing events with defaults", () => {
    const result = validateNotificationPrefsBody(
      { items: [{ eventType: "commission_paid", email: false, inApp: true }] },
      AGENT_NOTIFICATION_EVENT_TYPES,
    );
    assert.equal(result.ok, true);
    assert.equal(result.items.length, AGENT_NOTIFICATION_EVENT_TYPES.length);
    assert.deepEqual(result.items[0], {
      eventType: "commission_paid",
      email: false,
      inApp: true,
    });
    assert.ok(result.items.slice(1).every((r) => r.email && r.inApp));
  });

  it("rejects merchant events on the agent list and vice versa", () => {
    const agentBody = { items: [{ eventType: "xpub_change", email: true, inApp: true }] };
    assert.equal(
      validateNotificationPrefsBody(agentBody, AGENT_NOTIFICATION_EVENT_TYPES).ok,
      false,
    );
    const merchantBody = { items: [{ eventType: "commission_paid", email: true, inApp: true }] };
    assert.equal(validateNotificationPrefsBody(merchantBody).ok, false);
  });

  it("merges stored rows over defaults for the given list", () => {
    const merged = mergeNotificationPreferences(
      new Map([["payout_wallet", { email: false, in_app: false }]]),
      AGENT_NOTIFICATION_EVENT_TYPES,
    );
    const wallet = merged.find((r) => r.eventType === "payout_wallet");
    assert.deepEqual(wallet, { eventType: "payout_wallet", email: false, inApp: false });
    assert.equal(merged.length, AGENT_NOTIFICATION_EVENT_TYPES.length);
  });
});
