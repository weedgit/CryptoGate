import { getPool } from "../db/pool.mjs";
import { findPlatformOrg } from "../orgs/org-store.mjs";
import { agentDepthOf } from "../orgs/org-rules.mjs";
import { DEFAULT_MAX_AGENT_DEPTH } from "../orgs/org-accounts.mjs";

export const ALLOWED_SESSION_TIMEOUT_MINUTES = Object.freeze([15, 30, 60, 120]);
export const DEFAULT_SESSION_TIMEOUT_MINUTES = 30;
export const DEFAULT_MFA_ENFORCEMENT = true;

/**
 * @typedef {{
 *   maxAgentDepth: number,
 *   mfaEnforcement: boolean,
 *   sessionTimeoutMinutes: number,
 * }} PlatformOrgPolicy
 */

/**
 * @returns {Promise<PlatformOrgPolicy>}
 */
export async function getPlatformOrgPolicy() {
  const pool = getPool();
  try {
    const { rows } = await pool.query(
      `SELECT max_agent_depth, mfa_enforcement, session_timeout_minutes
       FROM org_accounts
       WHERE type = 'platform'
       LIMIT 1`,
    );
    const row = rows[0];
    return {
      maxAgentDepth: row?.max_agent_depth ?? DEFAULT_MAX_AGENT_DEPTH,
      mfaEnforcement:
        row?.mfa_enforcement == null
          ? DEFAULT_MFA_ENFORCEMENT
          : Boolean(row.mfa_enforcement),
      sessionTimeoutMinutes:
        row?.session_timeout_minutes ?? DEFAULT_SESSION_TIMEOUT_MINUTES,
    };
  } catch (err) {
    if (err && err.code === "42703") {
      const platform = await findPlatformOrg();
      return {
        maxAgentDepth: platform?.max_agent_depth ?? DEFAULT_MAX_AGENT_DEPTH,
        mfaEnforcement: DEFAULT_MFA_ENFORCEMENT,
        sessionTimeoutMinutes: DEFAULT_SESSION_TIMEOUT_MINUTES,
      };
    }
    throw err;
  }
}

/**
 * Sliding session TTL from live platform policy.
 * @returns {Promise<number>}
 */
export async function resolveSessionTtlMs() {
  const policy = await getPlatformOrgPolicy();
  return policy.sessionTimeoutMinutes * 60 * 1000;
}

/**
 * @param {{
 *   maxAgentDepth: number,
 *   mfaEnforcement: boolean,
 *   sessionTimeoutMinutes: number,
 * }} input
 * @returns {Promise<PlatformOrgPolicy>}
 */
export async function updatePlatformOrgPolicy(input) {
  const platform = await findPlatformOrg();
  if (!platform) {
    throw new Error("platform org missing");
  }
  try {
    await getPool().query(
      `UPDATE org_accounts
       SET max_agent_depth = $2,
           mfa_enforcement = $3,
           session_timeout_minutes = $4,
           updated_at = now()
       WHERE id = $1`,
      [
        platform.id,
        input.maxAgentDepth,
        input.mfaEnforcement,
        input.sessionTimeoutMinutes,
      ],
    );
  } catch (err) {
    if (err && err.code === "42703") {
      await getPool().query(
        `UPDATE org_accounts SET max_agent_depth = $2, updated_at = now() WHERE id = $1`,
        [platform.id, input.maxAgentDepth],
      );
    } else {
      throw err;
    }
  }
  return {
    maxAgentDepth: input.maxAgentDepth,
    mfaEnforcement: input.mfaEnforcement,
    sessionTimeoutMinutes: input.sessionTimeoutMinutes,
  };
}

/** @deprecated Use updatePlatformOrgPolicy */
export async function updatePlatformMaxAgentDepth(maxAgentDepth) {
  const current = await getPlatformOrgPolicy();
  return updatePlatformOrgPolicy({
    ...current,
    maxAgentDepth,
  });
}

/**
 * Max agent depth among all agent nodes — for org-policy lowering guard.
 */
export async function maxAgentDepthInTree() {
  const { rows } = await getPool().query(
    `SELECT id, type, parent_id FROM org_accounts WHERE type IN ('agent', 'agent_sub')`,
  );
  if (rows.length === 0) return 0;
  const byId = new Map(rows.map((r) => [r.id, r]));
  let max = 0;
  for (const row of rows) {
    const d = agentDepthOf(row, (id) => byId.get(id) ?? null);
    if (d > max) max = d;
  }
  return max;
}
