import {
  isWebhookDeliverySuccess,
  webhookHttpTimeoutMs,
  webhookOutboundHeaders,
  webhookRetryAfterFailure,
} from "./webhook-deliver-rules.mjs";
import {
  claimPendingWebhookDeliveries,
  updateWebhookDeliveryResult,
} from "./webhook-store.mjs";

/**
 * POST one delivery. Inject `fetchImpl` / `updateResult` in tests.
 * @param {{
 *   id: string,
 *   event_id: string,
 *   body_raw: string,
 *   attempt: number,
 *   url: string,
 *   signing_secret: string,
 * }} row
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   nowMs?: number,
 *   updateResult?: typeof updateWebhookDeliveryResult,
 * }} [opts]
 */
export async function deliverWebhookOnce(row, opts = {}) {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const updateResult = opts.updateResult ?? updateWebhookDeliveryResult;
  const nowMs = opts.nowMs ?? Date.now();
  const headers = webhookOutboundHeaders({
    signingSecret: row.signing_secret,
    rawBody: row.body_raw,
    eventId: row.event_id,
    deliveryId: row.id,
    timestampSec: Math.floor(nowMs / 1000),
  });

  /** @type {number | null} */
  let httpStatus = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), webhookHttpTimeoutMs());
    try {
      const res = await fetchImpl(row.url, {
        method: "POST",
        headers,
        body: row.body_raw,
        signal: controller.signal,
      });
      httpStatus = res.status;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    httpStatus = null;
  }

  if (isWebhookDeliverySuccess(httpStatus)) {
    await updateResult({
      deliveryId: row.id,
      status: "success",
      attempt: row.attempt,
      httpStatus,
      nextRetryAt: null,
    });
    return { status: "success", httpStatus };
  }

  const next = webhookRetryAfterFailure(row.attempt, nowMs);
  if (next.status === "failed") {
    await updateResult({
      deliveryId: row.id,
      status: "failed",
      attempt: row.attempt,
      httpStatus,
      nextRetryAt: null,
    });
    return { status: "failed", httpStatus };
  }

  await updateResult({
    deliveryId: row.id,
    status: "pending",
    attempt: next.attempt,
    httpStatus,
    nextRetryAt: next.nextRetryAt,
  });
  return { status: "pending", httpStatus, nextAttempt: next.attempt };
}

/**
 * Drain due deliveries.
 * @param {{ limit?: number, fetchImpl?: typeof fetch }} [opts]
 */
export async function processDueWebhookDeliveries(opts = {}) {
  const rows = await claimPendingWebhookDeliveries(opts.limit ?? 20);
  /** @type {{ id: string, status: string }[]} */
  const results = [];
  for (const row of rows) {
    const outcome = await deliverWebhookOnce(row, { fetchImpl: opts.fetchImpl });
    results.push({ id: row.id, status: outcome.status });
  }
  return results;
}
