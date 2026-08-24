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
    "Content-Type, Idempotency-Key",
  );
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
