import { getPool } from "../db/pool.mjs";
import { WEBHOOK_MAX_PER_ORG } from "./webhook-rules.mjs";

/**
 * @param {string} orgId
 */
export async function listWebhookEndpoints(orgId) {
  const { rows } = await getPool().query(
    `SELECT id, org_id, url, events, enabled, created_at
     FROM webhook_endpoints
     WHERE org_id = $1 AND enabled = true
     ORDER BY created_at ASC`,
    [orgId],
  );
  return rows;
}

/**
 * @param {string} webhookId
 */
export async function findWebhookById(webhookId) {
  const { rows } = await getPool().query(
    `SELECT id, org_id, url, events, signing_secret, enabled, created_at
     FROM webhook_endpoints
     WHERE id = $1`,
    [webhookId],
  );
  return rows[0] ?? null;
}

/**
 * @param {string} orgId
 */
export async function countEnabledWebhooks(orgId) {
  const { rows } = await getPool().query(
    `SELECT COUNT(*)::int AS n
     FROM webhook_endpoints
     WHERE org_id = $1 AND enabled = true`,
    [orgId],
  );
  return rows[0]?.n ?? 0;
}

/**
 * @param {{
 *   orgId: string,
 *   url: string,
 *   events: string[],
 *   signingSecret: string,
 * }} input
 * @returns {Promise<{ ok: true, row: object } | { ok: false, code: "duplicate" | "limit" }>}
 */
