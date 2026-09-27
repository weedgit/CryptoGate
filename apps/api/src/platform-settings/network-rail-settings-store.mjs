import { getPool } from "../db/pool.mjs";

/**
 * @param {Record<string, unknown>} row
 */
function mapPlatformRow(row) {
  return {
    network: String(row.network),
    requiredConfirmations:
      row.required_confirmations == null
        ? null
        : Number(row.required_confirmations),
    minAmount: row.min_amount == null ? null : String(row.min_amount),
    updatedByUserId:
      row.updated_by_user_id == null ? null : String(row.updated_by_user_id),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  };
}

/**
 * @param {Record<string, unknown>} row
 */
function mapPairRow(row) {
  return {
    network: String(row.network),
    asset: String(row.asset),
    minAmount: String(row.min_amount),
    updatedByUserId:
      row.updated_by_user_id == null ? null : String(row.updated_by_user_id),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  };
}

/**
 * @param {Record<string, unknown>} row
 */
function mapMerchantRow(row) {
  return {
    orgId: String(row.org_id),
    network: String(row.network),
    requiredConfirmations: Number(row.required_confirmations),
    updatedByUserId:
      row.updated_by_user_id == null ? null : String(row.updated_by_user_id),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  };
}

/**
 * @returns {Promise<ReturnType<typeof mapPlatformRow>[]>}
 */
export async function listPlatformNetworkRailSettings() {
  const { rows } = await getPool().query(
    `SELECT network, required_confirmations, min_amount,
            updated_by_user_id, updated_at
     FROM platform_network_rail_settings
     ORDER BY network ASC`,
  );
  return rows.map(mapPlatformRow);
}

/**
 * @returns {Promise<ReturnType<typeof mapPairRow>[]>}
 */
export async function listPlatformPairRailSettings() {
  const { rows } = await getPool().query(
    `SELECT network, asset, min_amount, updated_by_user_id, updated_at
     FROM platform_pair_rail_settings
     ORDER BY network ASC, asset ASC`,
  );
  return rows.map(mapPairRow);
}

/**
 * @param {string} network
 */
export async function getPlatformNetworkRailSettings(network) {
  const { rows } = await getPool().query(
    `SELECT network, required_confirmations, min_amount,
            updated_by_user_id, updated_at
     FROM platform_network_rail_settings
     WHERE network = $1`,
    [network],
  );
  return rows[0] ? mapPlatformRow(rows[0]) : null;
}

/**
 * @param {string} network
 * @param {string} asset
 */
export async function getPlatformPairRailSettings(network, asset) {
  const { rows } = await getPool().query(
    `SELECT network, asset, min_amount, updated_by_user_id, updated_at
     FROM platform_pair_rail_settings
     WHERE network = $1 AND asset = $2`,
    [network, asset],
  );
  return rows[0] ? mapPairRow(rows[0]) : null;
}

/**
 * Upsert network-scoped confirmations. Pass null to clear; omit to leave unchanged.
 * @param {{
 *   network: string,
 *   requiredConfirmations?: number | null,
 *   updatedByUserId: string | null,
 * }} input
 */
export async function upsertPlatformNetworkRailSettings(input) {
  const existing = await getPlatformNetworkRailSettings(input.network);
  const nextConfirms =
    input.requiredConfirmations !== undefined
      ? input.requiredConfirmations
      : (existing?.requiredConfirmations ?? null);

  if (nextConfirms == null) {
    await getPool().query(
      `DELETE FROM platform_network_rail_settings WHERE network = $1`,
      [input.network],
    );
    return {
      network: input.network,
      requiredConfirmations: null,
      minAmount: null,
      updatedByUserId: input.updatedByUserId,
      updatedAt: new Date().toISOString(),
    };
  }

  const { rows } = await getPool().query(
    `INSERT INTO platform_network_rail_settings (
       network, required_confirmations, min_amount, updated_by_user_id, updated_at
     ) VALUES ($1, $2, NULL, $3::uuid, now())
     ON CONFLICT (network) DO UPDATE SET
       required_confirmations = EXCLUDED.required_confirmations,
       updated_by_user_id = EXCLUDED.updated_by_user_id,
       updated_at = now()
     RETURNING network, required_confirmations, min_amount,
               updated_by_user_id, updated_at`,
    [input.network, nextConfirms, input.updatedByUserId],
  );
  return mapPlatformRow(rows[0]);
}

/**
 * Upsert pair-scoped min amount. Pass null to clear.
 * @param {{
 *   network: string,
 *   asset: string,
 *   minAmount: string | null,
 *   updatedByUserId: string | null,
 * }} input
 */
