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
     WHERE key_id = $1 AND revoked_at IS NULL`,
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