export async function insertWebhookEndpoint(input) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: lockRows } = await client.query(
      `SELECT id
       FROM webhook_endpoints
       WHERE org_id = $1 AND enabled = true
       FOR UPDATE`,
      [input.orgId],
    );
    if (lockRows.length >= WEBHOOK_MAX_PER_ORG) {
      await client.query("ROLLBACK");
      return { ok: false, code: "limit" };
    }
    const { rows } = await client.query(
      `INSERT INTO webhook_endpoints (org_id, url, events, signing_secret)
       VALUES ($1, $2, $3::text[], $4)
       RETURNING id, org_id, url, events, enabled, created_at`,
      [input.orgId, input.url, input.events, input.signingSecret],
    );
    await client.query("COMMIT");
    return { ok: true, row: rows[0] };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    if (err && typeof err === "object" && "code" in err && err.code === "23505") {
      return { ok: false, code: "duplicate" };
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Soft-disable endpoint.
 * @param {string} webhookId
 * @param {string} orgId
 */
export async function disableWebhookEndpoint(webhookId, orgId) {
  const { rows } = await getPool().query(
    `UPDATE webhook_endpoints
     SET enabled = false, disabled_at = now()
     WHERE id = $1 AND org_id = $2 AND enabled = true
     RETURNING id`,
    [webhookId, orgId],
  );
  return rows[0] ?? null;
}

/**
 * Replace signing secret in place (D14 rotate).
 * @param {string} webhookId
 * @param {string} orgId
 * @param {string} signingSecret
 */
export async function rotateWebhookSigningSecret(
  webhookId,
  orgId,
  signingSecret,
) {
  const { rows } = await getPool().query(
    `UPDATE webhook_endpoints
     SET signing_secret = $3
     WHERE id = $1 AND org_id = $2 AND enabled = true
     RETURNING id, org_id, url, events, enabled, created_at`,
    [webhookId, orgId, signingSecret],
  );
  return rows[0] ?? null;
}

/**
 * @param {{
 *   webhookId: string,
 *   eventId: string,
 *   eventType: string,
 *   payload: object,
 *   client?: import("pg").Pool | import("pg").PoolClient,
 * }} input
 */
export async function enqueueWebhookDelivery(input) {
  const bodyRaw = JSON.stringify(input.payload);
  const db = input.client ?? getPool();
  const existing = await db.query(
    `SELECT id, event_id, status, attempt, http_status, next_retry_at
     FROM webhook_deliveries
     WHERE webhook_id = $1 AND event_id = $2
     ORDER BY created_at ASC
     LIMIT 1`,
    [input.webhookId, input.eventId],
  );
  if (existing.rows[0]) return existing.rows[0];

  const { rows } = await db.query(
    `INSERT INTO webhook_deliveries
       (webhook_id, event_id, event_type, payload, body_raw, status, attempt, next_retry_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, 'pending', 1, now())
     RETURNING id, event_id, status, attempt, http_status, next_retry_at`,
    [
      input.webhookId,
      input.eventId,
      input.eventType,
      bodyRaw,
      bodyRaw,
    ],
  );
  return rows[0] ?? null;
}

/**
 * Claim unprocessed payment-order webhook outbox rows (SKIP LOCKED).
 * @param {number} [limit]
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function claimPaymentOrderWebhookOutbox(limit = 50, client) {
  const db = client ?? getPool();
  const { rows } = await db.query(
    `WITH due AS (
       SELECT id
       FROM payment_order_webhook_outbox
       WHERE processed_at IS NULL
       ORDER BY created_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT $1
     )
     SELECT o.id, o.order_id, o.org_id, o.event_id, o.event_type,
            o.order_number, o.order_status, o.created_at
     FROM payment_order_webhook_outbox o
     JOIN due ON due.id = o.id`,
    [limit],
  );
  return rows;
}

/**
 * @param {string} outboxId
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function markPaymentOrderWebhookOutboxProcessed(outboxId, client) {
  const db = client ?? getPool();
  await db.query(
    `UPDATE payment_order_webhook_outbox
     SET processed_at = now()
     WHERE id = $1 AND processed_at IS NULL`,
    [outboxId],
  );
}

/**
 * Claim due pending deliveries (SKIP LOCKED).
 * @param {number} limit
 */
export async function claimPendingWebhookDeliveries(limit = 20) {
  const { rows } = await getPool().query(
    `WITH due AS (
       SELECT d.id
       FROM webhook_deliveries d
       JOIN webhook_endpoints e ON e.id = d.webhook_id
       WHERE d.status = 'pending'
         AND d.next_retry_at <= now()
         AND e.enabled = true
       ORDER BY d.next_retry_at ASC
       FOR UPDATE OF d SKIP LOCKED
       LIMIT $1
     )
     SELECT d.id, d.webhook_id, d.event_id, d.event_type, d.body_raw, d.attempt,
            e.url, e.signing_secret
     FROM webhook_deliveries d
     JOIN due ON due.id = d.id
     JOIN webhook_endpoints e ON e.id = d.webhook_id`,
    [limit],
  );
  return rows;
}

/**
 * @param {{
 *   deliveryId: string,
 *   status: "success" | "pending" | "failed",
 *   attempt: number,
 *   httpStatus: number | null,
 *   nextRetryAt: Date | null,
 * }} input
 */
export async function updateWebhookDeliveryResult(input) {
  await getPool().query(
    `UPDATE webhook_deliveries
     SET status = $2,
         attempt = $3,
         http_status = $4,
         next_retry_at = $5,
         updated_at = now()
     WHERE id = $1`,
    [
      input.deliveryId,
      input.status,
      input.attempt,
      input.httpStatus,
      input.nextRetryAt,
    ],
  );
}

/**
 * @param {string} webhookId
 * @param {string} deliveryId
 */
export async function findWebhookDelivery(webhookId, deliveryId) {
  const { rows } = await getPool().query(
    `SELECT id, webhook_id, event_id, event_type, payload, body_raw,
            status, attempt, http_status, next_retry_at, created_at
     FROM webhook_deliveries
     WHERE id = $1 AND webhook_id = $2`,
    [deliveryId, webhookId],
  );
  return rows[0] ?? null;
}

/**
 * Clone a terminal delivery as a new pending row (manual resend).
 * Same event_id + body; new delivery id for X-PaymentGate-Delivery-Id.
 * @param {{
 *   webhook_id: string,
 *   event_id: string,
 *   event_type: string,
 *   payload: object | string,
 *   body_raw?: string | null,
 * }} source
 */
export async function cloneWebhookDeliveryForResend(source) {
  const bodyRaw =
    typeof source.body_raw === "string" && source.body_raw.length > 0
      ? source.body_raw
      : JSON.stringify(source.payload);
  const payloadJson =
    typeof source.payload === "string"
      ? source.payload
      : JSON.stringify(source.payload);
  const { rows } = await getPool().query(
    `INSERT INTO webhook_deliveries
       (webhook_id, event_id, event_type, payload, body_raw, status, attempt, next_retry_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, 'pending', 1, now())
     RETURNING id, event_id, status, attempt, http_status, next_retry_at`,
    [
      source.webhook_id,
      source.event_id,
      source.event_type,
      payloadJson,
      bodyRaw,
    ],
  );
  return rows[0] ?? null;
}

/**
 * @param {string} webhookId
 * @param {number} limit
 */
export async function listWebhookDeliveries(webhookId, limit = 50) {
  const { rows } = await getPool().query(
    `SELECT id, event_id, event_type, payload, status, attempt, http_status,
            next_retry_at, created_at
     FROM webhook_deliveries
     WHERE webhook_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [webhookId, limit],
  );
  return rows;
}
