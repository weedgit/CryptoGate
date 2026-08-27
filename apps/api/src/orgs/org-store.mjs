import { getPool } from "../db/pool.mjs";
import { agentDepthOf } from "./org-rules.mjs";

const ORG_COLS =
  "id, type, name, parent_id, structure, max_agent_depth, status, country, billing_email, legal_name, created_at";

/**
 * @param {string} id
 */
export async function findOrgById(id) {
  const pool = getPool();
  try {
    const { rows } = await pool.query(
      `SELECT ${ORG_COLS}, order_create_suspended
       FROM org_accounts
       WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  } catch (err) {
    if (err && err.code === "42703") {
      const { rows } = await pool.query(
        `SELECT ${ORG_COLS}
         FROM org_accounts
         WHERE id = $1`,
        [id],
      );
      return rows[0] ?? null;
    }
    throw err;
  }
}

export async function findPlatformOrg() {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT ${ORG_COLS}
     FROM org_accounts
     WHERE type = 'platform'
     LIMIT 1`,
  );
  return rows[0] ?? null;
}

export async function listOrgAccounts() {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT ${ORG_COLS}
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
      `SELECT ${ORG_COLS}
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
 * @param {string | null} parentId
 * @param {string} name
 * @returns {Promise<object | null>}
 */
export async function findSiblingByNormalizedName(parentId, name) {
  if (!parentId) return null;
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT ${ORG_COLS}
     FROM org_accounts
     WHERE parent_id = $1
       AND lower(btrim(name)) = lower(btrim($2))
     LIMIT 1`,
    [parentId, name],
  );
  return rows[0] ?? null;
}

/**
 * @param {{ type: string, name: string, parentId: string | null, structure: string | null, maxAgentDepth: number | null }} insert
 */
export async function insertOrgAccount(insert) {
  const pool = getPool();
  try {
    const { rows } = await pool.query(
      `INSERT INTO org_accounts (
         type, name, parent_id, structure, max_agent_depth,
         country, billing_email, legal_name
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${ORG_COLS}`,
      [
        insert.type,
        insert.name,
        insert.parentId,
        insert.structure,
        insert.maxAgentDepth,
        insert.country ?? null,
        insert.billingEmail ?? null,
        insert.legalName ?? null,
      ],
    );
    return { ok: true, row: rows[0] };
  } catch (err) {
    if (err && err.code === "23505") {
      if (
        err.constraint === "org_accounts_parent_name_ci_uidx" ||
        String(err.detail ?? "").includes("org_accounts_parent_name_ci_uidx")
      ) {
        return { ok: false, code: "duplicate_sibling_name" };
      }
      return { ok: false, code: "platform_exists" };
    }
    throw err;
  }
}

/**
 * @param {string} orgId
 * @param {"active" | "paused"} status
 */
export async function updateOrgStatus(orgId, status) {
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE org_accounts
     SET status = $2, updated_at = now()
     WHERE id = $1
     RETURNING ${ORG_COLS}`,
    [orgId, status],
  );
  return rows[0] ?? null;
}

/**
 * @param {string} orgId
 */
export async function countChildOrgs(orgId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM org_accounts WHERE parent_id = $1`,
    [orgId],
  );
  return rows[0]?.n ?? 0;
}

/**
 * Direct children of a given type (merchant_site under a merchant).
 * @param {string} parentId
 * @param {string} type
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function listChildOrgsByType(parentId, type, client) {
  const q = client ?? getPool();
  const { rows } = await q.query(
    `SELECT ${ORG_COLS}
     FROM org_accounts
     WHERE parent_id = $1 AND type = $2
     ORDER BY name ASC`,
    [parentId, type],
  );
  return rows;
}

/**
 * Hard-delete agent org when FK allows. Memberships cascade.
 * @param {string} orgId
 */
export async function deleteOrgAccount(orgId) {
  const pool = getPool();
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM org_accounts WHERE id = $1`,
      [orgId],
    );
    return { ok: rowCount > 0, code: null };
  } catch (err) {
    if (err && err.code === "23503") {
      return { ok: false, code: "has_dependencies" };
    }
    throw err;
  }
}
