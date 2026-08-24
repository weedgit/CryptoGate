import { getPool } from "../db/pool.mjs";

/**
 * @param {import("pg").Pool | import("pg").PoolClient | null | undefined} client
 */
function db(client) {
  return client ?? getPool();
}

/**
 * @param {string} orgId
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function listSettlementAddresses(orgId, client) {
  const { rows } = await db(client).query(
    `SELECT org_id, asset, network, address
     FROM settlement_addresses
     WHERE org_id = $1
     ORDER BY asset ASC, network ASC`,
    [orgId],
  );
  return rows;
}

/**
 * @param {string} orgId
 * @param {string} asset
 * @param {string} network
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function findSettlementAddress(orgId, asset, network, client) {
  const { rows } = await db(client).query(
    `SELECT org_id, asset, network, address
     FROM settlement_addresses
     WHERE org_id = $1 AND asset = $2 AND network = $3`,
    [orgId, asset, network],
  );
  return rows[0] ?? null;
}

/**
 * @param {{ orgId: string, asset: string, network: string, address: string }} input
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function upsertSettlementAddress(input, client) {
  const { rows } = await db(client).query(
    `INSERT INTO settlement_addresses (org_id, asset, network, address)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (org_id, asset, network)
     DO UPDATE SET address = EXCLUDED.address, updated_at = now()
     RETURNING org_id, asset, network, address`,
    [input.orgId, input.asset, input.network, input.address],
  );
  return rows[0];
}