export async function upsertPlatformPairRailSettings(input) {
  if (input.minAmount == null) {
    await getPool().query(
      `DELETE FROM platform_pair_rail_settings
       WHERE network = $1 AND asset = $2`,
      [input.network, input.asset],
    );
    return {
      network: input.network,
      asset: input.asset,
      minAmount: null,
      updatedByUserId: input.updatedByUserId,
      updatedAt: new Date().toISOString(),
    };
  }

  const { rows } = await getPool().query(
    `INSERT INTO platform_pair_rail_settings (
       network, asset, min_amount, updated_by_user_id, updated_at
     ) VALUES ($1, $2, $3, $4::uuid, now())
     ON CONFLICT (network, asset) DO UPDATE SET
       min_amount = EXCLUDED.min_amount,
       updated_by_user_id = EXCLUDED.updated_by_user_id,
       updated_at = now()
     RETURNING network, asset, min_amount, updated_by_user_id, updated_at`,
    [input.network, input.asset, input.minAmount, input.updatedByUserId],
  );
  return mapPairRow(rows[0]);
}

/**
 * @param {string} orgId
 * @returns {Promise<ReturnType<typeof mapMerchantRow>[]>}
 */
export async function listMerchantNetworkRailSettings(orgId) {
  const { rows } = await getPool().query(
    `SELECT org_id, network, required_confirmations,
            updated_by_user_id, updated_at
     FROM merchant_network_rail_settings
     WHERE org_id = $1
     ORDER BY network ASC`,
    [orgId],
  );
  return rows.map(mapMerchantRow);
}

/**
 * @param {string} orgId
 * @param {string} network
 */
export async function getMerchantNetworkRailSettings(orgId, network) {
  const { rows } = await getPool().query(
    `SELECT org_id, network, required_confirmations,
            updated_by_user_id, updated_at
     FROM merchant_network_rail_settings
     WHERE org_id = $1 AND network = $2`,
    [orgId, network],
  );
  return rows[0] ? mapMerchantRow(rows[0]) : null;
}

/**
 * @param {{
 *   orgId: string,
 *   network: string,
 *   requiredConfirmations: number | null,
 *   updatedByUserId: string | null,
 * }} input
 */
export async function upsertMerchantNetworkRailSettings(input) {
  if (input.requiredConfirmations == null) {
    await getPool().query(
      `DELETE FROM merchant_network_rail_settings
       WHERE org_id = $1 AND network = $2`,
      [input.orgId, input.network],
    );
    return {
      orgId: input.orgId,
      network: input.network,
      requiredConfirmations: null,
      updatedByUserId: input.updatedByUserId,
      updatedAt: new Date().toISOString(),
    };
  }

  const { rows } = await getPool().query(
    `INSERT INTO merchant_network_rail_settings (
       org_id, network, required_confirmations, updated_by_user_id, updated_at
     ) VALUES ($1::uuid, $2, $3, $4::uuid, now())
     ON CONFLICT (org_id, network) DO UPDATE SET
       required_confirmations = EXCLUDED.required_confirmations,
       updated_by_user_id = EXCLUDED.updated_by_user_id,
       updated_at = now()
     RETURNING org_id, network, required_confirmations,
               updated_by_user_id, updated_at`,
    [
      input.orgId,
      input.network,
      input.requiredConfirmations,
      input.updatedByUserId,
    ],
  );
  return mapMerchantRow(rows[0]);
}

/**
 * @param {Record<string, unknown>} row
 */
function mapScopedNetworkRow(row, idKey) {
  return {
    [idKey]: String(row[idKey === "orgId" ? "org_id" : "site_id"]),
    network: String(row.network),
    requiredConfirmations:
      row.required_confirmations == null
        ? null
        : Number(row.required_confirmations),
    updatedByUserId:
      row.updated_by_user_id == null ? null : String(row.updated_by_user_id),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  };
}

/**
 * @param {Record<string, unknown>} row
 */
function mapScopedPairRow(row, idKey) {
  return {
    [idKey]: String(row[idKey === "orgId" ? "org_id" : "site_id"]),
    network: String(row.network),
    asset: String(row.asset),
    minAmount: row.min_amount == null ? null : String(row.min_amount),
    updatedByUserId:
      row.updated_by_user_id == null ? null : String(row.updated_by_user_id),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  };
}

/**
 * @param {string} orgId
 */
export async function listPlatformMerchantNetworkRailSettings(orgId) {
  const { rows } = await getPool().query(
    `SELECT org_id, network, required_confirmations,
            updated_by_user_id, updated_at
     FROM platform_merchant_network_rail_settings
     WHERE org_id = $1
     ORDER BY network ASC`,
    [orgId],
  );
  return rows.map((r) => mapScopedNetworkRow(r, "orgId"));
}

