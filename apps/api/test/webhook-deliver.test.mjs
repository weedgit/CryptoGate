import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { WEBHOOK_RETRY_DELAYS_SECONDS } from "@paymentgate/domain";
import {
  isWebhookDeliverySuccess,
  webhookOutboundHeaders,
  webhookRetryAfterFailure,
} from "../src/webhooks/webhook-deliver-rules.mjs";
import { deliverWebhookOnce } from "../src/webhooks/webhook-deliver.mjs";

describe("webhook delivery rules (M3-14)", () => {
  it("signs the raw body with HMAC-SHA256 hex", () => {
    const body = '{"id":"e1","type":"webhook.test"}';
    const secret = "s".repeat(32);
    const headers = webhookOutboundHeaders({
      signingSecret: secret,
      rawBody: body,
      eventId: "e1",
      deliveryId: "d1",
      timestampSec: 1_710_000_000,
    });
    const expected = createHmac("sha256", secret).update(body, "utf8").digest("hex");
    assert.equal(headers["X-PaymentGate-Signature"], expected);
    assert.equal(headers["X-PaymentGate-Timestamp"], "1710000000");
    assert.equal(headers["X-PaymentGate-Event-Id"], "e1");
    assert.equal(headers["X-PaymentGate-Delivery-Id"], "d1");
  });

  it("schedules retries then fails after the delay list", () => {
    const first = webhookRetryAfterFailure(1, 1_000_000);
    assert.equal(first.status, "pending");
    assert.equal(first.attempt, 2);
    assert.equal(
      first.nextRetryAt.getTime(),
      1_000_000 + WEBHOOK_RETRY_DELAYS_SECONDS[0] * 1000,
    );

    const lastOk = webhookRetryAfterFailure(WEBHOOK_RETRY_DELAYS_SECONDS.length, 0);
    assert.equal(lastOk.status, "pending");

    const done = webhookRetryAfterFailure(
      WEBHOOK_RETRY_DELAYS_SECONDS.length + 1,
      0,
    );
    assert.equal(done.status, "failed");
  });

  it("treats only 2xx as success", () => {
    assert.equal(isWebhookDeliverySuccess(200), true);
    assert.equal(isWebhookDeliverySuccess(204), true);
    assert.equal(isWebhookDeliverySuccess(199), false);
    assert.equal(isWebhookDeliverySuccess(500), false);
    assert.equal(isWebhookDeliverySuccess(null), false);
  });
});

describe("deliverWebhookOnce", () => {
  it("marks success on 2xx", async () => {
    /** @type {object[]} */
    const updates = [];
    const outcome = await deliverWebhookOnce(
      {
        id: "d1",
        event_id: "e1",
        body_raw: "{}",
        attempt: 1,
        url: "https://hooks.example/cb",
        signing_secret: "s".repeat(32),
      },
      {
        fetchImpl: async () => ({ status: 204 }),
        nowMs: 1_710_000_000_000,
        updateResult: async (input) => {
          updates.push(input);
        },
      },
    );
    assert.equal(outcome.status, "success");
    assert.equal(updates[0].status, "success");
  });

  it("schedules a retry on non-2xx", async () => {
    /** @type {object[]} */
    const updates = [];
    const outcome = await deliverWebhookOnce(
      {
        id: "d1",
        event_id: "e1",
        body_raw: "{}",
        attempt: 1,
        url: "https://hooks.example/cb",
        signing_secret: "s".repeat(32),
      },
      {
        fetchImpl: async () => ({ status: 500 }),
        nowMs: 1_000_000,
        updateResult: async (input) => {
          updates.push(input);
        },
      },
    );
    assert.equal(outcome.status, "pending");
    assert.equal(updates[0].status, "pending");
    assert.equal(updates[0].attempt, 2);
  });
});
