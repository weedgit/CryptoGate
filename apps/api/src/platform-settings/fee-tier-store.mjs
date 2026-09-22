import { DEFAULT_FEE_TIER_BANDS } from "@paymentgate/domain";
import { getPool } from "../db/pool.mjs";
import { nextBillingPeriodStart } from "./fee-tier-rules.mjs";

/**
 * @param {import("@paymentgate/domain").FeeTierBand} band
 */
function defaultBandToDbRow(band) {
  return {
    tier: band.tier,
    subscription_amount_usd: band.subscriptionAmountUsd,
    volume_fee_min_percent: band.volumeFeeMinPercent,
    volume_fee_max_percent: band.volumeFeeMaxPercent,
    default_signup_percent: band.defaultSignupPercent,
    volume_min_usd: band.volumeMinUsd ?? "0",
    volume_max_usd: band.volumeMaxUsd ?? null,
    agent_commission_percent: band.agentCommissionPercent ?? "15",
    tier_description: band.tierDescription ?? null,
    updated_at: new Date(),
  };
}

/**
 * @param {string} tier
 */
export function defaultFeeTierBandRow(tier) {
  const band = DEFAULT_FEE_TIER_BANDS.find((row) => row.tier === tier);
  return band ? defaultBandToDbRow(band) : null;
}

const SELECT_COLS = `tier, subscription_amount_usd, volume_fee_min_percent,
            volume_fee_max_percent, default_signup_percent,
            COALESCE(volume_min_usd, '0') AS volume_min_usd,
            volume_max_usd,
            COALESCE(agent_commission_percent, '15') AS agent_commission_percent,
            tier_description, updated_at,
            pending_subscription_amount_usd, pending_volume_fee_min_percent,
            pending_volume_fee_max_percent, pending_default_signup_percent,
            pending_agent_commission_percent, pending_volume_min_usd,
            pending_volume_max_usd, pending_tier_description, pending_effective_from`;

/** Ensure Small/Mid/Enterprise rows exist — defaults from @paymentgate/domain. */
export async function ensureDefaultFeeTierBands() {
  for (const band of DEFAULT_FEE_TIER_BANDS) {
    await getPool().query(
      `INSERT INTO platform_fee_tiers (
         tier, subscription_amount_usd, volume_fee_min_percent,
         volume_fee_max_percent, default_signup_percent,
         volume_min_usd, volume_max_usd, agent_commission_percent,
         tier_description, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
       ON CONFLICT (tier) DO NOTHING`,
      [
        band.tier,
        band.subscriptionAmountUsd,
        band.volumeFeeMinPercent,
        band.volumeFeeMaxPercent,
        band.defaultSignupPercent,
        band.volumeMinUsd ?? "0",
        band.volumeMaxUsd ?? null,
        band.agentCommissionPercent ?? "15",
        band.tierDescription ?? null,
      ],
    );
  }
}

/**
 * @returns {Promise<{ tiers: object[], updatedAt: string | null, pendingEffectiveFrom: string | null }>}
 */
export async function getFeeTierSettings() {
  await ensureDefaultFeeTierBands();
  await applyDuePendingFeeTiers();
  const { rows } = await getPool().query(
    `SELECT ${SELECT_COLS}
     FROM platform_fee_tiers
     ORDER BY CASE tier
       WHEN 'small' THEN 1 WHEN 'mid' THEN 2 WHEN 'enterprise' THEN 3 ELSE 4 END`,
  );

  const updatedAt = rows.reduce((max, r) => {
    const t = r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at);
    return t > max ? t : max;
  }, rows[0]?.updated_at?.toISOString?.() ?? new Date(0).toISOString());

  const pendingEffectiveFrom = rows.find((r) => r.pending_effective_from)
    ?.pending_effective_from;
  const pendingIso =
    pendingEffectiveFrom instanceof Date
      ? pendingEffectiveFrom.toISOString().slice(0, 10)
      : pendingEffectiveFrom
        ? String(pendingEffectiveFrom).slice(0, 10)
        : null;

  return {
    tiers: rows.map(toFeeTierBand),
    updatedAt,
    pendingEffectiveFrom: pendingIso,
  };
}

/**
 * Promote deferred schedule rows once pending_effective_from ≤ today (UTC).
 */
export async function applyDuePendingFeeTiers() {
  const today = new Date().toISOString().slice(0, 10);
  await getPool().query(
    `UPDATE platform_fee_tiers
     SET subscription_amount_usd = COALESCE(pending_subscription_amount_usd, subscription_amount_usd),
         volume_fee_min_percent = COALESCE(pending_volume_fee_min_percent, volume_fee_min_percent),
         volume_fee_max_percent = COALESCE(pending_volume_fee_max_percent, volume_fee_max_percent),
         default_signup_percent = COALESCE(pending_default_signup_percent, default_signup_percent),
         agent_commission_percent = COALESCE(pending_agent_commission_percent, agent_commission_percent),
         volume_min_usd = COALESCE(pending_volume_min_usd, volume_min_usd),
         volume_max_usd = pending_volume_max_usd,
         tier_description = pending_tier_description,
         pending_subscription_amount_usd = NULL,
         pending_volume_fee_min_percent = NULL,
         pending_volume_fee_max_percent = NULL,
         pending_default_signup_percent = NULL,
         pending_agent_commission_percent = NULL,
         pending_volume_min_usd = NULL,
         pending_volume_max_usd = NULL,
         pending_tier_description = NULL,
         pending_effective_from = NULL,
         updated_at = now()
     WHERE pending_effective_from IS NOT NULL
       AND pending_effective_from <= $1::date`,
    [today],
  );
}

