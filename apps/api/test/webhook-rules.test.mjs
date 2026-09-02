import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WebhookEventType } from "@paymentgate/domain";
import {
  DEFAULT_WEBHOOK_EVENTS,
  normalizeWebhookEvents,
  toWebhookEndpoint,
  validateRegisterWebhookBody,
  validateWebhookUrl,
} from "../src/webhooks/webhook-rules.mjs";
import { resolveWebhookOrgId } from "../src/orgs/role-policy.mjs";

describe("webhook rules (M3-13)", () => {
  it("requires HTTPS except localhost outside production", () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      assert.equal(validateWebhookUrl("https://hooks.example/cb").ok, true);
      assert.equal(validateWebhookUrl("http://127.0.0.1:8080/cb").ok, true);
      assert.equal(validateWebhookUrl("http://evil.example/cb").ok, false);
    } finally {
      if (prev === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prev;
    }
  });

  it("defaults events to payment_order.* without webhook.test", () => {
    const n = normalizeWebhookEvents(undefined);
    assert.equal(n.ok, true);
    assert.deepEqual(n.events, DEFAULT_WEBHOOK_EVENTS);
    assert.equal(n.events.includes(WebhookEventType.WebhookTest), false);
  });

  it("never maps signingSecret onto list shape", () => {
    const mapped = toWebhookEndpoint({
      id: "w1",
      org_id: "o1",
      url: "https://hooks.example/cb",
      events: DEFAULT_WEBHOOK_EVENTS,
      enabled: true,
      created_at: new Date("2026-08-24T12:00:00.000Z"),
      signing_secret: "should-not-leak",
    });
    assert.equal("signingSecret" in mapped, false);
    assert.equal(mapped.url, "https://hooks.example/cb");
  });

  it("validates register body", () => {
    const bad = validateRegisterWebhookBody({ url: "ftp://x" });
    assert.equal(bad.ok, false);
    const ok = validateRegisterWebhookBody({
      url: "https://hooks.example/cb",
      events: [WebhookEventType.PaymentOrderCompleted],
    });
    assert.equal(ok.ok, true);
  });
});

describe("webhook role scope", () => {
  it("forbids cashiers and agents from managing webhooks", () => {
    const cashier = resolveWebhookOrgId(
      [{ orgId: "m1", role: "cashier", orgType: "merchant" }],
      null,
      "manage",
    );
    assert.equal(cashier.ok, false);
    assert.equal(cashier.status, 403);

    const agent = resolveWebhookOrgId(
      [{ orgId: "a1", role: "owner", orgType: "agent" }],
      null,
      "manage",
    );
    assert.equal(agent.ok, false);
    assert.equal(agent.message.includes("Agent"), true);
  });

  it("resolves a single merchant owner", () => {
    const r = resolveWebhookOrgId(
      [{ orgId: "m1", role: "owner", orgType: "merchant" }],
      null,
      "manage",
    );
    assert.equal(r.ok, true);
    assert.equal(r.orgId, "m1");
  });
});
