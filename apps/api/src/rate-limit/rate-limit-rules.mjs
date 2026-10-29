import { RateLimitPerMinute } from "@paymentgate/domain";

export const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * @param {string} name
 * @param {number} fallback
 */
function envLimit(name, fallback) {
  const raw = process.env[name];
  const n = raw ? Number(raw) : fallback;
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}

export function rateLimitsPerMinute() {
  return {
    apiKey: envLimit("RATE_LIMIT_API_KEY_PER_MINUTE", RateLimitPerMinute.apiKey),
    ip: envLimit("RATE_LIMIT_IP_PER_MINUTE", RateLimitPerMinute.ip),
    login: envLimit("RATE_LIMIT_LOGIN_PER_MINUTE", RateLimitPerMinute.login),
    guestPayment: envLimit(
      "RATE_LIMIT_GUEST_PAYMENT_PER_MINUTE",
      RateLimitPerMinute.guestPayment,
    ),
  };
}

/**
 * Sliding 60s window. `timestamps` are epoch ms.
 * @param {number[]} timestamps
 * @param {number} now
 * @param {number} windowMs
 * @param {number} limit
 * @returns {{ ok: true, next: number[] } | { ok: false, retryAfter: number }}
 */
export function rateLimitDecision(timestamps, now, windowMs, limit) {
  const cutoff = now - windowMs;
  const recent = timestamps.filter((t) => t > cutoff);
  if (recent.length >= limit) {
    const oldest = Math.min(...recent);
    const retryAfter = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    return { ok: false, retryAfter };
  }
  return { ok: true, next: [...recent, now] };
}

/**
 * Trust X-Forwarded-For only from loopback (nginx). Spoofed XFF from a
 * non-local peer must not rewrite the client IP used for rate limits.
 * @param {string | undefined} remoteAddress
 */
function isLoopbackRemote(remoteAddress) {
  if (!remoteAddress) return false;
  const addr = remoteAddress.replace(/^::ffff:/, "");
  return addr === "127.0.0.1" || addr === "::1" || addr === "localhost";
}

/**
 * @param {string | string[] | undefined} raw
 */
function headerValue(raw) {
  const value = Array.isArray(raw) ? raw.join(",") : raw;
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Client IP behind the local nginx. nginx sets X-Real-IP to the peer it saw and *appends*
 * that peer to X-Forwarded-For, so only X-Real-IP or the rightmost XFF entry is trustworthy;
 * the leftmost entry is whatever the client sent (H8).
 * @param {import("node:http").IncomingHttpHeaders} headers
 * @param {string | undefined} remoteAddress
 */
export function clientIp(headers, remoteAddress) {
  if (isLoopbackRemote(remoteAddress)) {
    const realIp = headerValue(headers["x-real-ip"]);
    if (realIp && !realIp.includes(",")) return realIp;
    const hops = headerValue(headers["x-forwarded-for"])
      .split(",")
      .map((hop) => hop.trim())
      .filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1];
  }
  if (typeof remoteAddress === "string" && remoteAddress) {
    return remoteAddress;
  }
  return "unknown";
}

/**
 * Password, TOTP and reset-token guesses share the login bucket.
 * @param {string} method
 * @param {string} path
 */
export function isLoginPath(method, path) {
  return (
    method === "POST" &&
    (path === "/v1/auth/login" ||
      path === "/v1/auth/mfa/verify" ||
      path === "/v1/auth/forgot-password" ||
      path === "/v1/auth/reset-password")
  );
}

/** Brute-force sensitive — same bucket intensity as login. */
export function isPosPinVerifyPath(method, path) {
  return (
    method === "POST" &&
    (path === "/v1/auth/pos-pin/verify" || path === "/v1/pos/unlock" || path === "/v1/pos/terminals")
  );
}

/** Email / SMS OTP send+verify — same bucket intensity as login. */
export function isContactOtpPath(method, path) {
  return (
    method === "POST" &&
    (path === "/v1/auth/contact/email/send" ||
      path === "/v1/auth/contact/email/verify" ||
      path === "/v1/auth/contact/phone/send" ||
      path === "/v1/auth/contact/phone/verify")
  );
}

/**
 * @param {string} method
 * @param {string} path
 */
export function isGuestPaymentPath(method, path) {
  return method === "GET" && /^\/v1\/orders\/[^/]+\/payment$/.test(path);
}

/**
 * Probes and session bootstrap — excluded from IP rate limit (still auth-gated where required).
 * @param {string} method
 * @param {string} path
 */
export function isRateLimitExemptPath(method, path) {
  if (method === "GET" && path === "/health") return true;
  if (method === "GET" && path === "/v1/auth/session") return true;
  return false;
}

/**
 * @param {import("node:http").IncomingHttpHeaders} headers
 */
export function apiKeyIdFromHeaders(headers) {
  const raw = headers["x-api-key"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value.trim() : "";
}
