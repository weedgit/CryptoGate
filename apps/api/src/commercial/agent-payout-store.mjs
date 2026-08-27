import { getPool } from "../db/pool.mjs";

/**
 * @param {string} orgId
 */
export async function findAgentPayoutAddress(orgId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT org_id, asset, network, address, created_at, updated_at
     FROM agent_payout_addresses
     WHERE org_id = $1`,
    [orgId],
  );
  return rows[0] ?? null;
}

/**
 * @param {{ orgId: string, asset: string, network: string, address: string }} input
 */
export async function upsertAgentPayoutAddress(input) {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO agent_payout_addresses (org_id, asset, network, address)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (org_id) DO UPDATE SET
       asset = EXCLUDED.asset,
       network = EXCLUDED.network,
       address = EXCLUDED.address,
       updated_at = now()
     RETURNING org_id, asset, network, address, created_at, updated_at`,
    [input.orgId, input.asset, input.network, input.address],
  );
  return rows[0];
}