/**
 * @param {object[]} tiers
 * @param {"immediate" | "next_billing_cycle"} [effectiveTiming]
 */
export async function replaceFeeTierSettings(tiers, effectiveTiming = "immediate") {
  const pool = getPool();
  const client = await pool.connect();
  const timing =
    effectiveTiming === "next_billing_cycle" ? "next_billing_cycle" : "immediate";
  const pendingFrom =
    timing === "next_billing_cycle" ? nextBillingPeriodStart() : null;
  try {
    await client.query("BEGIN");
    for (const band of tiers) {
      if (timing === "immediate") {
        await client.query(
          `INSERT INTO platform_fee_tiers (
             tier, subscription_amount_usd, volume_fee_min_percent,
             volume_fee_max_percent, default_signup_percent,
             volume_min_usd, volume_max_usd, agent_commission_percent,
             tier_description, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
           ON CONFLICT (tier) DO UPDATE SET
             subscription_amount_usd = EXCLUDED.subscription_amount_usd,
             volume_fee_min_percent = EXCLUDED.volume_fee_min_percent,
             volume_fee_max_percent = EXCLUDED.volume_fee_max_percent,
             default_signup_percent = EXCLUDED.default_signup_percent,
             volume_min_usd = EXCLUDED.volume_min_usd,
             volume_max_usd = EXCLUDED.volume_max_usd,
             agent_commission_percent = EXCLUDED.agent_commission_percent,
             tier_description = EXCLUDED.tier_description,
             pending_subscription_amount_usd = NULL,
             pending_volume_fee_min_percent = NULL,
             pending_volume_fee_max_percent = NULL,
             pending_default_signup_percent = NULL,
             pending_agent_commission_percent = NULL,
             pending_volume_min_usd = NULL,
             pending_volume_max_usd = NULL,
             pending_tier_description = NULL,
             pending_effective_from = NULL,
             updated_at = now()`,
          [
            band.tier,
            band.subscriptionAmountUsd,
            band.volumeFeeMinPercent,
            band.volumeFeeMaxPercent,
            band.defaultSignupPercent,
            band.volumeMinUsd ?? "0",
            band.volumeMaxUsd ?? null,
            band.agentCommissionPercent ?? "15",
            band.tierDescription ?? null,
          ],
        );
      } else {
        await client.query(
          `INSERT INTO platform_fee_tiers (
             tier, subscription_amount_usd, volume_fee_min_percent,
             volume_fee_max_percent, default_signup_percent,
             volume_min_usd, volume_max_usd, agent_commission_percent,
             tier_description, updated_at,
             pending_subscription_amount_usd, pending_volume_fee_min_percent,
             pending_volume_fee_max_percent, pending_default_signup_percent,
             pending_agent_commission_percent, pending_volume_min_usd,
             pending_volume_max_usd, pending_tier_description, pending_effective_from
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, now(),
             $2, $3, $4, $5, $8, $6, $7, $9, $10::date
           )
           ON CONFLICT (tier) DO UPDATE SET
             pending_subscription_amount_usd = EXCLUDED.pending_subscription_amount_usd,
             pending_volume_fee_min_percent = EXCLUDED.pending_volume_fee_min_percent,
             pending_volume_fee_max_percent = EXCLUDED.pending_volume_fee_max_percent,
             pending_default_signup_percent = EXCLUDED.pending_default_signup_percent,
             pending_agent_commission_percent = EXCLUDED.pending_agent_commission_percent,
             pending_volume_min_usd = EXCLUDED.pending_volume_min_usd,
             pending_volume_max_usd = EXCLUDED.pending_volume_max_usd,
             pending_tier_description = EXCLUDED.pending_tier_description,
             pending_effective_from = EXCLUDED.pending_effective_from,
             updated_at = now()`,
          [
            band.tier,
            band.subscriptionAmountUsd,
            band.volumeFeeMinPercent,
            band.volumeFeeMaxPercent,
            band.defaultSignupPercent,
            band.volumeMinUsd ?? "0",
            band.volumeMaxUsd ?? null,
            band.agentCommissionPercent ?? "15",
            band.tierDescription ?? null,
            pendingFrom,
          ],
        );
      }
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
  try {
    await ensureDefaultFeeTierBands();
    await applyDuePendingFeeTiers();
    const { rows } = await getPool().query(
      `SELECT ${SELECT_COLS} FROM platform_fee_tiers WHERE tier = $1`,
      [tier],
    );
    return rows[0] ?? defaultFeeTierBandRow(tier);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/platform_fee_tiers|does not exist|column/i.test(message)) {
      return defaultFeeTierBandRow(tier);
    }
    throw err;
  }
}

export async function listFeeTierBands() {
  await ensureDefaultFeeTierBands();
  await applyDuePendingFeeTiers();
  const { rows } = await getPool().query(`SELECT ${SELECT_COLS} FROM platform_fee_tiers`);
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
    volumeMinUsd: row.volume_min_usd ?? "0",
    volumeMaxUsd: row.volume_max_usd ?? null,
    agentCommissionPercent: row.agent_commission_percent ?? "15",
    ...(row.tier_description ? { tierDescription: row.tier_description } : {}),
  };
}
