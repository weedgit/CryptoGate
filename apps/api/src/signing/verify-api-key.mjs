import { readRawBody } from "../http/json.mjs";
import { findActiveApiKeyByKeyId, consumeApiKeyNonce } from "./api-key-store.mjs";
import {
  canonicalString,
  checkTimestampSkew,
  hmacMatches,
  parseSigningHeaders,
} from "./signing-rules.mjs";

/**
 * Verify machine-client HMAC. Session callers must omit X-Api-Key.
 * @param {import("node:http").IncomingMessage} req
 * @returns {Promise<
 *   | { ok: true, key: { id: string, orgId: string, userId: string, keyId: string } }
 *   | { ok: false, code: "signature_invalid" | "timestamp_skew" | "nonce_replay" }
 * >}
 */
export async function authenticateApiKeyRequest(req) {
  const parsed = parseSigningHeaders(req.headers);
  if (!parsed.ok) return parsed;

  const key = await findActiveApiKeyByKeyId(parsed.keyId);
  if (!key) {
    return { ok: false, code: "signature_invalid" };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const skew = checkTimestampSkew(parsed.timestamp, nowSec);
  if (!skew.ok) return skew;

  const rawBody = await readRawBody(req);
  const canonical = canonicalString({
    timestamp: parsed.timestamp,
    nonce: parsed.nonce,
    method: req.method ?? "GET",
    pathAndQuery: req.url ?? "/",
    rawBody,
  });
  if (!hmacMatches(key.secret, canonical, parsed.signature)) {
    return { ok: false, code: "signature_invalid" };
  }

  const nonce = await consumeApiKeyNonce(key.id, parsed.nonce);
  if (!nonce.ok) return nonce;

  return {
    ok: true,
    key: {
      id: key.id,
      orgId: key.orgId,
      userId: key.userId,
      keyId: key.keyId,
    },
  };
}
