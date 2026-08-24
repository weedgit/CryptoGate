import { getPool } from "../db/pool.mjs";

/**
 * @param {{
 *   orgId: string,
 *   requestedTier: string,
 *   requestedVolumeFeePercent: string,
 *   requestedByUserId: string,
 * }} input
 */
export async function insertEnterpriseRateApproval(input) {
  const { rows } = await getPool().query(
    `INSERT INTO enterprise_rate_approvals (
       org_id, requested_tier, requested_volume_fee_percent, requested_by_user_id
     ) VALUES ($1, $2, $3, $4)
     RETURNING id, org_id, requested_tier, requested_volume_fee_percent, status,
               requested_by_user_id, decided_by_user_id, decision_reason,
               created_at, decided_at`,
    [
      input.orgId,
      input.requestedTier,
      input.requestedVolumeFeePercent,
      input.requestedByUserId,
    ],
  );
  return rows[0];
}

/**
 * @param {string} id
 */
export async function findEnterpriseRateApproval(id) {
  const { rows } = await getPool().query(
    `SELECT a.id, a.org_id, a.requested_tier, a.requested_volume_fee_percent,
            a.status, a.requested_by_user_id, a.decided_by_user_id,
            a.decision_reason, a.created_at, a.decided_at,
            o.name AS merchant_name
     FROM enterprise_rate_approvals a
     JOIN org_accounts o ON o.id = a.org_id
     WHERE a.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/**
 * @param {{ status?: string | null, limit?: number }} query
 */
export async function listEnterpriseRateApprovals(query) {
  const params = [];
  /** @type {string[]} */
  const where = [];
  if (query.status) {
    params.push(query.status);
    where.push(`a.status = $${params.length}`);
  }
  const limit = query.limit ?? 50;
  params.push(limit);
  const { rows } = await getPool().query(
    `SELECT a.id, a.org_id, a.requested_tier, a.requested_volume_fee_percent,
            a.status, a.requested_by_user_id, a.decided_by_user_id,
            a.decision_reason, a.created_at, a.decided_at,
            o.name AS merchant_name
     FROM enterprise_rate_approvals a
     JOIN org_accounts o ON o.id = a.org_id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY a.created_at DESC
     LIMIT $${params.length}`,
    params,
  );
  return rows;
}

/**
 * @param {string} id
 * @param {{ status: string, decidedByUserId: string, decisionReason?: string | null }} decision
 */
export async function decideEnterpriseRateApproval(id, decision) {
  const { rows } = await getPool().query(
    `UPDATE enterprise_rate_approvals
     SET status = $2,
         decided_by_user_id = $3,
         decision_reason = $4,
         decided_at = now()
     WHERE id = $1 AND status = 'pending'
     RETURNING id, org_id, requested_tier, requested_volume_fee_percent, status,
               requested_by_user_id, decided_by_user_id, decision_reason,
               created_at, decided_at`,
    [id, decision.status, decision.decidedByUserId, decision.decisionReason ?? null],
  );
  return rows[0] ?? null;
}

/**
 * @param {object} row
 */
export function toEnterpriseRateApproval(row) {
  return {
    id: row.id,
    orgId: row.org_id,
    merchantName: row.merchant_name,
    requestedTier: row.requested_tier,
    requestedVolumeFeePercent: row.requested_volume_fee_percent,
    status: row.status,
    requestedByUserId: row.requested_by_user_id,
    ...(row.decided_by_user_id ? { decidedByUserId: row.decided_by_user_id } : {}),
    ...(row.decision_reason ? { decisionReason: row.decision_reason } : {}),
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    ...(row.decided_at
      ? {
          decidedAt:
            row.decided_at instanceof Date
              ? row.decided_at.toISOString()
              : String(row.decided_at),
        }
      : {}),
  };
}
