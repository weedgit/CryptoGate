import { getPool } from "../db/pool.mjs";

/**
 * @param {string} orgId
 */
export async function listSettlementAddresses(orgId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT org_id, asset, network, address
     FROM settlement_addresses
     WHERE org_id = $1
     ORDER BY asset ASC, network ASC`,
    [orgId],
  );
  return rows;
}

/**
 * @param {{ orgId: string, asset: string, network: string, address: string }} input
 */
export async function upsertSettlementAddress(input) {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO settlement_addresses (org_id, asset, network, address)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (org_id, asset, network)
     DO UPDATE SET address = EXCLUDED.address, updated_at = now()
     RETURNING org_id, asset, network, address`,
    [input.orgId, input.asset, input.network, input.address],
  );
  return rows[0];
}
