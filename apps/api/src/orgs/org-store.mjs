import { getPool } from "../db/pool.mjs";
import { agentDepthOf } from "./org-rules.mjs";

/**
 * @param {string} id
 */
export async function findOrgById(id) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, type, name, parent_id, structure, max_agent_depth
     FROM org_accounts
     WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function findPlatformOrg() {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, type, name, parent_id, structure, max_agent_depth
     FROM org_accounts
     WHERE type = 'platform'
     LIMIT 1`,
  );
  return rows[0] ?? null;
}

export async function listOrgAccounts() {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, type, name, parent_id, structure, max_agent_depth
     FROM org_accounts
     ORDER BY created_at ASC`,
  );
  return rows;
}

/**
 * Agent/agent_sub count on the parent chain ( inclusive of parent ).
 * @param {object | null} parent
 */
export async function agentDepthOfParent(parent) {
  if (!parent) return 0;
  const byId = new Map([[parent.id, parent]]);
  const pool = getPool();
  let current = parent;
  while (current.parent_id) {
    const { rows } = await pool.query(
      `SELECT id, type, name, parent_id, structure, max_agent_depth
       FROM org_accounts
       WHERE id = $1`,
      [current.parent_id],
    );
    current = rows[0];
    if (!current) break;
    byId.set(current.id, current);
  }
  return agentDepthOf(parent, (id) => byId.get(id) ?? null);
}

/**
 * @param {{ type: string, name: string, parentId: string | null, structure: string | null, maxAgentDepth: number | null }} insert
 */
export async function insertOrgAccount(insert) {
  const pool = getPool();
  try {
    const { rows } = await pool.query(
      `INSERT INTO org_accounts (type, name, parent_id, structure, max_agent_depth)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, type, name, parent_id, structure, max_agent_depth`,
      [
        insert.type,
        insert.name,
        insert.parentId,
        insert.structure,
        insert.maxAgentDepth,
      ],
    );
    return { ok: true, row: rows[0] };
  } catch (err) {
    if (err && err.code === "23505") {
      return { ok: false, code: "platform_exists" };
    }
    throw err;
  }
}
