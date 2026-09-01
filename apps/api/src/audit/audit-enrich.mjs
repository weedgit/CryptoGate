import { getPool } from "../db/pool.mjs";

const TARGET_USER_KEYS = ["invitedUserId", "targetUserId"];

/**
 * @param {unknown} metadata
 * @param {Map<string, { email: string, display_name: string | null }>} usersById
 */
function enrichMetadata(metadata, usersById) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return metadata;
  }
  /** @type {Record<string, string | number | boolean | null>} */
  const meta = { ...metadata };
  for (const key of TARGET_USER_KEYS) {
    const raw = meta[key];
    if (raw == null) continue;
    const user = usersById.get(String(raw));
    if (!user) continue;
    if (!meta.email && user.email) meta.email = user.email;
    if (!meta.displayName && user.display_name) meta.displayName = user.display_name;
  }
  return meta;
}

/**
 * Resolve portal user emails / display names for audit list rows (read-time enrichment).
 * @param {ReadonlyArray<{ actor_user_id?: string | null, metadata?: unknown }>} rows
 */
export async function enrichAuditLogRows(rows) {
  if (!rows.length) return rows;

  /** @type {Set<string>} */
  const ids = new Set();
  for (const row of rows) {
    if (row.actor_user_id) ids.add(String(row.actor_user_id));
    const meta = row.metadata;
    if (meta && typeof meta === "object" && !Array.isArray(meta)) {
      for (const key of TARGET_USER_KEYS) {
        if (meta[key] != null) ids.add(String(meta[key]));
      }
    }
  }
  if (ids.size === 0) return rows;

  const { rows: users } = await getPool().query(
    `SELECT id, email, display_name
     FROM users
     WHERE id = ANY($1::uuid[])`,
    [[...ids]],
  );
  /** @type {Map<string, { email: string, display_name: string | null }>} */
  const usersById = new Map(
    users.map((u) => [
      String(u.id),
      {
        email: typeof u.email === "string" ? u.email : "",
        display_name:
          typeof u.display_name === "string" ? u.display_name : null,
      },
    ]),
  );

  return rows.map((row) => {
    const actor = row.actor_user_id
      ? usersById.get(String(row.actor_user_id))
      : null;
    return {
      ...row,
      metadata: enrichMetadata(row.metadata, usersById),
      actor_email: actor?.email?.trim() || null,
      actor_display_name: actor?.display_name?.trim() || null,
    };
  });
}
