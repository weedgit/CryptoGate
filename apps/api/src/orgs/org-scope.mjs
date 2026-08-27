import { getPool } from "../db/pool.mjs";

/**
 * Orgs the caller may see: roots plus descendants.
 * @param {string[]} rootIds
 */
export async function listOrgsInSubtree(rootIds) {
  if (rootIds.length === 0) return [];
  const pool = getPool();
  const { rows } = await pool.query(
    `WITH RECURSIVE tree AS (
       SELECT id, type, name, parent_id, structure, max_agent_depth, status, created_at
       FROM org_accounts
       WHERE id = ANY($1::uuid[])
       UNION
       SELECT o.id, o.type, o.name, o.parent_id, o.structure, o.max_agent_depth, o.status, o.created_at
       FROM org_accounts o
       INNER JOIN tree t ON o.parent_id = t.id
     )
     SELECT id, type, name, parent_id, structure, max_agent_depth, status, created_at
     FROM tree
     ORDER BY created_at ASC`,
    [rootIds],
  );
  return rows;
}
