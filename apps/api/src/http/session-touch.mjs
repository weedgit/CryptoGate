import { extendSessionByToken } from "../auth/sessions.mjs";
import { findUserById } from "../auth/users.mjs";
import { sessionCookie } from "./cookies.mjs";
import { ttlMsForUser } from "./session-ttl.mjs";

/** Extend session only when less than 25% of TTL remains (reduces DB writes). */
const TOUCH_REMAINING_RATIO = 0.25;

/**
 * Sliding session refresh on authenticated cookie requests.
 * @param {import("node:http").ServerResponse} res
 * @param {string} token
 * @param {string} userId
 * @param {Date} [sessionExpiresAt] from findActiveSessionByToken
 */
export async function touchSessionFromCookie(res, token, userId, sessionExpiresAt) {
  const user = await findUserById(userId);
  if (!user) return;
  const ttlMs = ttlMsForUser(user);
  if (sessionExpiresAt instanceof Date && Number.isFinite(sessionExpiresAt.getTime())) {
    const remainingMs = sessionExpiresAt.getTime() - Date.now();
    if (remainingMs > ttlMs * TOUCH_REMAINING_RATIO) return;
  }
  const expiresAt = await extendSessionByToken(token, { ttlMs });
  if (!expiresAt) return;
  const maxAgeSec = Math.max(60, Math.floor(ttlMs / 1000));
  res.setHeader("Set-Cookie", sessionCookie(token, { maxAgeSec }));
}
