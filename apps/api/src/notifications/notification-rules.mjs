import {
  NOTIFICATION_EVENT_TYPES,
  NotificationEventType,
} from "@paymentgate/domain";

export { NOTIFICATION_EVENT_TYPES, NotificationEventType };

/** Agent-portal notification events (per user + agent org). */
export const AgentNotificationEventType = Object.freeze({
  CommissionPaid: "commission_paid",
  PayoutWallet: "payout_wallet",
  MerchantOnboarded: "merchant_onboarded",
  MerchantBillOverdue: "merchant_bill_overdue",
  MerchantPaymentAnomaly: "merchant_payment_anomaly",
  TeamMemberJoined: "team_member_joined",
});

export const AGENT_NOTIFICATION_EVENT_TYPES = Object.freeze(
  Object.values(AgentNotificationEventType),
);

/** Platform-portal notification events (per user + platform org). */
export const PlatformNotificationEventType = Object.freeze({
  BillOverdue: "platform_bill_overdue",
  PaymentAnomaly: "platform_payment_anomaly",
  AccountCreated: "platform_account_created",
  TeamMemberJoined: "platform_team_member_joined",
  SystemHealth: "platform_system_health",
  CommissionStuck: "platform_commission_stuck",
});

export const PLATFORM_NOTIFICATION_EVENT_TYPES = Object.freeze(
  Object.values(PlatformNotificationEventType),
);

/** Every order completes one — email stays opt-in so inboxes are not flooded. */
const EMAIL_OFF_BY_DEFAULT = new Set([NotificationEventType.PaymentCompleted]);

/** @param {string} eventType */
export function defaultEmailFor(eventType) {
  return !EMAIL_OFF_BY_DEFAULT.has(eventType);
}

/** Merchant events a Cashier can act on (own orders); the rest are Owner/Admin matters. */
export const CASHIER_NOTIFICATION_EVENT_TYPES = Object.freeze([
  NotificationEventType.PaymentCompleted,
  NotificationEventType.PaymentAnomaly,
]);

/**
 * @param {string} orgType
 * @param {string | null} [role] caller's role on the org
 */
export function notificationEventTypesForOrgType(orgType, role = null) {
  if (orgType === "agent") return AGENT_NOTIFICATION_EVENT_TYPES;
  if (orgType === "platform") return PLATFORM_NOTIFICATION_EVENT_TYPES;
  return role === "cashier"
    ? CASHIER_NOTIFICATION_EVENT_TYPES
    : NOTIFICATION_EVENT_TYPES;
}

/**
 * @param {unknown} body
 * @param {readonly string[]} [eventTypes]
 */
export function validateNotificationPrefsBody(
  body,
  eventTypes = NOTIFICATION_EVENT_TYPES,
) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, status: 400, code: "invalid_request", message: "Invalid body" };
  }
  const items = body.items;
  if (!Array.isArray(items) || items.length === 0) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "items must be a non-empty array",
    };
  }

  const allowed = new Set(eventTypes);
  /** @type {Map<string, { eventType: string, email: boolean, inApp: boolean }>} */
  const byType = new Map();

  for (const row of items) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return {
        ok: false,
        status: 400,
        code: "invalid_request",
        message: "Each preference item must be an object",
      };
    }
    const eventType =
      typeof row.eventType === "string" ? row.eventType.trim() : "";
    if (!allowed.has(eventType)) {
      return {
        ok: false,
        status: 400,
        code: "invalid_event_type",
        message: `Unknown eventType: ${eventType || "(empty)"}`,
      };
    }
    if (typeof row.email !== "boolean" || typeof row.inApp !== "boolean") {
      return {
        ok: false,
        status: 400,
        code: "invalid_request",
        message: "email and inApp must be booleans",
      };
    }
    byType.set(eventType, {
      eventType,
      email: row.email,
      inApp: row.inApp,
    });
  }

  // Fill missing event types with defaults so PUT is complete.
  /** @type {{ eventType: string, email: boolean, inApp: boolean }[]} */
  const normalized = [];
  for (const eventType of eventTypes) {
    normalized.push(
      byType.get(eventType) ?? {
        eventType,
        email: defaultEmailFor(eventType),
        inApp: true,
      },
    );
  }

  return { ok: true, items: normalized };
}

/**
 * @param {string} eventType
 * @param {{ email?: boolean, in_app?: boolean } | null | undefined} row
 */
export function toNotificationPreference(eventType, row) {
  return {
    eventType,
    email: row?.email ?? defaultEmailFor(eventType),
    inApp: row?.in_app ?? true,
  };
}

/**
 * @param {Map<string, object> | Record<string, object>} stored
 * @param {readonly string[]} [eventTypes]
 */
export function mergeNotificationPreferences(
  stored,
  eventTypes = NOTIFICATION_EVENT_TYPES,
) {
  const map =
    stored instanceof Map
      ? stored
      : new Map(Object.entries(stored ?? {}));
  return eventTypes.map((eventType) =>
    toNotificationPreference(eventType, map.get(eventType)),
  );
}
