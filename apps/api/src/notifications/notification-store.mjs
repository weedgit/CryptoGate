import { getPool } from "../db/pool.mjs";
import {
  mergeNotificationPreferences,
  NOTIFICATION_EVENT_TYPES,
} from "./notification-rules.mjs";

/**
 * @param {string} userId
 * @param {string} orgId
 */
export async function listNotificationPreferences(userId, orgId) {
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
  return mergeNotificationPreferences(map);
}

/**
 * Replace all preference rows for user+org.
 * @param {string} userId
 * @param {string} orgId
 * @param {{ eventType: string, email: boolean, inApp: boolean }[]} items
 */
export async function upsertNotificationPreferences(userId, orgId, items) {
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
  return listNotificationPreferences(userId, orgId);
}

export { NOTIFICATION_EVENT_TYPES };
