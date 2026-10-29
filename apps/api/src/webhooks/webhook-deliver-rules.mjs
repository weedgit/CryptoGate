import { createHmac } from "node:crypto";
import {
  WEBHOOK_HTTP_TIMEOUT_MS,
  WEBHOOK_RETRY_DELAYS_SECONDS,
} from "@paymentgate/domain";

/**
 * v2 signing input: `${timestamp}.${eventId}.${rawBody}`. The v1 HMAC covers only the body,
 * so the timestamp and event id merchants use for replay checks were not authenticated
 * (review M21).
 * @param {string} timestamp
 * @param {string} eventId
 * @param {string} body
 */
export function webhookSigningInputV2(timestamp, eventId, body) {
  return `${timestamp}.${eventId}.${body}`;
}

/**
 * Outbound merchant headers (M3-01). v1: HMAC over exact raw body bytes (kept for existing
 * integrations); v2: HMAC over timestamp, event id and body.
 * @param {{
 *   signingSecret: string,
 *   rawBody: string | Buffer,
 *   eventId: string,
 *   deliveryId: string,
 *   timestampSec?: number,
 * }} p
 */
export function webhookOutboundHeaders(p) {
  const timestamp = String(p.timestampSec ?? Math.floor(Date.now() / 1000));
  const body = typeof p.rawBody === "string" ? p.rawBody : p.rawBody.toString("utf8");
  const signature = createHmac("sha256", p.signingSecret)
    .update(body, "utf8")
    .digest("hex");
  const signatureV2 = createHmac("sha256", p.signingSecret)
    .update(webhookSigningInputV2(timestamp, p.eventId, body), "utf8")
    .digest("hex");
  return {
    "Content-Type": "application/json",
    "X-PaymentGate-Signature": signature,
    "X-PaymentGate-Signature-V2": signatureV2,
    "X-PaymentGate-Timestamp": timestamp,
    "X-PaymentGate-Event-Id": p.eventId,
    "X-PaymentGate-Delivery-Id": p.deliveryId,
  };
}

export function webhookHttpTimeoutMs() {
  const raw = process.env.WEBHOOK_HTTP_TIMEOUT_MS;
  const n = raw ? Number(raw) : WEBHOOK_HTTP_TIMEOUT_MS;
  return Number.isFinite(n) && n > 0 ? n : WEBHOOK_HTTP_TIMEOUT_MS;
}

/**
 * After a non-2xx or transport failure on `attempt`, schedule retry or fail.
 * attempt is 1-based (the attempt that just failed).
 * @param {number} attempt
 * @param {number} nowMs
 * @returns {{ status: "pending", attempt: number, nextRetryAt: Date } | { status: "failed" }}
 */
export function webhookRetryAfterFailure(attempt, nowMs = Date.now()) {
  const delayIdx = attempt - 1;
  if (delayIdx >= WEBHOOK_RETRY_DELAYS_SECONDS.length) {
    return { status: "failed" };
  }
  const delaySec = WEBHOOK_RETRY_DELAYS_SECONDS[delayIdx];
  return {
    status: "pending",
    attempt: attempt + 1,
    nextRetryAt: new Date(nowMs + delaySec * 1000),
  };
}

/**
 * @param {number | null | undefined} httpStatus
 */
export function isWebhookDeliverySuccess(httpStatus) {
  return typeof httpStatus === "number" && httpStatus >= 200 && httpStatus < 300;
}
