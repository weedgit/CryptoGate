import { sendError } from "../http/json.mjs";
import { commitRateLimit, peekRateLimit } from "./rate-limit-store.mjs";
import {
  apiKeyIdFromHeaders,
  clientIp,
  isGuestPaymentPath,
  isLoginPath,
  isRateLimitExemptPath,
  rateLimitsPerMinute,
} from "./rate-limit-rules.mjs";

/**
 * Apply IP, login, guest-payment, and API-key limits. First bucket to trip wins.
 * Peeks all buckets first so a 429 does not consume the others.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {{ method: string, path: string }} route
 * @returns {boolean} true when the response was already sent (429)
 */
export function applyRateLimits(req, res, route) {
  if (isRateLimitExemptPath(route.method, route.path)) return false;

  const limits = rateLimitsPerMinute();
  const ip = clientIp(req.headers, req.socket?.remoteAddress);
  /** @type {{ key: string, limit: number }[]} */
  const checks = [{ key: `ip:${ip}`, limit: limits.ip }];

  if (isLoginPath(route.method, route.path)) {
    checks.push({ key: `login:${ip}`, limit: limits.login });
  }
  if (isGuestPaymentPath(route.method, route.path)) {
    checks.push({ key: `guestPayment:${ip}`, limit: limits.guestPayment });
  }
  const apiKeyId = apiKeyIdFromHeaders(req.headers);
  if (apiKeyId) {
    checks.push({ key: `apiKey:${apiKeyId}`, limit: limits.apiKey });
  }

  const now = Date.now();
  /** @type {{ key: string, next: number[] }[]} */
  const commits = [];
  for (const check of checks) {
    const result = peekRateLimit(check.key, check.limit, now);
    if (!result.ok) {
      res.setHeader("Retry-After", String(result.retryAfter));
      sendError(res, 429, "rate_limited", "Too many requests");
      return true;
    }
    commits.push({ key: check.key, next: result.next });
  }
  for (const row of commits) {
    commitRateLimit(row.key, row.next);
  }
  return false;
}
