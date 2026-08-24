import { getPool } from "../db/pool.mjs";
import { findPlatformOrg } from "../orgs/org-store.mjs";
import { agentDepthOf } from "../orgs/org-rules.mjs";
import { DEFAULT_MAX_AGENT_DEPTH } from "../orgs/org-accounts.mjs";

/**
 * @returns {Promise<{ maxAgentDepth: number }>}
 */
export async function getPlatformOrgPolicy() {
  const platform = await findPlatformOrg();
  return {
    maxAgentDepth: platform?.max_agent_depth ?? DEFAULT_MAX_AGENT_DEPTH,
  };
}

/**
 * @param {number} maxAgentDepth
 */
export async function updatePlatformMaxAgentDepth(maxAgentDepth) {
  const platform = await findPlatformOrg();
  if (!platform) {
    throw new Error("platform org missing");
  }
  await getPool().query(
    `UPDATE org_accounts SET max_agent_depth = $2, updated_at = now() WHERE id = $1`,
    [platform.id, maxAgentDepth],
  );
  return { maxAgentDepth };
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