/**
 * @param {string} orgId
 * @param {string} network
 */
export async function getPlatformMerchantNetworkRailSettings(orgId, network) {
  const { rows } = await getPool().query(
    `SELECT org_id, network, required_confirmations,
            updated_by_user_id, updated_at
     FROM platform_merchant_network_rail_settings
     WHERE org_id = $1 AND network = $2`,
    [orgId, network],
  );
  return rows[0] ? mapScopedNetworkRow(rows[0], "orgId") : null;
}

/**
 * @param {string} orgId
 */
export async function listPlatformMerchantPairRailSettings(orgId) {
  const { rows } = await getPool().query(
    `SELECT org_id, network, asset, min_amount,
            updated_by_user_id, updated_at
     FROM platform_merchant_pair_rail_settings
     WHERE org_id = $1
     ORDER BY network ASC, asset ASC`,
    [orgId],
  );
  return rows.map((r) => mapScopedPairRow(r, "orgId"));
}

/**
 * @param {string} orgId
 * @param {string} network
 * @param {string} asset
 */
export async function getPlatformMerchantPairRailSettings(orgId, network, asset) {
  const { rows } = await getPool().query(
    `SELECT org_id, network, asset, min_amount,
            updated_by_user_id, updated_at
     FROM platform_merchant_pair_rail_settings
     WHERE org_id = $1 AND network = $2 AND asset = $3`,
    [orgId, network, asset],
  );
  return rows[0] ? mapScopedPairRow(rows[0], "orgId") : null;
}

/**
 * @param {{
 *   orgId: string,
 *   network: string,
 *   requiredConfirmations: number | null,
 *   updatedByUserId: string | null,
 * }} input
 */
export async function upsertPlatformMerchantNetworkRailSettings(input) {
  if (input.requiredConfirmations == null) {
    await getPool().query(
      `DELETE FROM platform_merchant_network_rail_settings
       WHERE org_id = $1 AND network = $2`,
      [input.orgId, input.network],
    );
    return {
      orgId: input.orgId,
      network: input.network,
      requiredConfirmations: null,
      updatedByUserId: input.updatedByUserId,
      updatedAt: new Date().toISOString(),
    };
  }

  const { rows } = await getPool().query(
    `INSERT INTO platform_merchant_network_rail_settings (
       org_id, network, required_confirmations, updated_by_user_id, updated_at
     ) VALUES ($1::uuid, $2, $3, $4::uuid, now())
     ON CONFLICT (org_id, network) DO UPDATE SET
       required_confirmations = EXCLUDED.required_confirmations,
       updated_by_user_id = EXCLUDED.updated_by_user_id,
       updated_at = now()
     RETURNING org_id, network, required_confirmations,
               updated_by_user_id, updated_at`,
    [
      input.orgId,
      input.network,
      input.requiredConfirmations,
      input.updatedByUserId,
    ],
  );
  return mapScopedNetworkRow(rows[0], "orgId");
}

/**
 * @param {{
 *   orgId: string,
 *   network: string,
 *   asset: string,
 *   minAmount: string | null,
 *   updatedByUserId: string | null,
 * }} input
 */
export async function upsertPlatformMerchantPairRailSettings(input) {
  if (input.minAmount == null) {
    await getPool().query(
      `DELETE FROM platform_merchant_pair_rail_settings
       WHERE org_id = $1 AND network = $2 AND asset = $3`,
      [input.orgId, input.network, input.asset],
    );
    return {
      orgId: input.orgId,
      network: input.network,
      asset: input.asset,
      minAmount: null,
      updatedByUserId: input.updatedByUserId,
      updatedAt: new Date().toISOString(),
    };
  }

  const { rows } = await getPool().query(
    `INSERT INTO platform_merchant_pair_rail_settings (
       org_id, network, asset, min_amount, updated_by_user_id, updated_at
     ) VALUES ($1::uuid, $2, $3, $4, $5::uuid, now())
     ON CONFLICT (org_id, network, asset) DO UPDATE SET
       min_amount = EXCLUDED.min_amount,
       updated_by_user_id = EXCLUDED.updated_by_user_id,
       updated_at = now()
     RETURNING org_id, network, asset, min_amount, updated_by_user_id, updated_at`,
    [
      input.orgId,
      input.network,
      input.asset,
      input.minAmount,
      input.updatedByUserId,
    ],
  );
  return mapScopedPairRow(rows[0], "orgId");
}

/**
 * @param {string} siteId
 */
