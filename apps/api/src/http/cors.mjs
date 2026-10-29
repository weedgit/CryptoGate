/**
 * Browser origins allowed to call the API (guest pay page).
 * Prefers CORS_ALLOWED_ORIGINS (comma-separated); else PAYMENT_PAGE_BASE_URL.
 * @returns {string[]}
 */
export function listCorsAllowedOrigins() {
  const raw = process.env.CORS_ALLOWED_ORIGINS?.trim();
  if (raw) {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const pay = process.env.PAYMENT_PAGE_BASE_URL?.trim();
  return pay ? [pay] : [];
}

/**
 * Cookie-authenticated mutations must come from the portal's own origin (nginx serves the SPA
 * and /v1 on one host) or an allowed pay-page origin. SameSite=Lax still lets sibling
 * *.boostbunny.io sites send the cookie, so the browser's Origin / Sec-Fetch-Site decide
 * (review D8). Requests without either header (native POS app, server-to-server) pass.
 * @param {import("node:http").IncomingMessage} req
 * @returns {boolean}
 */
export function isAllowedMutationOrigin(req) {
  const origin = typeof req.headers.origin === "string" ? req.headers.origin.trim() : "";
  if (origin) {
    if (listCorsAllowedOrigins().includes(origin)) return true;
    try {
      return new URL(origin).host === String(req.headers.host ?? "");
    } catch {
      return false;
    }
  }
  const site = String(req.headers["sec-fetch-site"] ?? "").toLowerCase();
  return site !== "cross-site" && site !== "same-site";
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @returns {boolean} true when Origin was allowed
 */
export function applyCorsHeaders(req, res) {
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : "";
  if (!origin) return false;
  if (!listCorsAllowedOrigins().includes(origin)) return false;

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Vary", "Origin");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, OPTIONS",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Idempotency-Key, X-PaymentGate-Client",
  );
  res.setHeader("Access-Control-Expose-Headers", "X-Server-Time");
  return true;
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @returns {boolean} true if this was an OPTIONS preflight (response ended)
 */
export function handleCorsPreflight(req, res) {
  if ((req.method ?? "GET") !== "OPTIONS") return false;
  applyCorsHeaders(req, res);
  res.writeHead(204);
  res.end();
  return true;
}
