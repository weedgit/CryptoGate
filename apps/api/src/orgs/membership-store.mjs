import { randomBytes } from "node:crypto";
import { createUser, findUserByEmail } from "../auth/users.mjs";
import { getPool } from "../db/pool.mjs";
import { toOrgMembership } from "./membership-rules.mjs";

/**
 * @param {string} userId
 */
export async function listMembershipsForUser(userId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT m.org_id, m.user_id, m.role, m.status AS membership_status, o.type AS org_type
     FROM org_memberships m
     JOIN org_accounts o ON o.id = m.org_id
     WHERE m.user_id = $1
       AND COALESCE(m.status, 'active') = 'active'
       AND COALESCE(o.status, 'active') = 'active'
     ORDER BY m.created_at ASC`,
    [userId],
  );
  return rows.map(rowToMembership);
}

/**
 * @param {string} orgId
 * @param {string} userId
 * @param {{ includePaused?: boolean }} [opts]
 */
export async function findMembership(orgId, userId, opts = {}) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT m.org_id, m.user_id, m.role, m.status AS membership_status, o.type AS org_type
     FROM org_memberships m
     JOIN org_accounts o ON o.id = m.org_id
     WHERE m.org_id = $1 AND m.user_id = $2`,
    [orgId, userId],
  );
  const row = rows[0];
  if (!row) return null;
  const status = row.membership_status === "paused" ? "paused" : "active";
  if (!opts.includePaused && status === "paused") return null;
  return rowToMembership(row);
}

/**
 * @param {{ org_id: string, user_id: string, role: string, org_type: string, membership_status?: string }} row
 */
function rowToMembership(row) {
  return toOrgMembership({
    orgId: row.org_id,
    userId: row.user_id,
    role: row.role,
    orgType: row.org_type,
    status: row.membership_status,
  });
}

export async function countOrgMemberships(orgId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM org_memberships WHERE org_id = $1`,
    [orgId],
  );
  return rows[0]?.n ?? 0;
}

/** Active owners only (for last-owner guards). */
export async function countOwners(orgId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n
     FROM org_memberships
     WHERE org_id = $1
       AND role = 'owner'
       AND COALESCE(status, 'active') = 'active'`,
    [orgId],
  );
  return rows[0]?.n ?? 0;
}

/**
 * @param {string} orgId
 */