export async function listPlatformSiteNetworkRailSettings(siteId) {
  const { rows } = await getPool().query(
    `SELECT site_id, network, required_confirmations,
            updated_by_user_id, updated_at
     FROM platform_site_network_rail_settings
     WHERE site_id = $1
     ORDER BY network ASC`,
    [siteId],
  );
  return rows.map((r) => mapScopedNetworkRow(r, "siteId"));
}

/**
 * @param {string} siteId
 * @param {string} network
 */
export async function getPlatformSiteNetworkRailSettings(siteId, network) {
  const { rows } = await getPool().query(
    `SELECT site_id, network, required_confirmations,
            updated_by_user_id, updated_at
     FROM platform_site_network_rail_settings
     WHERE site_id = $1 AND network = $2`,
    [siteId, network],
  );
  return rows[0] ? mapScopedNetworkRow(rows[0], "siteId") : null;
}

/**
 * @param {string} siteId
 */
export async function listPlatformSitePairRailSettings(siteId) {
  const { rows } = await getPool().query(
    `SELECT site_id, network, asset, min_amount,
            updated_by_user_id, updated_at
     FROM platform_site_pair_rail_settings
     WHERE site_id = $1
     ORDER BY network ASC, asset ASC`,
    [siteId],
  );
  return rows.map((r) => mapScopedPairRow(r, "siteId"));
}

/**
 * @param {string} siteId
 * @param {string} network
 * @param {string} asset
 */
export async function getPlatformSitePairRailSettings(siteId, network, asset) {
  const { rows } = await getPool().query(
    `SELECT site_id, network, asset, min_amount,
            updated_by_user_id, updated_at
     FROM platform_site_pair_rail_settings
     WHERE site_id = $1 AND network = $2 AND asset = $3`,
    [siteId, network, asset],
  );
  return rows[0] ? mapScopedPairRow(rows[0], "siteId") : null;
}

/**
 * @param {{
 *   siteId: string,
 *   network: string,
 *   requiredConfirmations: number | null,
 *   updatedByUserId: string | null,
 * }} input
 */
export async function upsertPlatformSiteNetworkRailSettings(input) {
  if (input.requiredConfirmations == null) {
    await getPool().query(
      `DELETE FROM platform_site_network_rail_settings
       WHERE site_id = $1 AND network = $2`,
      [input.siteId, input.network],
    );
    return {
      siteId: input.siteId,
      network: input.network,
      requiredConfirmations: null,
      updatedByUserId: input.updatedByUserId,
      updatedAt: new Date().toISOString(),
    };
  }

  const { rows } = await getPool().query(
    `INSERT INTO platform_site_network_rail_settings (
       site_id, network, required_confirmations, updated_by_user_id, updated_at
     ) VALUES ($1::uuid, $2, $3, $4::uuid, now())
     ON CONFLICT (site_id, network) DO UPDATE SET
       required_confirmations = EXCLUDED.required_confirmations,
       updated_by_user_id = EXCLUDED.updated_by_user_id,
       updated_at = now()
     RETURNING site_id, network, required_confirmations,
               updated_by_user_id, updated_at`,
    [
      input.siteId,
      input.network,
      input.requiredConfirmations,
      input.updatedByUserId,
    ],
  );
  return mapScopedNetworkRow(rows[0], "siteId");
}

/**
 * @param {{
 *   siteId: string,
 *   network: string,
 *   asset: string,
 *   minAmount: string | null,
 *   updatedByUserId: string | null,
 * }} input
 */
export async function upsertPlatformSitePairRailSettings(input) {
  if (input.minAmount == null) {
    await getPool().query(
      `DELETE FROM platform_site_pair_rail_settings
       WHERE site_id = $1 AND network = $2 AND asset = $3`,
      [input.siteId, input.network, input.asset],
    );
    return {
      siteId: input.siteId,
      network: input.network,
      asset: input.asset,
      minAmount: null,
      updatedByUserId: input.updatedByUserId,
      updatedAt: new Date().toISOString(),
    };
  }

  const { rows } = await getPool().query(
    `INSERT INTO platform_site_pair_rail_settings (
       site_id, network, asset, min_amount, updated_by_user_id, updated_at
     ) VALUES ($1::uuid, $2, $3, $4, $5::uuid, now())
     ON CONFLICT (site_id, network, asset) DO UPDATE SET
       min_amount = EXCLUDED.min_amount,
       updated_by_user_id = EXCLUDED.updated_by_user_id,
       updated_at = now()
     RETURNING site_id, network, asset, min_amount, updated_by_user_id, updated_at`,
    [
      input.siteId,
      input.network,
      input.asset,
      input.minAmount,
      input.updatedByUserId,
    ],
  );
  return mapScopedPairRow(rows[0], "siteId");
}
