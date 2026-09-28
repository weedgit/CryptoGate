/**
 * Event email notifications, gated by per-user notification preferences.
 *
 * Fire-and-forget: callers never await delivery, and nothing touches the DB
 * unless outbound mail is configured.
 */
import { NotificationEventType } from "@paymentgate/domain";
import { sendNotificationEmail } from "../mail/auth-mail.mjs";
import { isOutboundMailConfigured } from "../mail/mail-config.mjs";
import { portalWebUrl } from "../mail/portal-links.mjs";
import {
  findNearestAgentForOrg,
  findOrderForNotification,
  findOrgName,
  listEmailRecipientsForEvent,
  listMerchantEmailRecipients,
  listPlatformEmailRecipients,
} from "./notification-store.mjs";
import {
  AgentNotificationEventType,
  CASHIER_NOTIFICATION_EVENT_TYPES,
  PlatformNotificationEventType,
  defaultEmailFor,
} from "./notification-rules.mjs";

export { AgentNotificationEventType, NotificationEventType, PlatformNotificationEventType };

/**
 * @typedef {{ subject: string, lines: string[], path?: string }} NotificationMessage
 */

/**
 * @typedef {{ excludeUserId?: string }} NotifyOptions
 */

/** @typedef {"platform" | "agent" | "merchant"} Portal */

/** Where each portal keeps the Alerts settings (email footer). */
const ALERTS_PATH = {
  platform: "settings/notifications",
  agent: "settings/notifications",
  merchant: "settings/notifications",
};

/**
 * @param {Portal} portal
 * @param {NotificationMessage} message
 */
export function buildNotificationEmail(portal, message) {
  const link = message.path != null ? portalWebUrl(portal, message.path) : null;
  const text = [
    ...message.lines,
    link ? `\nOpen: ${link}` : null,
    `\nYou can change these emails in Alerts: ${portalWebUrl(portal, ALERTS_PATH[portal])}`,
  ]
    .filter(Boolean)
    .join("\n");
  return { subject: `PaymentGate — ${message.subject}`, text };
}

/**
 * @param {string[]} recipients
 * @param {Portal} portal
 * @param {NotificationMessage} message
 */
async function sendTo(recipients, portal, message) {
  if (recipients.length === 0) return;
  const { subject, text } = buildNotificationEmail(portal, message);
  await Promise.all(
    recipients.map((to) => sendNotificationEmail({ to, subject, text })),
  );
}