export async function listMembershipsForOrg(orgId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT m.org_id, m.user_id, m.role, m.status AS membership_status, o.type AS org_type,
            u.email, u.mfa_enrolled_at,
            (
              SELECT MAX(s.created_at)
              FROM sessions s
              WHERE s.user_id = u.id
            ) AS last_login_at
     FROM org_memberships m
     JOIN org_accounts o ON o.id = m.org_id
     JOIN users u ON u.id = m.user_id
     WHERE m.org_id = $1
     ORDER BY m.created_at ASC`,
    [orgId],
  );
  return rows.map((row) => ({
    ...toOrgMembership({
      orgId: row.org_id,
      userId: row.user_id,
      role: row.role,
      orgType: row.org_type,
      status: row.membership_status,
    }),
    email: row.email,
    mfaEnrolled: row.mfa_enrolled_at != null,
    lastLoginAt:
      row.last_login_at instanceof Date
        ? row.last_login_at.toISOString()
        : row.last_login_at
          ? String(row.last_login_at)
          : null,
  }));
}

/**
 * Member emails grouped by org — one query for platform list search (replaces N× listOrgUsers).
 * Owner / administrator emails are ordered first so callers can pick a contact without a second pass.
 * @param {string[]} orgIds
 * @param {string[] | null} [orgTypes] when set, only rows whose org_accounts.type matches
 * @returns {Promise<{ orgId: string, emails: string[], ownerEmail: string | null }[]>}
 */
export async function listMemberEmailsGroupedByOrg(orgIds, orgTypes = null) {
  if (orgIds.length === 0) return [];
  const pool = getPool();
  /** @type {unknown[]} */
  const params = [orgIds];
  let typeClause = "";
  if (orgTypes && orgTypes.length > 0) {
    params.push(orgTypes);
    typeClause = ` AND o.type = ANY($${params.length}::text[])`;
  }
  const { rows } = await pool.query(
    `SELECT m.org_id, u.email, m.role
     FROM org_memberships m
     JOIN users u ON u.id = m.user_id
     JOIN org_accounts o ON o.id = m.org_id
     WHERE m.org_id = ANY($1::uuid[])${typeClause}
     ORDER BY m.org_id,
       CASE m.role
         WHEN 'owner' THEN 0
         WHEN 'administrator' THEN 1
         WHEN 'viewer' THEN 2
         ELSE 3
       END,
       m.created_at ASC`,
    params,
  );
  /** @type {Map<string, { emails: string[], ownerEmail: string | null }>} */
  const byOrg = new Map();
  for (const row of rows) {
    const email =
      typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
    if (!email) continue;
    const cur = byOrg.get(row.org_id) ?? { emails: [], ownerEmail: null };
    if (!cur.emails.includes(email)) cur.emails.push(email);
    if (row.role === "owner" && !cur.ownerEmail) cur.ownerEmail = email;
    byOrg.set(row.org_id, cur);
  }
  return [...byOrg.entries()].map(([orgId, value]) => ({
    orgId,
    emails: value.emails,
    ownerEmail: value.ownerEmail,
  }));
}

/**
 * @param {{ orgId: string, userId: string, role: string }} input
 */
export async function insertMembership(input) {
  const pool = getPool();
  try {
    await pool.query(
      `INSERT INTO org_memberships (org_id, user_id, role)
       VALUES ($1, $2, $3)`,
      [input.orgId, input.userId, input.role],
    );
    return { ok: true };
  } catch (err) {
    if (err && err.code === "23505") {
      return { ok: false, code: "membership_exists" };
    }
    throw err;
  }
}

/**
 * @param {string} orgId
 * @param {string} userId
 * @param {string} role
 */
export async function updateMembershipRole(orgId, userId, role) {
  const pool = getPool();
  const { rowCount } = await pool.query(
    `UPDATE org_memberships
     SET role = $3, updated_at = now()
     WHERE org_id = $1 AND user_id = $2`,
    [orgId, userId, role],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * @param {string} orgId
 * @param {string} userId
 * @param {"active" | "paused"} status
 */
export async function updateMembershipStatus(orgId, userId, status) {
  const pool = getPool();
  const { rowCount } = await pool.query(
    `UPDATE org_memberships
     SET status = $3, updated_at = now()
     WHERE org_id = $1 AND user_id = $2`,
    [orgId, userId, status],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * @param {string} orgId
 * @param {string} userId
 */
export async function deleteMembership(orgId, userId) {
  const pool = getPool();
  const { rowCount } = await pool.query(
    `DELETE FROM org_memberships WHERE org_id = $1 AND user_id = $2`,
    [orgId, userId],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Invite attaches an existing user, or creates one with a temporary password.
 * @param {string} email
 */
export async function provisionUserForInvite(email) {
  const existing = await findUserByEmail(email);
  if (existing) {
    return {
      id: existing.id,
      email: existing.email,
      temporaryPassword: null,
      created: false,
    };
  }
  const temporaryPassword = `${randomBytes(12).toString("base64url")}9aA!`;
  try {
    const user = await createUser({ email, password: temporaryPassword });
    return {
      id: user.id,
      email: user.email,
      temporaryPassword,
      created: true,
    };
  } catch (err) {
    if (err && err.code === "email_taken") {
      const raced = await findUserByEmail(email);
      if (raced) {
        return {
          id: raced.id,
          email: raced.email,
          temporaryPassword: null,
          created: false,
        };
      }
    }
    throw err;
  }
}

/**
 * Invite attaches an existing user, or creates one with a random password
 * (not returned — no public register in M1).
 * @param {string} email
 */
export async function findOrCreateUserByEmail(email) {
  const existing = await findUserByEmail(email);
  if (existing) {
    return { id: existing.id, email: existing.email };
  }
  const password = `${randomBytes(12).toString("base64url")}9a`;
  try {
    return createUser({ email, password });
  } catch (err) {
    if (err && err.code === "email_taken") {
      const raced = await findUserByEmail(email);
      if (raced) return { id: raced.id, email: raced.email };
    }
    throw err;
  }
}
