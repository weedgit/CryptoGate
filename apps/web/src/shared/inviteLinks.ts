import { getPortal, portalOrigin, type PortalId } from "./portalRouting";

const LEGACY_APP_HOSTS = new Set(["app-cg.boostbunny.io"]);

function normalizePortalOrigin(origin: string, portal: PortalId): string {
  const trimmed = origin.trim().replace(/\/$/, "");
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

function inviteRelativePathForToken(token: string): string {
  return `/reset-password?token=${encodeURIComponent(token)}`;
}

/** Rewrite legacy combined-app invite URLs to dedicated portal reset-password links. */
export function normalizeInviteUrl(raw: string, portal: PortalId): string {
  const cleaned = raw.replace(/\s+/g, "").trim();
  if (!cleaned) return "";
  try {
    const u = new URL(cleaned);
    const token = u.searchParams.get("token")?.trim();
    if (!token) return cleaned;
    const origin = normalizePortalOrigin(u.origin, portal);
    return `${origin}${inviteRelativePathForToken(token)}`;
  } catch {
    return cleaned;
  }
}

/** Prefer API inviteUrl; fall back to portal origin + invitePath. Always normalized. */
export function resolveInviteLink(
  inviteUrl?: string | null,
  invitePath?: string | null,
  portal?: PortalId,
): string {
  const activePortal = portal ?? getPortal();
  const url = inviteUrl?.trim();
  if (url) return normalizeInviteUrl(url, activePortal);
  const path = invitePath?.trim();
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) {
    return normalizeInviteUrl(path, activePortal);
  }
  const origin = portalOrigin(activePortal);
  const full = `${origin}${path.startsWith("/") ? path : `/${path}`}`;
  return normalizeInviteUrl(full, activePortal);
}
