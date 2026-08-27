import { getPool } from "../db/pool.mjs";
import {
  agentCommissionEffectiveFromToday,
  DEFAULT_AGENT_COMMISSION_PERCENT,
} from "./agent-commission-rules.mjs";

/**
 * @param {string} orgId
 */
export async function findAgentCommission(orgId) {
  const { rows } = await getPool().query(
    `SELECT org_id, commission_percent, effective_from, created_at, updated_at
     FROM agent_commission WHERE org_id = $1`,
    [orgId],
  );
  return rows[0] ?? null;
}

/**
 * @param {{ orgId: string, commissionPercent?: string, effectiveFrom?: string }} input
 */
export async function upsertAgentCommission(input) {
  const percent = input.commissionPercent ?? DEFAULT_AGENT_COMMISSION_PERCENT;
  const effectiveFrom = input.effectiveFrom ?? agentCommissionEffectiveFromToday();
  const { rows } = await getPool().query(
    `INSERT INTO agent_commission (org_id, commission_percent, effective_from)
     VALUES ($1, $2, $3::date)
     ON CONFLICT (org_id) DO UPDATE SET
       commission_percent = EXCLUDED.commission_percent,
       effective_from = EXCLUDED.effective_from,
       updated_at = now()
     RETURNING org_id, commission_percent, effective_from, created_at, updated_at`,
    [input.orgId, percent, effectiveFrom],
  );
  return rows[0];
}

/**
 * Ensure a row exists (agent create / first read).
 * @param {string} orgId
 * @param {string} [commissionPercent]
 */
export async function ensureAgentCommission(orgId, commissionPercent) {
  const existing = await findAgentCommission(orgId);
  if (existing) return existing;
  return upsertAgentCommission({
    orgId,
    commissionPercent: commissionPercent ?? DEFAULT_AGENT_COMMISSION_PERCENT,
  });
}
