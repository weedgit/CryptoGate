import { getPool } from "../db/pool.mjs";

const SELECT = `org_id, asset, network, address, pending_address, pending_activates_at, created_at, updated_at`;

/**
 * Promote due pending addresses to active (call on GET).
 */
export async function applyDueAgentPayoutAddresses() {
  await getPool().query(
    `UPDATE agent_payout_addresses
     SET address = pending_address,
         pending_address = NULL,
         pending_activates_at = NULL,
         updated_at = now()
     WHERE pending_address IS NOT NULL
       AND pending_activates_at IS NOT NULL
       AND pending_activates_at <= now()`,
  );
}

/**
 * @param {string} orgId
 */
export async function findAgentPayoutAddress(orgId) {
  await applyDueAgentPayoutAddresses();
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT ${SELECT}
     FROM agent_payout_addresses
     WHERE org_id = $1`,
    [orgId],
  );
  return rows[0] ?? null;
}

/**
 * Batch read for commissions boards (avoids N× GET /orgs/{id}/agent-payout).
 * @param {string[]} orgIds
 */
export async function listAgentPayoutAddressesByOrgIds(orgIds) {
  if (!orgIds.length) return [];
  await applyDueAgentPayoutAddresses();
  const { rows } = await getPool().query(
    `SELECT ${SELECT}
     FROM agent_payout_addresses
     WHERE org_id = ANY($1::uuid[])
     ORDER BY org_id ASC`,
    [orgIds],
  );
  return rows;
}

/**
 * First set activates immediately; changes go pending until cool-down.
 * @param {{
 *   orgId: string,
 *   asset: string,
 *   network: string,
 *   address: string,
 *   cooldownMs: number,
 * }} input
 */
export async function upsertAgentPayoutAddress(input) {
  const pool = getPool();
  const existing = await findAgentPayoutAddress(input.orgId);

  if (!existing) {
    const { rows } = await pool.query(
      `INSERT INTO agent_payout_addresses (org_id, asset, network, address)
       VALUES ($1, $2, $3, $4)
       RETURNING ${SELECT}`,
      [input.orgId, input.asset, input.network, input.address],
    );
    return { row: rows[0], kind: "activated" };
  }

  if (
    existing.address === input.address &&
    existing.asset === input.asset &&
    existing.network === input.network
  ) {
    const { rows } = await pool.query(
      `UPDATE agent_payout_addresses
       SET pending_address = NULL,
           pending_activates_at = NULL,
           updated_at = now()
       WHERE org_id = $1
       RETURNING ${SELECT}`,
      [input.orgId],
    );
    return { row: rows[0], kind: "unchanged" };
  }

  const activatesAt = new Date(Date.now() + input.cooldownMs);
  const { rows } = await pool.query(
    `UPDATE agent_payout_addresses
     SET asset = $2,
         network = $3,
         pending_address = $4,
         pending_activates_at = $5,
         updated_at = now()
     WHERE org_id = $1
     RETURNING ${SELECT}`,
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
