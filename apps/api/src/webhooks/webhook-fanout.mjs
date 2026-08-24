import {
  buildPaymentOrderWebhookPayload,
  endpointSubscribesToEvent,
} from "./webhook-fanout-rules.mjs";
import { getPool } from "../db/pool.mjs";
import {
  claimPaymentOrderWebhookOutbox,
  enqueueWebhookDelivery,
  listWebhookEndpoints,
  markPaymentOrderWebhookOutboxProcessed,
} from "./webhook-store.mjs";

/**
 * Drain outbox → webhook_deliveries for subscribed merchant endpoints.
 * Trigger fills the outbox on order create / status change (incl. watcher writes).
 * @param {{
 *   limit?: number,
 *   claim?: typeof claimPaymentOrderWebhookOutbox,
 *   listEndpoints?: typeof listWebhookEndpoints,
 *   enqueue?: typeof enqueueWebhookDelivery,
 *   markProcessed?: typeof markPaymentOrderWebhookOutboxProcessed,
 *   pool?: { connect: () => Promise<import("pg").PoolClient> },
 * }} [opts]
 */
export async function processPaymentOrderWebhookOutbox(opts = {}) {
  const claim = opts.claim ?? claimPaymentOrderWebhookOutbox;
  const listEndpoints = opts.listEndpoints ?? listWebhookEndpoints;
  const enqueue = opts.enqueue ?? enqueueWebhookDelivery;
  const markProcessed = opts.markProcessed ?? markPaymentOrderWebhookOutboxProcessed;
  const pool = opts.pool ?? getPool();

  const client = await pool.connect();
  /** @type {{ outboxId: string, queued: number }[]} */
  const results = [];
  try {
    await client.query("BEGIN");
    const rows = await claim(opts.limit ?? 50, client);

    for (const row of rows) {
      const endpoints = await listEndpoints(row.org_id);
      const createdAt =
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at);
      const payload = buildPaymentOrderWebhookPayload({
        eventId: row.event_id,
        eventType: row.event_type,
        createdAt,
        orderId: row.order_id,
        orderNumber: row.order_number,
        status: row.order_status,
      });

      let queued = 0;
      for (const endpoint of endpoints) {
        if (!endpointSubscribesToEvent(endpoint.events, row.event_type)) {
          continue;
        }
        const inserted = await enqueue({
          webhookId: endpoint.id,
          eventId: row.event_id,
          eventType: row.event_type,
          payload,
          client,
        });
        if (inserted) queued += 1;
      }

      await markProcessed(row.id, client);
      results.push({ outboxId: row.id, queued });
    }

    await client.query("COMMIT");
    return results;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw err;
  } finally {
    client.release();
  }
}
