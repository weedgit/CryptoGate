import { getPool } from "../db/pool.mjs";
import {
  agentCommissionEffectiveFromToday,
  DEFAULT_AGENT_COMMISSION_PERCENT,
} from "./agent-commission-rules.mjs";

const SELECT_COLS = `org_id, commission_percent, effective_from,
            COALESCE(rate_mode, 'automatic') AS rate_mode,
            pending_commission_percent, pending_effective_from,
            created_at, updated_at`;

/**
 * @param {string} orgId
 */
export async function findAgentCommission(orgId) {
  const { rows } = await getPool().query(
    `SELECT ${SELECT_COLS}
     FROM agent_commission WHERE org_id = $1`,
    [orgId],
  );
  return rows[0] ?? null;
}

/**
 * Batch read for commissions boards (avoids N× GET /orgs/{id}/agent-commission).
 * @param {string[]} orgIds
 */
export async function listAgentCommissionsByOrgIds(orgIds) {
  if (!orgIds.length) return [];
  const { rows } = await getPool().query(
    `SELECT ${SELECT_COLS}
     FROM agent_commission
     WHERE org_id = ANY($1::uuid[])
     ORDER BY org_id ASC`,
    [orgIds],
  );
  return rows;
}

/**
 * @param {{
 *   orgId: string,
 *   commissionPercent?: string,
 *   rateMode?: "automatic" | "fixed",
 *   effectiveFrom?: string,
 * }} input
 */
export async function upsertAgentCommission(input) {
  const percent = input.commissionPercent ?? DEFAULT_AGENT_COMMISSION_PERCENT;
  const effectiveFrom = input.effectiveFrom ?? agentCommissionEffectiveFromToday();
  const rateMode = input.rateMode === "fixed" ? "fixed" : "automatic";
  const { rows } = await getPool().query(
    `INSERT INTO agent_commission (org_id, commission_percent, effective_from, rate_mode)
     VALUES ($1, $2, $3::date, $4)
     ON CONFLICT (org_id) DO UPDATE SET
       commission_percent = EXCLUDED.commission_percent,
       effective_from = EXCLUDED.effective_from,
       rate_mode = EXCLUDED.rate_mode,
       pending_commission_percent = NULL,
       pending_effective_from = NULL,
       updated_at = now()
     RETURNING ${SELECT_COLS}`,
    [input.orgId, percent, effectiveFrom, rateMode],
  );
  return rows[0];
}

/**
 * Ensure a row exists (agent create / first read).
 * @param {string} orgId
 * @param {string} [commissionPercent]
 * @param {"automatic" | "fixed"} [rateMode]
 */
export async function ensureAgentCommission(orgId, commissionPercent, rateMode) {
  const existing = await findAgentCommission(orgId);
  if (existing) return existing;
  return upsertAgentCommission({
    orgId,
    commissionPercent: commissionPercent ?? DEFAULT_AGENT_COMMISSION_PERCENT,
    rateMode: rateMode ?? "automatic",
  });
}
