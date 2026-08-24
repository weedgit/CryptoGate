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
    `SELECT m.org_id, m.user_id, m.role, o.type AS org_type
     FROM org_memberships m
     JOIN org_accounts o ON o.id = m.org_id
     WHERE m.user_id = $1
     ORDER BY m.created_at ASC`,
    [userId],
  );
  return rows.map(rowToMembership);
}

/**
 * @param {string} orgId
 * @param {string} userId
 */
export async function findMembership(orgId, userId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT m.org_id, m.user_id, m.role, o.type AS org_type
     FROM org_memberships m
     JOIN org_accounts o ON o.id = m.org_id
     WHERE m.org_id = $1 AND m.user_id = $2`,
    [orgId, userId],
  );
  const row = rows[0];
  return row ? rowToMembership(row) : null;
}

/**
 * @param {{ org_id: string, user_id: string, role: string, org_type: string }} row
 */
function rowToMembership(row) {
  return toOrgMembership({
    orgId: row.org_id,
    userId: row.user_id,
    role: row.role,
    orgType: row.org_type,
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

export async function countOwners(orgId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n
     FROM org_memberships
     WHERE org_id = $1 AND role = 'owner'`,
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
    `SELECT m.org_id, m.user_id, m.role, o.type AS org_type, u.email
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
    }),
    email: row.email,
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
