import { createHmac } from "node:crypto";
import {
  WEBHOOK_HTTP_TIMEOUT_MS,
  WEBHOOK_RETRY_DELAYS_SECONDS,
} from "@cryptogate/domain";

/**
 * Outbound merchant headers (M3-01). HMAC over exact raw body bytes.
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
  return {
    "Content-Type": "application/json",
    "X-CryptoGate-Signature": signature,
    "X-CryptoGate-Timestamp": timestamp,
    "X-CryptoGate-Event-Id": p.eventId,
    "X-CryptoGate-Delivery-Id": p.deliveryId,
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
