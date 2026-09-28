import { getPool } from "../db/pool.mjs";
import {
  mergeNotificationPreferences,
  NOTIFICATION_EVENT_TYPES,
} from "./notification-rules.mjs";

/**
 * @param {string} userId
 * @param {string} orgId
 * @param {readonly string[]} [eventTypes]
 */
export async function listNotificationPreferences(
  userId,
  orgId,
  eventTypes = NOTIFICATION_EVENT_TYPES,
) {
  const { rows } = await getPool().query(
    `SELECT event_type, email, in_app
     FROM notification_preferences
     WHERE user_id = $1 AND org_id = $2`,
    [userId, orgId],
  );
  /** @type {Map<string, object>} */
  const map = new Map();
  for (const row of rows) {
    map.set(row.event_type, row);
  }
  return mergeNotificationPreferences(map, eventTypes);
}

/**
 * Replace all preference rows for user+org.
 * @param {string} userId
 * @param {string} orgId
 * @param {{ eventType: string, email: boolean, inApp: boolean }[]} items
 * @param {readonly string[]} [eventTypes]
 */
export async function upsertNotificationPreferences(
  userId,
  orgId,
  items,
  eventTypes = NOTIFICATION_EVENT_TYPES,
) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM notification_preferences
       WHERE user_id = $1 AND org_id = $2`,
      [userId, orgId],
    );
    for (const item of items) {
      await client.query(
        `INSERT INTO notification_preferences
           (user_id, org_id, event_type, email, in_app, updated_at)
         VALUES ($1, $2, $3, $4, $5, now())`,
        [userId, orgId, item.eventType, item.email, item.inApp],
      );
    }
    await client.query("COMMIT");
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
  return listNotificationPreferences(userId, orgId, eventTypes);
}

/**
 * Active members of `orgId` who keep email on for `eventType` (default on).
 * @param {string} orgId
 * @param {string} eventType
 * @param {string | null} [excludeUserId]
 * @returns {Promise<string[]>}
 */
export async function listEmailRecipientsForEvent(
  orgId,
  eventType,
  excludeUserId = null,
) {
  const { rows } = await getPool().query(
    `SELECT DISTINCT u.email
     FROM org_memberships m
     JOIN users u ON u.id = m.user_id
     LEFT JOIN notification_preferences p
       ON p.user_id = m.user_id AND p.org_id = m.org_id AND p.event_type = $2
     WHERE m.org_id = $1
       AND m.status = 'active'
       AND u.email IS NOT NULL
       AND u.email_verified_at IS NOT NULL
       AND COALESCE(p.email, true)
       AND ($3::uuid IS NULL OR m.user_id <> $3::uuid)`,
    [orgId, eventType, excludeUserId],
  );
  return rows.map((r) => String(r.email)).filter(Boolean);
}

/**
 * Members of a merchant / site org and its merchant ancestors who keep email on
 * for `eventType`. Cashiers only get `cashierEligible` events, and — when
 * `orderCreatedBy` is set — only for orders they created.
 * @param {{
 *   orgId: string,
 *   eventType: string,
 *   emailDefault: boolean,
 *   cashierEligible: boolean,
 *   orderCreatedBy?: string | null,
 *   excludeUserId?: string | null,
 * }} args
 * @returns {Promise<string[]>}
 */
export async function listMerchantEmailRecipients(args) {
  const { rows } = await getPool().query(
    `WITH RECURSIVE up AS (
       SELECT id, type, parent_id, 0 AS depth
       FROM org_accounts WHERE id = $1
       UNION ALL
       SELECT o.id, o.type, o.parent_id, up.depth + 1
       FROM org_accounts o
       JOIN up ON o.id = up.parent_id
       WHERE up.type IN ('merchant', 'merchant_site') AND up.depth < 12
     )
     SELECT DISTINCT u.email
     FROM up
     JOIN org_memberships m ON m.org_id = up.id
     JOIN users u ON u.id = m.user_id
     LEFT JOIN notification_preferences p
       ON p.user_id = m.user_id AND p.org_id = m.org_id AND p.event_type = $2
     WHERE up.type IN ('merchant', 'merchant_site')
       AND m.status = 'active'
       AND u.email IS NOT NULL
       AND u.email_verified_at IS NOT NULL
       AND COALESCE(p.email, $3::boolean)
       AND (
         m.role <> 'cashier'
         OR ($4::boolean AND ($5::uuid IS NULL OR m.user_id = $5::uuid))
       )
       AND ($6::uuid IS NULL OR m.user_id <> $6::uuid)`,
    [
      args.orgId,
      args.eventType,
      args.emailDefault,
      args.cashierEligible,
      args.orderCreatedBy ?? null,
      args.excludeUserId ?? null,
    ],
  );
  return rows.map((r) => String(r.email)).filter(Boolean);
}

/**
 * Platform staff (every platform org) who keep email on for `eventType`.
 * @param {string} eventType
 * @param {string | null} [excludeUserId]
 * @returns {Promise<string[]>}
 */
export async function listPlatformEmailRecipients(eventType, excludeUserId = null) {
  const { rows } = await getPool().query(
    `SELECT DISTINCT u.email
     FROM org_accounts o
     JOIN org_memberships m ON m.org_id = o.id
     JOIN users u ON u.id = m.user_id
     LEFT JOIN notification_preferences p
       ON p.user_id = m.user_id AND p.org_id = m.org_id AND p.event_type = $1
     WHERE o.type = 'platform'
       AND m.status = 'active'
       AND u.email IS NOT NULL
       AND u.email_verified_at IS NOT NULL
       AND COALESCE(p.email, true)
       AND ($2::uuid IS NULL OR m.user_id <> $2::uuid)`,
    [eventType, excludeUserId],
  );
  return rows.map((r) => String(r.email)).filter(Boolean);
}

/**
 * Order facts for merchant payment emails.
 * @param {string} orderId
 */
export async function findOrderForNotification(orderId) {
  const { rows } = await getPool().query(
    `SELECT o.order_number, o.org_id, o.created_by, o.asset, o.network,
            o.payable_amount, o.received_amount, o.invoice_amount_usd,
            a.name AS org_name
     FROM payment_orders o
     JOIN org_accounts a ON a.id = o.org_id
     WHERE o.id = $1`,
    [orderId],
  );
  return rows[0] ?? null;
}

/**
 * @param {string} orgId
 * @returns {Promise<string | null>}
 */
export async function findOrgName(orgId) {
  const { rows } = await getPool().query(
    `SELECT name FROM org_accounts WHERE id = $1`,
    [orgId],
  );
  return rows[0]?.name ? String(rows[0].name) : null;
}

/**
 * Nearest agent org at or above `orgId`, with the merchant org it passed
 * through (null when `orgId` is the agent itself).
 * @param {string} orgId
 * @returns {Promise<{ agentOrgId: string, merchantName: string | null } | null>}
 */
export async function findNearestAgentForOrg(orgId) {
  const { rows } = await getPool().query(
    `WITH RECURSIVE up AS (
       SELECT id, type, name, parent_id, 0 AS depth
       FROM org_accounts WHERE id = $1
       UNION ALL
       SELECT o.id, o.type, o.name, o.parent_id, up.depth + 1
       FROM org_accounts o
       JOIN up ON o.id = up.parent_id
       WHERE up.depth < 12
     )
     SELECT
       (SELECT id FROM up WHERE type = 'agent' ORDER BY depth LIMIT 1) AS agent_org_id,
       (SELECT name FROM up WHERE type = 'merchant' ORDER BY depth LIMIT 1) AS merchant_name`,
    [orgId],
  );
  const row = rows[0];
  if (!row?.agent_org_id) return null;
  return {
    agentOrgId: String(row.agent_org_id),
    merchantName: row.merchant_name ? String(row.merchant_name) : null,
  };
}

export { NOTIFICATION_EVENT_TYPES };
