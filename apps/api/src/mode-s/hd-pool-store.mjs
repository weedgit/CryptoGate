import { getPool } from "../db/pool.mjs";
import { findSettlementAddress } from "../settlement/settlement-store.mjs";
import { getActiveXpub } from "../xpub/xpub-store.mjs";
import {
  deriveTronAddressFromXpub,
  xpubFingerprint,
} from "./hd-derive.mjs";
import {
  HD_DERIVE_MAX_ATTEMPTS,
  HD_POOL_RELEASE_STATUSES,
  hdPoolCooldownMs,
} from "./hd-pool-rules.mjs";

const POOL_SELECT = `
  id, org_id, asset, network, hd_index, receive_address, status,
  xpub_fp, cooldown_until, last_order_id, created_at, updated_at
`;

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
export async function listHdPoolAddresses(orgId, client) {
  const { rows } = await db(client).query(
    `SELECT ${POOL_SELECT}
     FROM hd_pool_addresses
     WHERE org_id = $1
     ORDER BY asset ASC, network ASC, hd_index ASC`,
    [orgId],
  );
  return rows;
}

/**
 * Atomic FREE claim, else derive next 0/{index} from the merchant xPub (Tron).
 * Must run under the create-order advisory lock / same transaction.
 * @param {import("pg").PoolClient} client
 * @param {{
 *   merchantId: string,
 *   asset: string,
 *   network: string,
 *   mainSettlementAddress?: string,
 * }} query
 * @returns {Promise<{ receiveAddress: string, hdIndex: number }>}
 */
export async function claimHdPoolAddress(client, query) {
  if (query.network !== "tron") {
    throw new Error("HD pool derivation is only available for tron");
  }

  let main = query.mainSettlementAddress?.trim() ?? "";
  if (!main) {
    const settlement = await findSettlementAddress(
      query.merchantId,
      query.asset,
      query.network,
      client,
    );
    main = settlement?.address?.trim() ?? "";
  }

  const free = await claimFreeRow(
    client,
    query.merchantId,
    query.asset,
    query.network,
    main,
  );
  if (free) {
    return { receiveAddress: free.receive_address, hdIndex: free.hd_index };
  }

  const xpub = await getActiveXpub(
    query.merchantId,
    query.asset,
    query.network,
    client,
  );
  if (!xpub) {
    throw new Error("xPub is required for HD pool claim");
  }

  const fp = xpubFingerprint(xpub);
  const startIndex = await nextHdIndex(
    client,
    query.merchantId,
    query.asset,
    query.network,
    fp,
  );

  for (let offset = 0; offset < HD_DERIVE_MAX_ATTEMPTS; offset += 1) {
    const hdIndex = startIndex + offset;
    const receiveAddress = deriveTronAddressFromXpub(xpub, hdIndex);
    if (main && receiveAddress === main) continue;

    const inserted = await insertInUseRow(client, {
      orgId: query.merchantId,
      asset: query.asset,
      network: query.network,
      hdIndex,
      receiveAddress,
      xpubFp: fp,
    });
    if (inserted) {
      return { receiveAddress, hdIndex };
    }
  }

  throw new Error("HD pool could not allocate a derived address");
}

/**
 * Bind the newly created order onto the claimed IN_USE row (same transaction).
 * @param {import("pg").PoolClient} client
 * @param {{
 *   orgId: string,
 *   asset: string,
 *   network: string,
 *   hdIndex: number,
 *   receiveAddress: string,
 *   orderId: string,
 * }} input
 */
export async function bindHdPoolOrder(client, input) {
  await client.query(
    `UPDATE hd_pool_addresses
     SET last_order_id = $6, updated_at = now()
     WHERE org_id = $1
       AND asset = $2
       AND network = $3
       AND hd_index = $4
       AND receive_address = $5
       AND status = 'IN_USE'`,
    [
      input.orgId,
      input.asset,
      input.network,
      input.hdIndex,
      input.receiveAddress,
      input.orderId,
    ],
  );
}

/**
 * IN_USE → COOLDOWN when the bound order is final.
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function cooldownHdPoolForFinalOrders(client) {
  const until = new Date(Date.now() + hdPoolCooldownMs());
  const { rowCount } = await db(client).query(
    `UPDATE hd_pool_addresses p
     SET status = 'COOLDOWN',
         cooldown_until = $2,
         updated_at = now()
     FROM payment_orders o
     WHERE p.last_order_id = o.id
       AND p.status = 'IN_USE'
       AND o.status = ANY($1::text[])`,
    [[...HD_POOL_RELEASE_STATUSES], until.toISOString()],
  );
  return rowCount ?? 0;
}

/**
 * COOLDOWN → FREE after the late-payment window.
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function releaseDueHdPoolAddresses(client) {
  const { rowCount } = await db(client).query(
    `UPDATE hd_pool_addresses
     SET status = 'FREE',
         cooldown_until = NULL,
         last_order_id = NULL,
         updated_at = now()
     WHERE status = 'COOLDOWN'
       AND cooldown_until IS NOT NULL
       AND cooldown_until <= now()`,
  );
  return rowCount ?? 0;
}

/**
 * @param {import("pg").PoolClient} client
 * @param {string} orgId
 * @param {string} asset
 * @param {string} network
 * @param {string} mainAddress
 */
async function claimFreeRow(client, orgId, asset, network, mainAddress) {
  const { rows } = await client.query(
    `UPDATE hd_pool_addresses AS p
     SET status = 'IN_USE',
         cooldown_until = NULL,
         updated_at = now()
     FROM (
       SELECT id
       FROM hd_pool_addresses
       WHERE org_id = $1
         AND asset = $2
         AND network = $3
         AND status = 'FREE'
         AND receive_address <> $4
       ORDER BY hd_index ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     ) AS picked
     WHERE p.id = picked.id
     RETURNING p.hd_index, p.receive_address`,
    [orgId, asset, network, mainAddress],
  );
  return rows[0] ?? null;
}

/**
 * @param {import("pg").PoolClient} client
 * @param {string} orgId
 * @param {string} asset
 * @param {string} network
 * @param {string} xpubFp
 */
async function nextHdIndex(client, orgId, asset, network, xpubFp) {
  const { rows } = await client.query(
    `SELECT COALESCE(MAX(hd_index), -1) + 1 AS next_index
     FROM hd_pool_addresses
     WHERE org_id = $1 AND asset = $2 AND network = $3 AND xpub_fp = $4`,
    [orgId, asset, network, xpubFp],
  );
  return Number(rows[0]?.next_index ?? 0);
}

/**
 * @param {import("pg").PoolClient} client
 * @param {{
 *   orgId: string,
 *   asset: string,
 *   network: string,
 *   hdIndex: number,
 *   receiveAddress: string,
 *   xpubFp: string,
 * }} input
 */
async function insertInUseRow(client, input) {
  try {
    const { rows } = await client.query(
      `INSERT INTO hd_pool_addresses (
         org_id, asset, network, hd_index, receive_address, status, xpub_fp
       ) VALUES ($1, $2, $3, $4, $5, 'IN_USE', $6)
       RETURNING hd_index, receive_address`,
      [
        input.orgId,
        input.asset,
        input.network,
        input.hdIndex,
        input.receiveAddress,
        input.xpubFp,
      ],
    );
    return rows[0] ?? null;
  } catch (err) {
    if (err && err.code === "23505") return null;
    throw err;
  }
}
