import { DEFAULT_FEE_TIER_BANDS } from "@paymentgate/domain";
import { getPool } from "../db/pool.mjs";

/**
 * @returns {Promise<{ tiers: object[], updatedAt: string | null }>}
 */
export async function getFeeTierSettings() {
  const { rows } = await getPool().query(
    `SELECT tier, subscription_amount_usd, volume_fee_min_percent,
            volume_fee_max_percent, default_signup_percent, tier_description, updated_at
     FROM platform_fee_tiers
     ORDER BY CASE tier
       WHEN 'small' THEN 1 WHEN 'mid' THEN 2 WHEN 'enterprise' THEN 3 ELSE 4 END`,
  );
  if (rows.length === 0) {
    return {
      tiers: DEFAULT_FEE_TIER_BANDS.map((band) => ({ ...band })),
      updatedAt: null,
    };
  }

  const updatedAt = rows.reduce((max, r) => {
    const t = r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at);
    return t > max ? t : max;
  }, rows[0]?.updated_at?.toISOString?.() ?? new Date(0).toISOString());

  return {
    tiers: rows.map(toFeeTierBand),
    updatedAt,
  };
}

/**
 * @param {object[]} tiers
 */
export async function replaceFeeTierSettings(tiers) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const band of tiers) {
      await client.query(
        `INSERT INTO platform_fee_tiers (
           tier, subscription_amount_usd, volume_fee_min_percent,
           volume_fee_max_percent, default_signup_percent, tier_description, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, now())
         ON CONFLICT (tier) DO UPDATE SET
           subscription_amount_usd = EXCLUDED.subscription_amount_usd,
           volume_fee_min_percent = EXCLUDED.volume_fee_min_percent,
           volume_fee_max_percent = EXCLUDED.volume_fee_max_percent,
           default_signup_percent = EXCLUDED.default_signup_percent,
           tier_description = EXCLUDED.tier_description,
           updated_at = now()`,
        [
          band.tier,
          band.subscriptionAmountUsd,
          band.volumeFeeMinPercent,
          band.volumeFeeMaxPercent,
          band.defaultSignupPercent,
          band.tierDescription ?? null,
        ],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return getFeeTierSettings();
}

/**
 * @param {string} tier
 */
export async function findFeeTierBand(tier) {
  const { rows } = await getPool().query(
    `SELECT tier, subscription_amount_usd, volume_fee_min_percent,
            volume_fee_max_percent, default_signup_percent, tier_description, updated_at
     FROM platform_fee_tiers WHERE tier = $1`,
    [tier],
  );
  return rows[0] ?? null;
}

export async function listFeeTierBands() {
  const { rows } = await getPool().query(
    `SELECT tier, subscription_amount_usd, volume_fee_min_percent,
            volume_fee_max_percent, default_signup_percent, tier_description, updated_at
     FROM platform_fee_tiers`,
  );
  return rows;
}

/**
 * @param {object} row
 */
export function toFeeTierBand(row) {
  return {
    tier: row.tier,
    subscriptionAmountUsd: row.subscription_amount_usd,
    volumeFeeMinPercent: row.volume_fee_min_percent,
    volumeFeeMaxPercent: row.volume_fee_max_percent,
    defaultSignupPercent: row.default_signup_percent,
    ...(row.tier_description ? { tierDescription: row.tier_description } : {}),
  };
}
