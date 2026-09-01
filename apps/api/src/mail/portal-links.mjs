/**
 * Portal URL helpers for invite / password-reset mail.
 */

const LEGACY_APP_HOSTS = new Set(["app-cg.boostbunny.io"]);

/**
 * Normalize misconfigured legacy combined-app origins to dedicated subdomains.
 * @param {string} origin
 * @param {string} portal
 */
export function normalizePortalOrigin(origin, portal) {
  const trimmed = String(origin).trim().replace(/\/$/, "");
  if (!trimmed) return trimmed;
  try {
    const u = new URL(trimmed);
    const host = u.hostname.toLowerCase();

    if (LEGACY_APP_HOSTS.has(host)) {
      if (host === "localhost" || host === "127.0.0.1") {
        const suffix = u.port ? `:${u.port}` : "";
        return `${u.protocol}//${portal}.localhost${suffix}`;
      }
      return `https://${portal}-cg.boostbunny.io`;
    }

    const legacyPath = u.pathname.replace(/\/$/, "");
    const portalPath = `/${portal}`;

    if (legacyPath === portalPath || legacyPath.startsWith(`${portalPath}/`)) {
      return `${u.protocol}//${u.host}`;
    }
    return trimmed;
  } catch {
    return trimmed;
  }
}

/** @param {string} portal */
function portalEnvOrigin(portal) {
  const key = {
    platform: "PLATFORM_WEB_ORIGIN",
    agent: "AGENT_WEB_ORIGIN",
    merchant: "MERCHANT_WEB_ORIGIN",
  }[portal];
  const raw = process.env[key]?.trim();
  if (raw) return normalizePortalOrigin(raw, portal);
  const legacy = webBaseUrl();
  try {
    const host = new URL(legacy).hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      const port = new URL(legacy).port;
      const suffix = port ? `:${port}` : "";
      return `http://${portal}.localhost${suffix}`;
    }
  } catch {
    /* fall through */
  }
  return `https://${portal}-cg.boostbunny.io`;
}

export function webBaseUrl() {
  const raw = process.env.WEB_BASE_URL || "http://127.0.0.1:5174";
  return String(raw).replace(/\/$/, "");
}

/** @param {string} orgType */
export function portalSlugForOrgType(orgType) {
  if (orgType === "platform") return "platform";
  if (orgType === "agent" || orgType === "agent_sub") return "agent";
  return "merchant";
}

/**
 * @param {string} portal
 * @param {string} [subpath]
 */
export function portalWebUrl(portal, subpath = "") {
  const origin = portalEnvOrigin(portal);
  const trimmed = subpath.replace(/^\//, "");
  if (!trimmed) return origin;
  return `${origin}/${trimmed}`;
}

/** Relative set-password path on the portal host (OpenAPI invitePath). */
export function inviteRelativePathForToken(token) {
  return `/reset-password?token=${encodeURIComponent(token)}`;
}

/**
 * Rewrite legacy combined-app invite URLs to dedicated portal reset-password links.
 * Strips accidental whitespace and paths like /invite or /platform/invite.
 * @param {string} url
 * @param {string} orgType
 */
export function normalizeInviteUrl(url, orgType) {
  const cleaned = String(url).replace(/\s+/g, "").trim();
  if (!cleaned) return cleaned;
  try {
    const u = new URL(cleaned);
    const token = u.searchParams.get("token");
    if (!token) return cleaned;
    const slug = portalSlugForOrgType(orgType);
    const origin = normalizePortalOrigin(u.origin, slug);
    return `${origin}${inviteRelativePathForToken(token)}`;
  } catch {
    return cleaned;
  }
}

/**
 * Absolute invite URL on the correct portal subdomain.
 * Uses the same reset-password flow as forgot-password mail.
 * @param {string} orgType
 * @param {string} token
 */
export function inviteUrlForToken(orgType, token) {
  const slug = portalSlugForOrgType(orgType);
  const built = portalWebUrl(
    slug,
    inviteRelativePathForToken(token).replace(/^\//, ""),
  );
  return normalizeInviteUrl(built, orgType);
}

/** @deprecated Use inviteRelativePathForToken — kept for callers expecting the old name. */
export function invitePathForToken(orgType, token) {
  void orgType;
  return inviteRelativePathForToken(token);
}

/** @param {string} token */
export function passwordResetUrl(token) {
  return inviteUrlForToken("merchant", token);
}

/** @param {string} orgType */
export function portalLoginUrl(orgType) {
  return portalWebUrl(portalSlugForOrgType(orgType));
}