/** @param {Promise<unknown>} work @param {string} eventType */
function runDetached(work, eventType) {
  work.catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[notify] ${eventType} failed: ${msg}`);
  });
}

/**
 * Email members of an agent org.
 * @param {string} agentOrgId
 * @param {string} eventType
 * @param {NotificationMessage} message
 * @param {NotifyOptions} [opts]
 */
export function notifyAgentOrg(agentOrgId, eventType, message, opts = {}) {
  if (!agentOrgId || !isOutboundMailConfigured()) return;
  runDetached(
    (async () => {
      const recipients = await listEmailRecipientsForEvent(
        agentOrgId,
        eventType,
        opts.excludeUserId ?? null,
      );
      await sendTo(recipients, "agent", message);
    })(),
    eventType,
  );
}

/**
 * Email the nearest agent above a merchant / site org.
 * @param {string} orgId
 * @param {string} eventType
 * @param {(merchantName: string) => NotificationMessage} build
 */
export function notifyAgentOfOrg(orgId, eventType, build) {
  if (!orgId || !isOutboundMailConfigured()) return;
  runDetached(
    (async () => {
      const found = await findNearestAgentForOrg(orgId);
      if (!found) return;
      const recipients = await listEmailRecipientsForEvent(found.agentOrgId, eventType);
      await sendTo(recipients, "agent", build(found.merchantName ?? "A merchant"));
    })(),
    eventType,
  );
}

/**
 * Email members of a merchant / site org (and its merchant parents).
 * @param {string} orgId
 * @param {string} eventType one of NotificationEventType
 * @param {NotificationMessage} message
 * @param {NotifyOptions & { orderCreatedBy?: string | null }} [opts]
 */
export function notifyMerchantOrg(orgId, eventType, message, opts = {}) {
  if (!orgId || !isOutboundMailConfigured()) return;
  runDetached(
    (async () => {
      const recipients = await listMerchantEmailRecipients({
        orgId,
        eventType,
        emailDefault: defaultEmailFor(eventType),
        cashierEligible: CASHIER_NOTIFICATION_EVENT_TYPES.includes(eventType),
        orderCreatedBy: opts.orderCreatedBy ?? null,
        excludeUserId: opts.excludeUserId ?? null,
      });
      await sendTo(recipients, "merchant", message);
    })(),
    eventType,
  );
}

/**
 * Email platform staff.
 * @param {string} eventType one of PlatformNotificationEventType
 * @param {NotificationMessage} message
 * @param {NotifyOptions} [opts]
 */
export function notifyPlatform(eventType, message, opts = {}) {
  if (!isOutboundMailConfigured()) return;
  runDetached(
    (async () => {
      const recipients = await listPlatformEmailRecipients(
        eventType,
        opts.excludeUserId ?? null,
      );
      await sendTo(recipients, "platform", message);
    })(),
    eventType,
  );
}

/**
 * @param {{ payable_amount?: string, asset?: string, invoice_amount_usd?: string | null }} order
 */
function orderAmountLabel(order) {
  const usd = order.invoice_amount_usd ? `${order.invoice_amount_usd} USD` : null;
  const token = order.payable_amount && order.asset
    ? `${order.payable_amount} ${order.asset}`
    : null;
  if (usd && token) return `${usd} (${token})`;
  return usd ?? token ?? "—";
}

/**
 * Merchant (and, for anomalies, platform) email for an order status event.
 * @param {string} orderId
 * @param {"completed" | "anomaly"} kind
 */
export function notifyOrderEvent(orderId, kind) {
  if (!orderId || !isOutboundMailConfigured()) return;
  const eventType =
    kind === "completed"
      ? NotificationEventType.PaymentCompleted
      : NotificationEventType.PaymentAnomaly;
  runDetached(
    (async () => {
      const order = await findOrderForNotification(orderId);
      if (!order) return;
      const number = String(order.order_number ?? orderId);
      const where = order.org_name ? String(order.org_name) : "your account";
      const amount = orderAmountLabel(order);
      const network = order.network ? ` on ${order.network}` : "";

      const message =
        kind === "completed"
          ? {
              subject: `Payment completed — order ${number}`,
              lines: [
                `Order ${number} at ${where} is completed: ${amount}${network}.`,
              ],
              path: `orders/${orderId}`,
            }
          : {
              subject: `Payment needs attention — order ${number}`,
              lines: [
                `Order ${number} at ${where} needs attention (underpaid, overpaid, late, or wrong network).`,
                `Expected ${amount}${network}${order.received_amount ? `; received ${order.received_amount} ${order.asset}` : ""}.`,
              ],
              path: `orders/${orderId}`,
            };

      const recipients = await listMerchantEmailRecipients({
        orgId: String(order.org_id),
        eventType,
        emailDefault: defaultEmailFor(eventType),
        cashierEligible: true,
        orderCreatedBy: order.created_by ? String(order.created_by) : null,
      });
      await sendTo(recipients, "merchant", message);

      if (kind === "anomaly") {
        const staff = await listPlatformEmailRecipients(
          PlatformNotificationEventType.PaymentAnomaly,
        );
        await sendTo(staff, "platform", {
          subject: `Payment anomaly — ${where}`,
          lines: [
            `Order ${number} at ${where} needs attention (payment anomaly).`,
            `Expected ${amount}${network}.`,
          ],
          path: `orders/${orderId}`,
        });
      }
    })(),
    eventType,
  );
}

const WEBHOOK_FAIL_WINDOW_MS = 60 * 60 * 1000;
/** @type {Map<string, number>} webhookId → last email time */
const webhookFailSentAt = new Map();

/**
 * One failure email per endpoint per window; true when this call may send.
 * @param {string} webhookId
 * @param {number} nowMs
 */
export function claimWebhookFailureSlot(webhookId, nowMs) {
  const last = webhookFailSentAt.get(webhookId);
  if (last != null && nowMs - last < WEBHOOK_FAIL_WINDOW_MS) return false;
  webhookFailSentAt.set(webhookId, nowMs);
  return true;
}

/**
 * Merchant email when a webhook delivery gives up — at most one per endpoint per hour.
 * @param {{ webhookId: string, orgId: string, url: string, eventType: string, attempts: number }} args
 * @param {number} [nowMs]
 * @returns {boolean} whether an email was scheduled
 */
export function notifyWebhookFailure(args, nowMs = Date.now()) {
  if (!args.orgId || !isOutboundMailConfigured()) return false;
  if (!claimWebhookFailureSlot(args.webhookId, nowMs)) return false;
  let host = args.url;
  try {
    host = new URL(args.url).host;
  } catch {
    /* keep raw url */
  }
  notifyMerchantOrg(args.orgId, NotificationEventType.WebhookFailures, {
    subject: `Webhook not reaching your server — ${host}`,
    lines: [
      `A ${args.eventType} delivery to ${args.url} failed after ${args.attempts} attempts.`,
      "Check that your endpoint is up and verifies the signed payload, then resend from Delivery history.",
      "Further failures for this endpoint are grouped — at most one email per hour.",
    ],
    path: "networks",
  });
  return true;
}

/** Test hook. */
export function resetWebhookFailureThrottle() {
  webhookFailSentAt.clear();
}

/**
 * @param {{ total_amount?: string | number | null, currency?: string | null }} bill
 */
function billAmountLabel(bill) {
  return `${bill.total_amount ?? "—"} ${bill.currency ?? "USD"}`;
}

/**
 * Merchant email when a service bill is issued (sent).
 * @param {{ id: string, org_id: string, total_amount?: string | number | null, currency?: string | null, due_at?: string | Date | null, bill_kind?: string | null }} bill
 */
export function notifyServiceBillIssued(bill) {
  if (!bill?.org_id) return;
  const due = bill.due_at ? new Date(bill.due_at).toISOString().slice(0, 10) : null;
  const kind = bill.bill_kind === "activation" ? "Activation fee bill" : "Service bill";
  notifyMerchantOrg(String(bill.org_id), NotificationEventType.ServiceBills, {
    subject: `${kind} issued — ${billAmountLabel(bill)}`,
    lines: [
      `A new ${kind.toLowerCase()} of ${billAmountLabel(bill)} was issued${due ? `, due ${due}` : ""}.`,
      "Unpaid bills pause new payment orders once they are overdue.",
    ],
    path: `service-bills/${bill.id}`,
  });
}

/**
 * Merchant + platform email when a service bill goes overdue.
 * @param {{ id: string, org_id: string, total_amount?: string | number | null, currency?: string | null }} bill
 */
export function notifyServiceBillOverdue(bill) {
  if (!bill?.org_id || !isOutboundMailConfigured()) return;
  const orgId = String(bill.org_id);
  notifyMerchantOrg(orgId, NotificationEventType.ServiceBills, {
    subject: `Service bill overdue — ${billAmountLabel(bill)}`,
    lines: [
      `Your service bill of ${billAmountLabel(bill)} is overdue.`,
      "New payment orders are paused until it is paid.",
    ],
    path: `service-bills/${bill.id}`,
  });
  runDetached(
    (async () => {
      const name = (await findOrgName(orgId)) ?? "A merchant";
      const staff = await listPlatformEmailRecipients(
        PlatformNotificationEventType.BillOverdue,
      );
      await sendTo(staff, "platform", {
        subject: `Service bill overdue — ${name}`,
        lines: [
          `${name} has an overdue service bill of ${billAmountLabel(bill)} and is paused.`,
        ],
        path: `service-bills/${bill.id}`,
      });
    })(),
    PlatformNotificationEventType.BillOverdue,
  );
}
