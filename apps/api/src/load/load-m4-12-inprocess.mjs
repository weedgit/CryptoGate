import { randomUUID } from "node:crypto";
import { OrderStatus, WebhookEventType } from "@paymentgate/domain";
import { runConcurrent, summarize } from "./load-metrics.mjs";
import { toPaymentOrder } from "../orders/order-map.mjs";
import { processPaymentOrderWebhookOutbox } from "../webhooks/webhook-fanout.mjs";
import { buildPaymentOrderWebhookPayload } from "../webhooks/webhook-fanout-rules.mjs";
import { DEFAULT_WEBHOOK_EVENTS } from "../webhooks/webhook-rules.mjs";

/**
 * In-process load (no Postgres): create-map / status-map / fan-out enqueue paths.
 * @param {{
 *   createN?: number,
 *   statusN?: number,
 *   fanoutN?: number,
 *   concurrency?: number,
 * }} [opts]
 */
export async function runInProcessLoad(opts = {}) {
  const createN = opts.createN ?? 200;
  const statusN = opts.statusN ?? 500;
  const fanoutN = opts.fanoutN ?? 200;
  const concurrency = opts.concurrency ?? 20;

  const createSamples = await runConcurrent(createN, concurrency, async (i) => {
    const row = fakeOrderRow(i);
    toPaymentOrder(row);
  });

  const statusSamples = await runConcurrent(statusN, concurrency, async (i) => {
    toPaymentOrder(fakeOrderRow(i % createN));
  });

  /** @type {object[]} */
  const outbox = [];
  for (let i = 0; i < fanoutN; i += 1) {
    outbox.push({
      id: `ob-${i}`,
      order_id: `ord-${i}`,
      org_id: "org-load",
      event_id: randomUUID(),
      event_type: WebhookEventType.PaymentOrderCreated,
      order_number: `CG-LOAD-${i}`,
      order_status: OrderStatus.PendingPayment,
      created_at: new Date(),
    });
  }
  let outboxIdx = 0;
  /** @type {object[]} */
  const enqueued = [];

  const fanoutWall0 = performance.now();
  const fanoutResults = await processPaymentOrderWebhookOutbox({
    limit: fanoutN,
    pool: {
      connect: async () => ({
        query: async () => ({ rows: [] }),
        release() {},
      }),
    },
    claim: async (limit) => {
      const slice = outbox.slice(outboxIdx, outboxIdx + limit);
      outboxIdx += slice.length;
      return slice;
    },
    listEndpoints: async () => [
      { id: "wh-1", events: DEFAULT_WEBHOOK_EVENTS },
    ],
    enqueue: async (input) => {
      enqueued.push(input);
      return { id: randomUUID() };
    },
    markProcessed: async () => {},
  });
  const fanoutWall = performance.now() - fanoutWall0;

  // Synthetic per-item samples from wall / count for fan-out batch.
  const fanoutSamples = fanoutResults.map(() => fanoutWall / Math.max(1, fanoutResults.length));

  return {
    mode: "inprocess",
    create: summarize(createSamples, createSamples.reduce((a, b) => a + b, 0), "create_map"),
    status: summarize(statusSamples, statusSamples.reduce((a, b) => a + b, 0), "status_map"),
    fanout: {
      ...summarize(fanoutSamples, fanoutWall, "webhook_fanout"),
      queued: enqueued.length,
      payloadCheck: buildPaymentOrderWebhookPayload({
        eventId: "e",
        eventType: WebhookEventType.PaymentOrderCreated,
        createdAt: new Date().toISOString(),
        orderId: "o",
        orderNumber: "CG-1",
        status: OrderStatus.PendingPayment,
      }).type,
    },
  };
}

/**
 * @param {number} i
 */
function fakeOrderRow(i) {
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    org_id: "org-load",
    created_by: "user-load",
    order_number: `CG-LOAD-${i}`,
    status: OrderStatus.PendingPayment,
    matching_mode: "B",
    payable_amount: "10.00",
    received_amount: null,
    receive_address: "TLoadTestAddressXXXXXXXXXXXXXX",
    address_source: "main",
    hd_index: null,
    memo_or_tag: null,
    asset: "USDT",
    network: "tron",
    expires_at: new Date(Date.now() + 900_000),
    tx_hash: null,
    confirmations: 0,
    required_confirmations: 19,
    idempotency_key: `idem-${i}`,
    idempotency_body_hash: "abc",
    merchant_metadata: null,
    created_at: new Date(),
    updated_at: new Date(),
  };
}

/**
 * Soft gates for CI smoke — keep loose; tighten in live DB runs.
 * @param {Awaited<ReturnType<typeof runInProcessLoad>>} report
 */
export function assertInProcessGates(report) {
  if (report.create.count < 1 || report.status.count < 1) {
    throw new Error("M4-12 in-process load produced no samples");
  }
  if (report.fanout.queued < 1) {
    throw new Error("M4-12 fan-out queued nothing");
  }
  if (report.fanout.payloadCheck !== WebhookEventType.PaymentOrderCreated) {
    throw new Error("M4-12 fan-out payload type mismatch");
  }
  // Mapper path should stay sub-ms mean on a quiet CI box; allow headroom.
  if (report.create.meanMs > 50 || report.status.meanMs > 50) {
    throw new Error(
      `M4-12 mapper path too slow: create mean=${report.create.meanMs}ms status mean=${report.status.meanMs}ms`,
    );
  }
}
