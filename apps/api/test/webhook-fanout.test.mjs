import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { OrderStatus, WebhookEventType } from "@cryptogate/domain";
import {
  buildPaymentOrderWebhookPayload,
  endpointSubscribesToEvent,
  webhookEventTypeForOrderStatus,
} from "../src/webhooks/webhook-fanout-rules.mjs";
import { processPaymentOrderWebhookOutbox } from "../src/webhooks/webhook-fanout.mjs";
import { DEFAULT_WEBHOOK_EVENTS } from "../src/webhooks/webhook-rules.mjs";

describe("webhook fan-out rules", () => {
  it("maps order statuses to payment_order.* (skips confirmed/cancelled)", () => {
    assert.equal(
      webhookEventTypeForOrderStatus(OrderStatus.PendingPayment),
      WebhookEventType.PaymentOrderCreated,
    );
    assert.equal(
      webhookEventTypeForOrderStatus(OrderStatus.Verifying),
      WebhookEventType.PaymentOrderVerifying,
    );
    assert.equal(
      webhookEventTypeForOrderStatus(OrderStatus.Completed),
      WebhookEventType.PaymentOrderCompleted,
    );
    assert.equal(
      webhookEventTypeForOrderStatus(OrderStatus.Expired),
      WebhookEventType.PaymentOrderExpired,
    );
    assert.equal(
      webhookEventTypeForOrderStatus(OrderStatus.PaymentAnomaly),
      WebhookEventType.PaymentOrderPaymentAnomaly,
    );
    assert.equal(
      webhookEventTypeForOrderStatus(OrderStatus.Failed),
      WebhookEventType.PaymentOrderFailed,
    );
    assert.equal(webhookEventTypeForOrderStatus(OrderStatus.Confirmed), null);
    assert.equal(webhookEventTypeForOrderStatus(OrderStatus.Cancelled), null);
  });

  it("builds OpenAPI WebhookEvent data without PaymentDetails fields", () => {
    const payload = buildPaymentOrderWebhookPayload({
      eventId: "e1",
      eventType: WebhookEventType.PaymentOrderCompleted,
      createdAt: "2026-08-24T12:00:00.000Z",
      orderId: "o1",
      orderNumber: "CG-2026-000001",
      status: OrderStatus.Completed,
    });
    assert.deepEqual(payload, {
      id: "e1",
      type: "payment_order.completed",
      createdAt: "2026-08-24T12:00:00.000Z",
      data: {
        orderId: "o1",
        orderNumber: "CG-2026-000001",
        status: "completed",
      },
    });
  });

  it("matches endpoint subscription lists", () => {
    assert.equal(
      endpointSubscribesToEvent(
        DEFAULT_WEBHOOK_EVENTS,
        WebhookEventType.PaymentOrderExpired,
      ),
      true,
    );
    assert.equal(
      endpointSubscribesToEvent(
        [WebhookEventType.PaymentOrderCompleted],
        WebhookEventType.PaymentOrderExpired,
      ),
      false,
    );
  });
});

describe("processPaymentOrderWebhookOutbox", () => {
  it("enqueues only subscribed endpoints and marks outbox processed", async () => {
    const enqueued = [];
    const marked = [];
    const fakeClient = {
      query: async (sql) => {
        if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
          return { rows: [] };
        }
        return { rows: [] };
      },
      release() {},
    };

    const results = await processPaymentOrderWebhookOutbox({
      pool: {
        connect: async () => fakeClient,
      },
      claim: async () => [
        {
          id: "ob1",
          order_id: "ord1",
          org_id: "org1",
          event_id: "ev1",
          event_type: WebhookEventType.PaymentOrderCompleted,
          order_number: "CG-1",
          order_status: OrderStatus.Completed,
          created_at: new Date("2026-08-24T12:00:00.000Z"),
        },
      ],
      listEndpoints: async () => [
        {
          id: "wh-all",
          events: DEFAULT_WEBHOOK_EVENTS,
        },
        {
          id: "wh-narrow",
          events: [WebhookEventType.PaymentOrderExpired],
        },
      ],
      enqueue: async (input) => {
        enqueued.push(input);
        return { id: "d1" };
      },
      markProcessed: async (id) => {
        marked.push(id);
      },
    });

    assert.equal(results.length, 1);
    assert.equal(results[0].queued, 1);
    assert.equal(enqueued.length, 1);
    assert.equal(enqueued[0].webhookId, "wh-all");
    assert.equal(enqueued[0].eventType, WebhookEventType.PaymentOrderCompleted);
    assert.equal(enqueued[0].payload.data.orderId, "ord1");
    assert.deepEqual(marked, ["ob1"]);
  });
});
