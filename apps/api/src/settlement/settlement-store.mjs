import { getPool } from "../db/pool.mjs";

const SETTLEMENT_SELECT = `
  org_id, asset, network, address, pending_address, pending_activates_at
`;

/**
 * @param {import("pg").Pool | import("pg").PoolClient | null | undefined} client
 */
function db(client) {
  return client ?? getPool();
}

/**
 * Promote pending addresses whose cool-down has ended.
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 * @returns {Promise<number>} rows activated
 */
export async function activateDuePendingSettlements(client) {
  const { rowCount } = await db(client).query(
    `UPDATE settlement_addresses
     SET address = pending_address,
         pending_address = NULL,
         pending_activates_at = NULL,
         updated_at = now()
     WHERE pending_address IS NOT NULL
       AND pending_activates_at IS NOT NULL
       AND pending_activates_at <= now()`,
  );
  return rowCount ?? 0;
}

/**
 * @param {string} orgId
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function listSettlementAddresses(orgId, client) {
  await activateDuePendingSettlements(client);
  const { rows } = await db(client).query(
    `SELECT ${SETTLEMENT_SELECT}
     FROM settlement_addresses
     WHERE org_id = $1
     ORDER BY asset ASC, network ASC`,
    [orgId],
  );
  return rows;
}

/**
 * Active address for matching assign (after promoting due pending).
 * @param {string} orgId
 * @param {string} asset
 * @param {string} network
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function findSettlementAddress(orgId, asset, network, client) {
  await activateDuePendingSettlements(client);
  const { rows } = await db(client).query(
    `SELECT ${SETTLEMENT_SELECT}
     FROM settlement_addresses
     WHERE org_id = $1 AND asset = $2 AND network = $3`,
    [orgId, asset, network],
  );
  return rows[0] ?? null;
}

/**
 * First set activates immediately. Changes go to pending until cool-down ends.
 * @param {{
 *   orgId: string,
 *   asset: string,
 *   network: string,
 *   address: string,
 *   cooldownMs: number,
 * }} input
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function upsertSettlementAddress(input, client) {
  const existing = await findSettlementAddress(
    input.orgId,
    input.asset,
    input.network,
    client,
  );

  if (!existing) {
    const { rows } = await db(client).query(
      `INSERT INTO settlement_addresses (org_id, asset, network, address)
       VALUES ($1, $2, $3, $4)
       RETURNING ${SETTLEMENT_SELECT}`,
      [input.orgId, input.asset, input.network, input.address],
    );
    return { row: rows[0], kind: "activated" };
  }

  if (existing.address === input.address) {
    const { rows } = await db(client).query(
      `UPDATE settlement_addresses
       SET pending_address = NULL,
           pending_activates_at = NULL,
           updated_at = now()
       WHERE org_id = $1 AND asset = $2 AND network = $3
       RETURNING ${SETTLEMENT_SELECT}`,
      [input.orgId, input.asset, input.network],
    );
    return { row: rows[0], kind: "unchanged" };
  }

  const activatesAt = new Date(Date.now() + input.cooldownMs);
  const { rows } = await db(client).query(
    `UPDATE settlement_addresses
     SET pending_address = $4,
         pending_activates_at = $5,
         updated_at = now()
     WHERE org_id = $1 AND asset = $2 AND network = $3
     RETURNING ${SETTLEMENT_SELECT}`,
    [
      input.orgId,
      input.asset,
      input.network,
      input.address,
      activatesAt.toISOString(),
    ],
  );
  return { row: rows[0], kind: "pending" };
}

/**
 * B7 compliance: force active settlement address immediately (no cool-down).
 * @param {{ orgId: string, asset: string, network: string, address: string }} input
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function forceSettlementAddress(input, client) {
  const existing = await findSettlementAddress(
    input.orgId,
    input.asset,
    input.network,
    client,
  );

  if (!existing) {
    const { rows } = await db(client).query(
      `INSERT INTO settlement_addresses (org_id, asset, network, address)
       VALUES ($1, $2, $3, $4)
       RETURNING ${SETTLEMENT_SELECT}`,
      [input.orgId, input.asset, input.network, input.address],
    );
    return rows[0];
  }

  const { rows } = await db(client).query(
    `UPDATE settlement_addresses
     SET address = $4,
         pending_address = NULL,
         pending_activates_at = NULL,
         updated_at = now()
     WHERE org_id = $1 AND asset = $2 AND network = $3
     RETURNING ${SETTLEMENT_SELECT}`,
    [input.orgId, input.asset, input.network, input.address],
  );
  return rows[0];
}
