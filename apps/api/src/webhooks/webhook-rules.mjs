import { randomBytes } from "node:crypto";
import { WebhookEventType } from "@cryptogate/domain";

export const WEBHOOK_MAX_PER_ORG = 5;

/** Default subscribe set — all payment_order.* (not webhook.test). */
export const DEFAULT_WEBHOOK_EVENTS = [
  WebhookEventType.PaymentOrderCreated,
  WebhookEventType.PaymentOrderVerifying,
  WebhookEventType.PaymentOrderCompleted,
  WebhookEventType.PaymentOrderExpired,
  WebhookEventType.PaymentOrderPaymentAnomaly,
  WebhookEventType.PaymentOrderFailed,
];

const ALL_EVENT_TYPES = new Set(Object.values(WebhookEventType));

/**
 * @param {string} url
 * @param {{ allowLocalHttp?: boolean }} [opts]
 * @returns {{ ok: true } | { ok: false, code: string, message: string }}
 */
export function validateWebhookUrl(url, opts = {}) {
  const allowLocalHttp =
    opts.allowLocalHttp ?? process.env.NODE_ENV !== "production";
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, code: "invalid_url", message: "url must be a valid URI" };
  }
  if (parsed.protocol === "https:") return { ok: true };
  if (
    allowLocalHttp &&
    parsed.protocol === "http:" &&
    (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost")
  ) {
    return { ok: true };
  }
  return {
    ok: false,
    code: "invalid_url",
    message: "Webhook URL must be HTTPS (localhost HTTP allowed outside production)",
  };
}

/**
 * @param {unknown} events
 * @returns {{ ok: true, events: string[] } | { ok: false, code: string, message: string }}
 */
export function normalizeWebhookEvents(events) {
  if (events == null) {
    return { ok: true, events: [...DEFAULT_WEBHOOK_EVENTS] };
  }
  if (!Array.isArray(events) || events.length === 0) {
    return { ok: false, code: "invalid_events", message: "events must be a non-empty array" };
  }
  /** @type {string[]} */
  const out = [];
  for (const ev of events) {
    if (typeof ev !== "string" || !ALL_EVENT_TYPES.has(ev)) {
      return { ok: false, code: "invalid_events", message: "Unknown webhook event type" };
    }
    if (!out.includes(ev)) out.push(ev);
  }
  return { ok: true, events: out };
}

/**
 * @param {unknown} body
 */
export function validateRegisterWebhookBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, status: 400, code: "invalid_request", message: "Invalid body" };
  }
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) {
    return { ok: false, status: 400, code: "invalid_request", message: "url is required" };
  }
  const urlCheck = validateWebhookUrl(url);
  if (!urlCheck.ok) {
    return { ok: false, status: 400, code: urlCheck.code, message: urlCheck.message };
  }
  const eventsCheck = normalizeWebhookEvents(body.events);
  if (!eventsCheck.ok) {
    return {
      ok: false,
      status: 400,
      code: eventsCheck.code,
      message: eventsCheck.message,
    };
  }
  const orgId =
    typeof body.orgId === "string" && body.orgId.trim() ? body.orgId.trim() : null;
  return { ok: true, url, events: eventsCheck.events, orgId };
}

export function generateWebhookSigningSecret() {
  return randomBytes(32).toString("hex");
}

/**
 * Public list/create shape — never signingSecret.
 * @param {object} row
 */
export function toWebhookEndpoint(row) {
  return {
    id: row.id,
    orgId: row.org_id,
    url: row.url,
    events: row.events,
    enabled: row.enabled,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  };
}

/**
 * @param {object} row
 * @param {string} signingSecret
 */
export function toWebhookCreated(row, signingSecret) {
  return { ...toWebhookEndpoint(row), signingSecret };
}

/**
 * @param {object} row
 */
export function toWebhookDelivery(row) {
  let orderId = null;
  let eventType = row.event_type ?? null;
  try {
    const payload =
      typeof row.payload === "string"
        ? JSON.parse(row.payload)
        : row.payload;
    if (payload && typeof payload === "object") {
      if (!eventType && typeof payload.type === "string") {
        eventType = payload.type;
      }
      const data = payload.data;
      if (data && typeof data === "object" && typeof data.orderId === "string") {
        orderId = data.orderId;
      }
    }
  } catch {
    /* ignore malformed payload */
  }

  return {
    id: row.id,
    eventId: row.event_id,
    eventType: eventType ?? "unknown",
    orderId,
    status: row.status,
    attempt: row.attempt,
    httpStatus: row.http_status ?? null,
    nextRetryAt: row.next_retry_at
      ? row.next_retry_at instanceof Date
        ? row.next_retry_at.toISOString()
        : String(row.next_retry_at)
      : null,
    createdAt: row.created_at
      ? row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at)
      : null,
  };
}
