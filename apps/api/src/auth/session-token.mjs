import { createHash } from "node:crypto";

/**
 * Hash a session token for storage. Never store the raw token.
 * @param {string} token
 */
export function hashSessionToken(token) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
