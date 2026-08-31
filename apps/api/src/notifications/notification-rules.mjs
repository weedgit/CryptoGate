import {
  NOTIFICATION_EVENT_TYPES,
  NotificationEventType,
} from "@cryptogate/domain";

export { NOTIFICATION_EVENT_TYPES, NotificationEventType };

/**
 * @param {unknown} body
 */
export function validateNotificationPrefsBody(body) {
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

  const allowed = new Set(NOTIFICATION_EVENT_TYPES);
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

  // Fill missing event types with prior defaults (true/true) so PUT is complete.
  /** @type {{ eventType: string, email: boolean, inApp: boolean }[]} */
  const normalized = [];
  for (const eventType of NOTIFICATION_EVENT_TYPES) {
    normalized.push(
      byType.get(eventType) ?? {
        eventType,
        email: true,
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
    email: row?.email ?? true,
    inApp: row?.in_app ?? true,
  };
}

/**
 * @param {Map<string, object> | Record<string, object>} stored
 */
export function mergeNotificationPreferences(stored) {
  const map =
    stored instanceof Map
      ? stored
      : new Map(Object.entries(stored ?? {}));
  return NOTIFICATION_EVENT_TYPES.map((eventType) =>
    toNotificationPreference(eventType, map.get(eventType)),
  );
}
