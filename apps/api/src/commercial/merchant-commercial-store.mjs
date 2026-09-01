import { getPool } from "../db/pool.mjs";
import { merchantCommercialEffectiveFromToday } from "./merchant-commercial-rules.mjs";

/**
 * @param {string} orgId
 */
export async function findMerchantCommercial(orgId) {
  const { rows } = await getPool().query(
    `SELECT org_id, tier, volume_fee_percent, pending_volume_fee_percent,
            pending_tier, effective_from, pending_effective_from,
            enterprise_approval_status, created_at, updated_at
     FROM merchant_commercial WHERE org_id = $1`,
    [orgId],
  );
  return rows[0] ?? null;
}

/**
 * Bulk commercial lookup for list pages (avoids N+1).
 * @param {string[]} orgIds
 */
export async function listMerchantCommercialByOrgIds(orgIds) {
  if (orgIds.length === 0) return [];
  const { rows } = await getPool().query(
    `SELECT org_id, tier, volume_fee_percent, pending_volume_fee_percent,
            pending_tier, effective_from, pending_effective_from,
            enterprise_approval_status, created_at, updated_at
     FROM merchant_commercial
     WHERE org_id = ANY($1::uuid[])`,
    [orgIds],
  );
  return rows;
}

/**
 * @param {{
 *   orgId: string,
 *   tier: string,
 *   volumeFeePercent: string,
 *   effectiveFrom?: string,
 *   enterpriseApprovalStatus?: string | null,
 * }} input
 */
export async function insertMerchantCommercial(input) {
  const effectiveFrom =
    input.effectiveFrom ?? merchantCommercialEffectiveFromToday();
  const { rows } = await getPool().query(
    `INSERT INTO merchant_commercial (
       org_id, tier, volume_fee_percent, effective_from, enterprise_approval_status
     ) VALUES ($1, $2, $3, $4::date, $5)
     RETURNING org_id, tier, volume_fee_percent, pending_volume_fee_percent,
               pending_tier, effective_from, pending_effective_from,
               enterprise_approval_status, created_at, updated_at`,
    [
      input.orgId,
      input.tier,
      input.volumeFeePercent,
      effectiveFrom,
      input.enterpriseApprovalStatus ?? null,
    ],
  );
  return rows[0];
}

/**
 * Apply scheduled change for next billing period.
 * @param {string} orgId
 * @param {{ tier: string, volumeFeePercent: string, reason?: string }} change
 */
export async function scheduleMerchantCommercialChange(orgId, change) {
  const pendingFrom = nextBillingPeriodStart();
  const { rows } = await getPool().query(
    `UPDATE merchant_commercial
     SET pending_tier = $2,
         pending_volume_fee_percent = $3,
         pending_effective_from = $4::date,
         enterprise_approval_status = NULL,
         updated_at = now()
     WHERE org_id = $1
     RETURNING org_id, tier, volume_fee_percent, pending_volume_fee_percent,
               pending_tier, effective_from, pending_effective_from,
               enterprise_approval_status, created_at, updated_at`,
    [orgId, change.tier, change.volumeFeePercent, pendingFrom],
  );
  return rows[0] ?? null;
}

/**
 * @param {string} orgId
 * @param {{ tier: string, volumeFeePercent: string }} applied
 */
export async function applyMerchantCommercialImmediate(orgId, applied) {
  const effectiveFrom = merchantCommercialEffectiveFromToday();
  const { rows } = await getPool().query(
    `UPDATE merchant_commercial
     SET tier = $2,
         volume_fee_percent = $3,
         effective_from = $4::date,
         pending_tier = NULL,
         pending_volume_fee_percent = NULL,
         pending_effective_from = NULL,
         enterprise_approval_status = NULL,
         updated_at = now()
     WHERE org_id = $1
     RETURNING org_id, tier, volume_fee_percent, pending_volume_fee_percent,
               pending_tier, effective_from, pending_effective_from,
               enterprise_approval_status, created_at, updated_at`,
    [orgId, applied.tier, applied.volumeFeePercent, effectiveFrom],
  );
  return rows[0] ?? null;
}

/**
 * @param {string} orgId
 */
export async function setEnterpriseApprovalPending(orgId) {
  await getPool().query(
    `UPDATE merchant_commercial
     SET enterprise_approval_status = 'pending', updated_at = now()
     WHERE org_id = $1`,
    [orgId],
  );
}

/**
 * @param {string} orgId
 * @param {"approved" | "denied"} status
 * @param {{ tier: string, volumeFeePercent: string }} [applied]
 */
export async function finalizeEnterpriseApproval(orgId, status, applied) {
  if (status === "approved" && applied) {
    return applyMerchantCommercialImmediate(orgId, applied);
  }
  const { rows } = await getPool().query(
    `UPDATE merchant_commercial
     SET enterprise_approval_status = $2,
         pending_tier = NULL,
         pending_volume_fee_percent = NULL,
         pending_effective_from = NULL,
         updated_at = now()
     WHERE org_id = $1
     RETURNING org_id, tier, volume_fee_percent, pending_volume_fee_percent,
               pending_tier, effective_from, pending_effective_from,
               enterprise_approval_status, created_at, updated_at`,
    [orgId, status],
  );
  return rows[0] ?? null;
}
