import { API_KEY_MAX_PER_ORG } from "@cryptogate/domain";
import { getPool } from "../db/pool.mjs";
import { signingNonceTtlSeconds } from "./signing-rules.mjs";

/**
 * @param {string} keyId
 * @returns {Promise<{ id: string, orgId: string, userId: string, keyId: string, secret: string } | null>}
 */
export async function findActiveApiKeyByKeyId(keyId) {
  const { rows } = await getPool().query(
    `SELECT id, org_id, user_id, key_id, secret
     FROM api_keys
     WHERE key_id = $1
       AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > now())`,
    [keyId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    orgId: row.org_id,
    userId: row.user_id,
    keyId: row.key_id,
    secret: row.secret,
  };
}

/**
 * Touch last_used_at after successful HMAC (best-effort).
 * @param {string} apiKeyRowId
 */
export async function touchApiKeyLastUsed(apiKeyRowId) {
  await getPool().query(
    `UPDATE api_keys SET last_used_at = now() WHERE id = $1 AND revoked_at IS NULL`,
    [apiKeyRowId],
  );
}

/**
 * @param {string} orgId
 */
export async function listActiveApiKeys(orgId) {
  const { rows } = await getPool().query(
    `SELECT id, org_id, key_id, label, created_at, last_used_at, expires_at
     FROM api_keys
     WHERE org_id = $1 AND revoked_at IS NULL
     ORDER BY created_at ASC`,
    [orgId],
  );
  return rows;
}

/**
 * @param {string} apiKeyId row UUID
 * @param {string} orgId
 */
export async function findApiKeyByIdForOrg(apiKeyId, orgId) {
  const { rows } = await getPool().query(
    `SELECT id, org_id, key_id, label, secret, revoked_at, created_at, last_used_at, expires_at
     FROM api_keys
     WHERE id = $1 AND org_id = $2`,
    [apiKeyId, orgId],
  );
  return rows[0] ?? null;
}

/**
 * @param {{
 *   orgId: string,
 *   userId: string,
 *   keyId: string,
 *   secret: string,
 *   label: string,
 *   expiresAt: Date | null,
 * }} input
 * @returns {Promise<{ ok: true, row: object } | { ok: false, code: "limit" }>}
 */
export async function insertApiKey(input) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: countRows } = await client.query(
      `SELECT COUNT(*)::int AS n
       FROM api_keys
       WHERE org_id = $1 AND revoked_at IS NULL
       FOR UPDATE`,
      [input.orgId],
    );
    if ((countRows[0]?.n ?? 0) >= API_KEY_MAX_PER_ORG) {
      await client.query("ROLLBACK");
      return { ok: false, code: "limit" };
    }
    const { rows } = await client.query(
      `INSERT INTO api_keys (org_id, user_id, key_id, secret, label, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, org_id, key_id, label, created_at, last_used_at, expires_at`,
      [
        input.orgId,
        input.userId,
        input.keyId,
        input.secret,
        input.label,
        input.expiresAt,
      ],
    );
    await client.query("COMMIT");
    return { ok: true, row: rows[0] };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Soft-revoke. Idempotent when already revoked.
 * @param {string} apiKeyId
 * @param {string} orgId
 * @returns {Promise<"revoked" | "already" | "missing">}
 */
export async function revokeApiKey(apiKeyId, orgId) {
  const { rows } = await getPool().query(
    `UPDATE api_keys
     SET revoked_at = now()
     WHERE id = $1 AND org_id = $2 AND revoked_at IS NULL
     RETURNING id`,
    [apiKeyId, orgId],
  );
  if (rows[0]) return "revoked";
  const existing = await findApiKeyByIdForOrg(apiKeyId, orgId);
  if (!existing) return "missing";
  return "already";
}

/**
 * Revoke old key and insert replacement (same label; net active count unchanged).
 * @param {{
 *   apiKeyId: string,
 *   orgId: string,
 *   userId: string,
 *   keyId: string,
 *   secret: string,
 *   expiresAt: Date | null | undefined,
 * }} input
 * @returns {Promise<
 *   | { ok: true, row: object }
 *   | { ok: false, code: "missing" | "already_revoked" }
 * >}
 */
export async function rotateApiKey(input) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: oldRows } = await client.query(
      `SELECT id, label, expires_at, revoked_at
       FROM api_keys
       WHERE id = $1 AND org_id = $2
       FOR UPDATE`,
      [input.apiKeyId, input.orgId],
    );
    const old = oldRows[0];
    if (!old) {
      await client.query("ROLLBACK");
      return { ok: false, code: "missing" };
    }
    if (old.revoked_at) {
      await client.query("ROLLBACK");
      return { ok: false, code: "already_revoked" };
    }
    await client.query(
      `UPDATE api_keys SET revoked_at = now() WHERE id = $1`,
      [old.id],
    );
    const expiresAt =
      input.expiresAt === undefined ? old.expires_at : input.expiresAt;
    const { rows } = await client.query(
      `INSERT INTO api_keys (org_id, user_id, key_id, secret, label, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, org_id, key_id, label, created_at, last_used_at, expires_at`,
      [
        input.orgId,
        input.userId,
        input.keyId,
        input.secret,
        old.label,
        expiresAt,
      ],
    );
    await client.query("COMMIT");
    return { ok: true, row: rows[0] };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Insert nonce; reuse inside TTL is replay. After expiry the row is deleted so
 * the same nonce may be used again.
 * @param {string} apiKeyId
 * @param {string} nonce
 * @returns {Promise<{ ok: true } | { ok: false, code: "nonce_replay" }>}
 */
export async function consumeApiKeyNonce(apiKeyId, nonce) {
  const pool = getPool();
  const client = await pool.connect();
  const ttlSec = signingNonceTtlSeconds();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM api_signing_nonces
       WHERE api_key_id = $1 AND expires_at < now()`,
      [apiKeyId],
    );
    const { rows } = await client.query(
      `INSERT INTO api_signing_nonces (api_key_id, nonce, expires_at)
       VALUES ($1, $2, now() + ($3 * interval '1 second'))
       ON CONFLICT (api_key_id, nonce) DO NOTHING
       RETURNING nonce`,
      [apiKeyId, nonce, ttlSec],
    );
    await client.query("COMMIT");
    if (rows.length === 0) {
      return { ok: false, code: "nonce_replay" };
    }
    return { ok: true };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw err;
  } finally {
    client.release();
  }
}
