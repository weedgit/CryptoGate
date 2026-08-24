export const SESSION_COOKIE_NAME = "cg_session";

const DEFAULT_MAX_AGE_SEC = 7 * 24 * 60 * 60;

/**
 * @param {string | undefined} header
 * @returns {Record<string, string>}
 */
export function parseCookieHeader(header) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    const raw = part.slice(idx + 1).trim();
    if (!name) continue;
    try {
      out[name] = decodeURIComponent(raw);
    } catch {
      out[name] = raw;
    }
  }
  return out;
}

/**
 * @param {string | undefined} header
 * @returns {string | null}
 */
export function getSessionToken(header) {
  const token = parseCookieHeader(header)[SESSION_COOKIE_NAME];
  return token ? token : null;
}

/**
 * @param {string} token
 * @param {{ maxAgeSec?: number }} [opts]
 */
export function sessionCookie(token, opts = {}) {
  const maxAgeSec = opts.maxAgeSec ?? DEFAULT_MAX_AGE_SEC;
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${maxAgeSec}`,
  ];
  if (process.env.SESSION_COOKIE_SECURE === "true") {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}
