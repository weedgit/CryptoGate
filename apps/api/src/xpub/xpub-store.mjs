import { getPool } from "../db/pool.mjs";

const XPUB_SELECT = `
  org_id, asset, network, xpub, pending_xpub, pending_activates_at
`;

/**
 * @param {import("pg").Pool | import("pg").PoolClient | null | undefined} client
 */
function db(client) {
  return client ?? getPool();
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function activateDuePendingXpubs(client) {
  const { rowCount } = await db(client).query(
    `UPDATE merchant_xpubs
     SET xpub = pending_xpub,
         pending_xpub = NULL,
         pending_activates_at = NULL,
         updated_at = now()
     WHERE pending_xpub IS NOT NULL
       AND pending_activates_at IS NOT NULL
       AND pending_activates_at <= now()`,
  );
  return rowCount ?? 0;
}

/**
 * @param {string} orgId
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function listXpubs(orgId, client) {
  await activateDuePendingXpubs(client);
  const { rows } = await db(client).query(
    `SELECT ${XPUB_SELECT}
     FROM merchant_xpubs
     WHERE org_id = $1
     ORDER BY asset ASC, network ASC`,
    [orgId],
  );
  return rows;
}

/**
 * True when an active (non-pending-only) xPub is configured.
 * @param {string} orgId
 * @param {string} asset
 * @param {string} network
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function hasActiveXpub(orgId, asset, network, client) {
  await activateDuePendingXpubs(client);
  const { rows } = await db(client).query(
    `SELECT 1
     FROM merchant_xpubs
     WHERE org_id = $1 AND asset = $2 AND network = $3 AND xpub IS NOT NULL`,
    [orgId, asset, network],
  );
  return rows.length > 0;
}

/**
 * Active watch-only xPub string. Do not log the return value.
 * @param {string} orgId
 * @param {string} asset
 * @param {string} network
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 * @returns {Promise<string | null>}
 */
export async function getActiveXpub(orgId, asset, network, client) {
  await activateDuePendingXpubs(client);
  const { rows } = await db(client).query(
    `SELECT xpub
     FROM merchant_xpubs
     WHERE org_id = $1 AND asset = $2 AND network = $3 AND xpub IS NOT NULL`,
    [orgId, asset, network],
  );
  return rows[0]?.xpub ?? null;
}

/**
 * @param {{
 *   orgId: string,
 *   asset: string,
 *   network: string,
 *   xPub: string,
 *   cooldownMs: number,
 * }} input
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function upsertXpub(input, client) {
  await activateDuePendingXpubs(client);
  const { rows: existingRows } = await db(client).query(
    `SELECT ${XPUB_SELECT}
     FROM merchant_xpubs
     WHERE org_id = $1 AND asset = $2 AND network = $3`,
    [input.orgId, input.asset, input.network],
  );
  const existing = existingRows[0] ?? null;

  if (!existing) {
    const { rows } = await db(client).query(
      `INSERT INTO merchant_xpubs (org_id, asset, network, xpub)
       VALUES ($1, $2, $3, $4)
       RETURNING ${XPUB_SELECT}`,
      [input.orgId, input.asset, input.network, input.xPub],
    );
    return { row: rows[0], kind: "activated" };
  }

  if (existing.xpub === input.xPub) {
    const { rows } = await db(client).query(
      `UPDATE merchant_xpubs
       SET pending_xpub = NULL,
           pending_activates_at = NULL,
           updated_at = now()
       WHERE org_id = $1 AND asset = $2 AND network = $3
       RETURNING ${XPUB_SELECT}`,
      [input.orgId, input.asset, input.network],
    );
    return { row: rows[0], kind: "unchanged" };
  }

  const activatesAt = new Date(Date.now() + input.cooldownMs);
  const { rows } = await db(client).query(
    `UPDATE merchant_xpubs
     SET pending_xpub = $4,
         pending_activates_at = $5,
         updated_at = now()
     WHERE org_id = $1 AND asset = $2 AND network = $3
     RETURNING ${XPUB_SELECT}`,
    [
      input.orgId,
      input.asset,
      input.network,
      input.xPub,
      activatesAt.toISOString(),
    ],
  );
  return { row: rows[0], kind: "pending" };
}
