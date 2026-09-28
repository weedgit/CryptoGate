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
 * Receive address for an order. Wallets are per network, so an asset without its
 * own row uses the active address of another asset on the same network.
 * @param {string} orgId
 * @param {string} asset
 * @param {string} network
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function findNetworkSettlementAddress(orgId, asset, network, client) {
  const exact = await findSettlementAddress(orgId, asset, network, client);
  if (exact?.address?.trim()) return exact;
  const { rows } = await db(client).query(
    `SELECT ${SETTLEMENT_SELECT}
     FROM settlement_addresses
     WHERE org_id = $1 AND network = $2 AND btrim(address) <> ''
     ORDER BY updated_at DESC, asset ASC
     LIMIT 1`,
    [orgId, network],
  );
  return rows[0] ?? exact ?? null;
}

/**
 * @template T
 * @param {(client: import("pg").PoolClient) => Promise<T>} work
 * @returns {Promise<T>}
 */
async function inTransaction(work) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * One wallet per network: writes `address` to every asset in `assets`.
 * The first address on a network activates immediately; any change (including
 * assets added later while another address is active) waits for the cool-down.
 * @param {{
 *   orgId: string,
 *   network: string,
 *   assets: string[],
 *   address: string,
 *   cooldownMs: number,
 * }} input
 * @returns {Promise<{ rows: any[], kind: "activated" | "pending" | "unchanged" }>}
 */
export async function upsertNetworkSettlementAddress(input) {
  return inTransaction(async (client) => {
    await activateDuePendingSettlements(client);
    const { rows: existingRows } = await client.query(
      `SELECT ${SETTLEMENT_SELECT}
       FROM settlement_addresses
       WHERE org_id = $1 AND network = $2
       ORDER BY updated_at DESC
       FOR UPDATE`,
      [input.orgId, input.network],
    );
    const byAsset = new Map(existingRows.map((row) => [row.asset, row]));
    const networkActive =
      existingRows.find((row) => typeof row.address === "string" && row.address.trim())
        ?.address ?? null;
    const activatesAt = new Date(Date.now() + input.cooldownMs).toISOString();

    let anyPending = false;
    let anyActivated = false;
    const rows = [];
    for (const asset of input.assets) {
      const existing = byAsset.get(asset);
      const key = [input.orgId, asset, input.network];
      if (!existing) {
        if (!networkActive || networkActive === input.address) {
          const { rows: inserted } = await client.query(
            `INSERT INTO settlement_addresses (org_id, asset, network, address)
             VALUES ($1, $2, $3, $4)
             RETURNING ${SETTLEMENT_SELECT}`,
            [...key, input.address],
          );
          if (!networkActive) anyActivated = true;
          rows.push(inserted[0]);
        } else {
          const { rows: inserted } = await client.query(
            `INSERT INTO settlement_addresses
               (org_id, asset, network, address, pending_address, pending_activates_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING ${SETTLEMENT_SELECT}`,
            [...key, networkActive, input.address, activatesAt],
          );
          anyPending = true;
          rows.push(inserted[0]);
        }
        continue;
      }
      if (existing.address === input.address) {
        const { rows: updated } = await client.query(
          `UPDATE settlement_addresses
           SET pending_address = NULL, pending_activates_at = NULL, updated_at = now()
           WHERE org_id = $1 AND asset = $2 AND network = $3
           RETURNING ${SETTLEMENT_SELECT}`,
          key,
        );
        rows.push(updated[0]);
        continue;
      }
      const { rows: updated } = await client.query(
        `UPDATE settlement_addresses
         SET pending_address = $4, pending_activates_at = $5, updated_at = now()
         WHERE org_id = $1 AND asset = $2 AND network = $3
         RETURNING ${SETTLEMENT_SELECT}`,
        [...key, input.address, activatesAt],
      );
      anyPending = true;
      rows.push(updated[0]);
    }
    const kind = anyPending ? "pending" : anyActivated ? "activated" : "unchanged";
    return { rows, kind };
  });
}

/**
 * B7 compliance: force the network wallet for every asset in `assets` (no cool-down).
 * @param {{ orgId: string, network: string, assets: string[], address: string }} input
 */
export async function forceNetworkSettlementAddress(input) {
  return inTransaction(async (client) => {
    const rows = [];
    for (const asset of input.assets) {
      rows.push(
        await forceSettlementAddress(
          { orgId: input.orgId, asset, network: input.network, address: input.address },
          client,
        ),
      );
    }
    return rows;
  });
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
