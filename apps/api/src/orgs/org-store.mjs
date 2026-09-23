import { getPool } from "../db/pool.mjs";
import { agentDepthOf } from "./org-rules.mjs";

const ORG_COLS =
  "id, type, name, parent_id, max_agent_depth, status, status_reason, status_reason_bill_id, country, billing_email, legal_name, icon_key, created_at";
const ORG_COLS_LEGACY =
  "id, type, name, parent_id, max_agent_depth, status, country, billing_email, legal_name, icon_key, created_at";

/**
 * @param {string} sql
 * @param {unknown[]} [params]
 */
async function queryOrgs(sql, params = []) {
  try {
    return await getPool().query(sql, params);
  } catch (err) {
    if (err && err.code === "42703" && sql.includes("status_reason")) {
      const stripped = sql
        .replace(/,\s*status_reason_bill_id/g, "")
        .replace(/,\s*status_reason/g, "")
        .replace(ORG_COLS, ORG_COLS_LEGACY);
      return getPool().query(stripped, params);
    }
    throw err;
  }
}

/**
 * @param {string} id
 */
export async function findOrgById(id) {
  try {
    const { rows } = await queryOrgs(
      `SELECT ${ORG_COLS}, order_create_suspended
       FROM org_accounts
       WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  } catch (err) {
    if (err && err.code === "42703") {
      const { rows } = await queryOrgs(
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
  const { rows } = await queryOrgs(
    `SELECT ${ORG_COLS}
     FROM org_accounts
     WHERE type = 'platform'
     LIMIT 1`,
  );
  return rows[0] ?? null;
}

export async function listOrgAccounts() {
  const { rows } = await queryOrgs(
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
 * @param {{ type: string, name: string, parentId: string | null, maxAgentDepth?: number | null, country?: string | null, legalName?: string | null, billingEmail?: string | null }} insert
 */
export async function insertOrgAccount(insert) {
  const pool = getPool();
  const isPlatform = insert.type === "platform";
  const billingEmail =
    typeof insert.billingEmail === "string" && insert.billingEmail.trim()
      ? insert.billingEmail.trim()
      : null;
  try {
    const { rows } = await pool.query(
      `INSERT INTO org_accounts (
         type, name, parent_id, max_agent_depth,
         country, billing_email, legal_name,
         mfa_enforcement, session_timeout_minutes
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${ORG_COLS}`,
      [
        insert.type,
        insert.name,
        insert.parentId,
        insert.maxAgentDepth ?? null,
        insert.country ?? null,
        billingEmail,
        insert.legalName ?? insert.name ?? null,
        isPlatform ? true : null,
        isPlatform ? 30 : null,
      ],
    );
    return { ok: true, row: rows[0] };
  } catch (err) {
    // Pre-031 DBs: retry without security columns.
    if (err && err.code === "42703") {
      try {
        const { rows } = await pool.query(
          `INSERT INTO org_accounts (
             type, name, parent_id, max_agent_depth,
             country, billing_email, legal_name
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING ${ORG_COLS}`,
          [
            insert.type,
            insert.name,
            insert.parentId,
            insert.maxAgentDepth ?? null,
            insert.country ?? null,
            billingEmail,
            insert.legalName ?? insert.name ?? null,
          ],
        );
        return { ok: true, row: rows[0] };
      } catch (inner) {
        err = inner;
      }
    }
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
 * @param {{ reason?: string | null, reasonBillId?: string | null }} [opts]
 */
export async function updateOrgStatus(orgId, status, opts = {}) {
  const reason = status === "paused" ? (opts.reason ?? null) : null;
  const reasonBillId = status === "paused" ? (opts.reasonBillId ?? null) : null;
  try {
    const { rows } = await getPool().query(
      `UPDATE org_accounts
       SET status = $2,
           status_reason = $3,
           status_reason_bill_id = $4,
           updated_at = now()
       WHERE id = $1
       RETURNING ${ORG_COLS}`,
      [orgId, status, reason, reasonBillId],
    );
    return rows[0] ?? null;
  } catch (err) {
    if (!(err && err.code === "42703")) throw err;
    const { rows } = await getPool().query(
      `UPDATE org_accounts
       SET status = $2, updated_at = now()
       WHERE id = $1
       RETURNING ${ORG_COLS_LEGACY}`,
      [orgId, status],
    );
    return rows[0] ?? null;
  }
}

/**
 * Prefill billing_email once from owner invite email when empty.
 * @param {string} orgId
 * @param {string} email
 */
export async function updateOrgBillingEmailIfEmpty(orgId, email) {
  const pool = getPool();
  const trimmed =
    typeof email === "string" ? email.trim().toLowerCase().slice(0, 254) : "";
  if (!trimmed.includes("@")) return null;
  const { rows } = await pool.query(
    `UPDATE org_accounts
     SET billing_email = $2, updated_at = now()
     WHERE id = $1
       AND (billing_email IS NULL OR btrim(billing_email) = '')
     RETURNING ${ORG_COLS}`,
    [orgId, trimmed],
  );
  return rows[0] ?? null;
}

/**
 * @param {string} orgId
 * @param {{
 *   name: string,
 *   iconKey: string | null,
 *   country?: string | null,
 *   legalName?: string | null,
 *   billingEmail?: string | null,
 * }} profile
 */
export async function updateOrgProfile(orgId, profile) {
  const pool = getPool();
  const country =
    typeof profile.country === "string" && profile.country.trim()
      ? profile.country.trim()
      : null;
  const legalName =
    profile.legalName === undefined
      ? undefined
      : typeof profile.legalName === "string" && profile.legalName.trim()
        ? profile.legalName.trim().slice(0, 200)
        : null;
  const billingEmail =
    profile.billingEmail === undefined
      ? undefined
      : typeof profile.billingEmail === "string" && profile.billingEmail.trim()
        ? profile.billingEmail.trim().toLowerCase().slice(0, 254)
        : null;
  const { rows } = await pool.query(
    `UPDATE org_accounts
     SET name = $2,
         icon_key = $3,
         country = COALESCE($4, country),
         legal_name = CASE WHEN $5::boolean THEN $6 ELSE legal_name END,
         billing_email = CASE WHEN $7::boolean THEN $8 ELSE billing_email END,
         updated_at = now()
     WHERE id = $1
     RETURNING ${ORG_COLS}`,
    [
      orgId,
      profile.name,
      profile.iconKey,
      country,
      legalName !== undefined,
      legalName ?? null,
      billingEmail !== undefined,
      billingEmail ?? null,
    ],
  );
  return rows[0] ?? null;
}

/**
 * Sibling name clash excluding the org being renamed.
 * @param {string | null} parentId
 * @param {string} name
 * @param {string} excludeOrgId
 */
export async function findSiblingByNormalizedNameExcluding(
  parentId,
  name,
  excludeOrgId,
) {
  if (!parentId) return null;
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT ${ORG_COLS}
     FROM org_accounts
     WHERE parent_id = $1
       AND id <> $3
       AND lower(btrim(name)) = lower(btrim($2))
     LIMIT 1`,
    [parentId, name, excludeOrgId],
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
 * Direct children of a given type (e.g. merchant_site under a merchant or site).
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
 * All descendant orgs of `type` under `rootId` (BFS; unlimited depth).
 * @param {string} rootId
 * @param {string} type
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 */
export async function listDescendantOrgsByType(rootId, type, client) {
  /** @type {object[]} */
  const out = [];
  /** @type {string[]} */
  let frontier = [rootId];
  const seen = new Set([rootId]);
  while (frontier.length > 0) {
    /** @type {string[]} */
    const next = [];
    for (const id of frontier) {
      const kids = await listChildOrgsByType(id, type, client);
      for (const kid of kids) {
        if (seen.has(kid.id)) continue;
        seen.add(kid.id);
        out.push(kid);
        next.push(kid.id);
      }
    }
    frontier = next;
  }
  return out;
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
