import { getPool } from "../db/pool.mjs";
import { sanitizeAuditMetadata } from "./audit-rules.mjs";

/**
 * @typedef {{
 *   kind: "all" | "filter",
 *   orgIds?: string[],
 *   from?: string | null,
 *   to?: string | null,
 *   actorUserId?: string | null,
 *   orgId?: string | null,
 *   action?: string | null,
 *   q?: string | null,
 *   qActions?: string[],
 * }} AuditListFilter
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** @param {string} s */
function escapeLike(s) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Users / orgs whose name or email matches `q` (trigram-indexed).
 * @param {string} q
 * @returns {Promise<{ userIds: string[], orgIds: string[] }>}
 */
async function resolveSearchSubjects(q) {
  const pattern = `%${escapeLike(q)}%`;
  const pool = getPool();
  const [users, orgs] = await Promise.all([
    pool.query(
      `SELECT id FROM users WHERE email ILIKE $1 OR display_name ILIKE $1`,
      [pattern],
    ),
    pool.query(
      `SELECT id FROM org_accounts WHERE name ILIKE $1 OR legal_name ILIKE $1`,
      [pattern],
    ),
  ]);
  const userIds = users.rows.map((r) => String(r.id));
  const orgIds = orgs.rows.map((r) => String(r.id));
  if (UUID_RE.test(q)) {
    userIds.push(q);
    orgIds.push(q);
  }
  return { userIds, orgIds };
}

/**
 * Every search branch is index-backed (trigram on action / metadata::text,
 * btree on actor_user_id / org_id) so Postgres can BitmapOr instead of scanning.
 * @param {AuditListFilter} query
 * @returns {Promise<{ where: string[], params: unknown[] } | null>} null = empty scope
 */
async function buildAuditWhere(query) {
  const params = [];
  /** @type {string[]} */
  const where = [];

  if (query.kind === "filter") {
    if (!query.orgIds || query.orgIds.length === 0) return null;
    params.push(query.orgIds);
    where.push(`a.org_id = ANY($${params.length}::uuid[])`);
  }
  if (query.orgId) {
    params.push(query.orgId);
    where.push(`a.org_id = $${params.length}::uuid`);
  }
  if (query.actorUserId) {
    params.push(query.actorUserId);
    where.push(`a.actor_user_id = $${params.length}::uuid`);
  }
  if (query.action) {
    params.push(query.action);
    where.push(`a.action = $${params.length}`);
  }
  if (query.from) {
    params.push(query.from);
    where.push(`a.created_at >= $${params.length}::timestamptz`);
  }
  if (query.to) {
    params.push(query.to);
    where.push(`a.created_at <= $${params.length}::timestamptz`);
  }
  const q = query.q?.trim();
  if (q) {
    const subjects = await resolveSearchSubjects(q);
    params.push(`%${escapeLike(q.replace(/\s+/g, "_"))}%`);
    const branches = [`a.action ILIKE $${params.length}`];
    params.push(`%${escapeLike(q)}%`);
    branches.push(`a.metadata::text ILIKE $${params.length}`);
    if (query.qActions?.length) {
      params.push(query.qActions);
      branches.push(`a.action = ANY($${params.length}::text[])`);
    }
    if (subjects.userIds.length) {
      params.push(subjects.userIds);
      branches.push(`a.actor_user_id = ANY($${params.length}::uuid[])`);
    }
    if (subjects.orgIds.length) {
      params.push(subjects.orgIds);
      branches.push(`a.org_id = ANY($${params.length}::uuid[])`);
    }
    where.push(`(${branches.join(" OR ")})`);
  }
  return { where, params };
}

/** @param {object[]} rows */
function sanitizeRows(rows) {
  return rows.map((row) => ({
    ...row,
    metadata: sanitizeAuditMetadata(row.metadata),
  }));
}

/**
 * Newest-first audit rows (no total). Used by dashboards / overviews.
 * @param {AuditListFilter & { limit?: number }} query
 */
export async function listAuditLog(query) {
  const built = await buildAuditWhere(query);
  if (!built) return [];
  const { where, params } = built;
  params.push(query.limit ?? 100);

  const { rows } = await getPool().query(
    `SELECT a.id, a.actor_user_id, a.org_id, a.action, a.metadata, a.created_at
     FROM audit_log a
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY a.created_at DESC
     LIMIT $${params.length}`,
    params,
  );
  return sanitizeRows(rows);
}

/**
 * One server page of audit rows plus the filtered total.
 * @param {AuditListFilter & { limit: number, offset: number }} query
 * @returns {Promise<{ rows: object[], total: number }>}
 */
export async function listAuditLogPage(query) {
  const built = await buildAuditWhere(query);
  if (!built) return { rows: [], total: 0 };
  const { where, params } = built;
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const pool = getPool();
  const [{ rows }, count] = await Promise.all([
    pool.query(
      `SELECT a.id, a.actor_user_id, a.org_id, a.action, a.metadata, a.created_at
       FROM audit_log a
       ${whereSql}
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, query.limit, query.offset],
    ),
    pool.query(`SELECT COUNT(*)::int AS n FROM audit_log a ${whereSql}`, params),
  ]);
  return { rows: sanitizeRows(rows), total: count.rows[0]?.n ?? 0 };
}

/**
 * Every matching row newest-first, in keyset-paged batches (CSV export).
 * Rows carry `org_name`. Keyset on (created_at, id) keeps each batch O(batch).
 * @param {AuditListFilter} query
 * @param {number} [batchSize]
 * @returns {AsyncGenerator<object[]>}
 */
export async function* iterateAuditLogBatches(query, batchSize = 1000) {
  const built = await buildAuditWhere(query);
  if (!built) return;
  const { where, params } = built;
  const pool = getPool();
  /** @type {{ createdAt: Date, id: string } | null} */
  let cursor = null;

  for (;;) {
    const batchWhere = [...where];
    const batchParams = [...params];
    if (cursor) {
      batchParams.push(cursor.createdAt, cursor.id);
      batchWhere.push(
        `(a.created_at, a.id) < ($${batchParams.length - 1}::timestamptz, $${batchParams.length}::uuid)`,
      );
    }
    batchParams.push(batchSize);
    const { rows } = await pool.query(
      `SELECT a.id, a.actor_user_id, a.org_id, a.action, a.metadata, a.created_at,
              o.name AS org_name
       FROM audit_log a
       LEFT JOIN org_accounts o ON o.id = a.org_id
       ${batchWhere.length ? `WHERE ${batchWhere.join(" AND ")}` : ""}
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT $${batchParams.length}`,
      batchParams,
    );
    if (rows.length === 0) return;
    yield sanitizeRows(rows);
    if (rows.length < batchSize) return;
    const last = rows[rows.length - 1];
    cursor = { createdAt: last.created_at, id: String(last.id) };
  }
}
