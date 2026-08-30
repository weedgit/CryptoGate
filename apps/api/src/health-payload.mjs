import { getPool } from "./db/pool.mjs";
import { getWebhookDeliveryWorkerSnapshot } from "./webhooks/webhook-delivery-job.mjs";

/**
 * Resolve webhook worker + queue health for the topbar / Health checklist.
 * @param {{ checkDb?: boolean }} [opts]
 * @returns {Promise<{
 *   status: "ok" | "off" | "degraded" | "unknown",
 *   detail: string,
 *   pendingOutbox?: number,
 *   overdueDeliveries?: number,
 *   lastTickAt?: string | null,
 * }>}
 */
async function resolveWebhookHealth(opts = {}) {
  const snap = getWebhookDeliveryWorkerSnapshot();

  if (!snap.configured) {
    return {
      status: "unknown",
      detail: "Worker not started in this process",
      lastTickAt: null,
    };
  }

  if (!snap.enabled) {
    return {
      status: "off",
      detail: "Delivery worker disabled (WEBHOOK_DELIVERY_ENABLED)",
      lastTickAt: null,
    };
  }

  if (!snap.started) {
    return {
      status: "degraded",
      detail: "Delivery worker stopped",
      lastTickAt: snap.lastTickAt
        ? new Date(snap.lastTickAt).toISOString()
        : null,
    };
  }

  const lastTickAt = snap.lastTickAt
    ? new Date(snap.lastTickAt).toISOString()
    : null;
  const staleMs = Math.max(snap.intervalMs * 3, 15_000);

  if (!snap.lastTickAt || Date.now() - snap.lastTickAt > staleMs) {
    return {
      status: "degraded",
      detail: "No recent delivery tick",
      lastTickAt,
    };
  }

  if (snap.lastError) {
    return {
      status: "degraded",
      detail: `Last tick error: ${snap.lastError}`,
      lastTickAt,
    };
  }

  /** @type {number | undefined} */
  let pendingOutbox;
  /** @type {number | undefined} */
  let overdueDeliveries;

  if (opts.checkDb && process.env.DATABASE_URL) {
    try {
      const pool = getPool();
      const [outboxRes, overdueRes] = await Promise.all([
        pool.query(
          `SELECT COUNT(*)::int AS n
           FROM payment_order_webhook_outbox
           WHERE processed_at IS NULL`,
        ),
        pool.query(
          `SELECT COUNT(*)::int AS n
           FROM webhook_deliveries
           WHERE status = 'pending'
             AND next_retry_at IS NOT NULL
             AND next_retry_at < now() - interval '5 minutes'`,
        ),
      ]);
      pendingOutbox = outboxRes.rows[0]?.n ?? 0;
      overdueDeliveries = overdueRes.rows[0]?.n ?? 0;
    } catch {
      /* queue stats optional — worker tick already proves process liveness */
    }
  }

  if (overdueDeliveries != null && overdueDeliveries > 0) {
    return {
      status: "degraded",
      detail: `${overdueDeliveries} overdue pending delivery${overdueDeliveries === 1 ? "" : "ies"}`,
      pendingOutbox,
      overdueDeliveries,
      lastTickAt,
    };
  }

  if (pendingOutbox != null && pendingOutbox > 100) {
    return {
      status: "degraded",
      detail: `${pendingOutbox} pending outbox rows`,
      pendingOutbox,
      overdueDeliveries,
      lastTickAt,
    };
  }

  const queueNote =
    pendingOutbox != null ? ` · ${pendingOutbox} outbox pending` : "";
  return {
    status: "ok",
    detail: `Outbox fan-out on API${queueNote}`,
    pendingOutbox,
    overdueDeliveries,
    lastTickAt,
  };
}

/**
 * Build health JSON for GET /health and the CLI check stub.
 * @param {{ checkDb?: boolean }} [opts] — set checkDb true for HTTP (needs DATABASE_URL + Postgres).
 */
export async function getHealthPayload(opts = {}) {
  const payload = {
    service: "cryptogate-api",
    status: "ok",
    phase: "m1",
    timestamp: new Date().toISOString(),
  };

  if (opts.checkDb) {
    if (!process.env.DATABASE_URL) {
      payload.db = "skipped";
    } else {
      try {
        const pool = getPool();
        await pool.query("SELECT 1");
        payload.db = "ok";
      } catch {
        payload.status = "degraded";
        payload.db = "error";
      }
    }
  }

  const webhook = await resolveWebhookHealth(opts);
  payload.webhook = webhook.status;
  payload.webhookDetail = webhook.detail;
  if (webhook.pendingOutbox != null) {
    payload.webhookPendingOutbox = webhook.pendingOutbox;
  }
  if (webhook.overdueDeliveries != null) {
    payload.webhookOverdueDeliveries = webhook.overdueDeliveries;
  }
  if (webhook.lastTickAt !== undefined) {
    payload.webhookLastTickAt = webhook.lastTickAt;
  }

  return payload;
}
