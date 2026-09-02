export type PortalId = "platform" | "agent" | "merchant";

const PORTAL_HOST_PREFIX: Record<PortalId, string> = {
  platform: "platform",
  agent: "agent",
  merchant: "merchant",
};

function normalizeConfiguredOrigin(raw: string, portal: PortalId): string {
  const text = raw.trim().replace(/\/$/, "");
  if (!text) return text;
  try {
    const u = new URL(text);
    const legacyPath = u.pathname.replace(/\/$/, "");
    const portalPath = `/${portal}`;
    if (legacyPath === portalPath || legacyPath.startsWith(`${portalPath}/`)) {
      return `${u.protocol}//${u.host}`;
    }
    return text;
  } catch {
    return text;
  }
}

function readPortalOrigins(): Record<PortalId, string> {
  const env = import.meta.env;
  const fallback = typeof window !== "undefined" ? window.location.origin : "";
  const trim = (raw: unknown, portal: PortalId) => {
    const text = typeof raw === "string" ? raw.trim().replace(/\/$/, "") : "";
    if (text) return normalizeConfiguredOrigin(text, portal);
    if (typeof window === "undefined") {
      return `https://${PORTAL_HOST_PREFIX[portal]}-cg.boostbunny.io`;
    }
    const { protocol, hostname, port } = window.location;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      const suffix = port ? `:${port}` : "";
      return `${protocol}//${PORTAL_HOST_PREFIX[portal]}.localhost${suffix}`;
    }
    if (hostname.startsWith(`${PORTAL_HOST_PREFIX[portal]}-`)) {
      return fallback;
    }
    return `https://${PORTAL_HOST_PREFIX[portal]}-cg.boostbunny.io`;
  };
  return {
    platform: trim(env.VITE_PLATFORM_WEB_ORIGIN, "platform"),
    agent: trim(env.VITE_AGENT_WEB_ORIGIN, "agent"),
    merchant: trim(env.VITE_MERCHANT_WEB_ORIGIN, "merchant"),
  };
}

function hostnamePortal(hostname: string): PortalId | null {
  const lower = hostname.toLowerCase();
  if (lower.startsWith("platform.")) return "platform";
  if (lower.startsWith("agent.")) return "agent";
  if (lower.startsWith("merchant.")) return "merchant";
  if (lower.startsWith("platform-")) return "platform";
  if (lower.startsWith("agent-")) return "agent";
  if (lower.startsWith("merchant-")) return "merchant";
  const origins = readPortalOrigins();
  for (const portal of ["platform", "agent", "merchant"] as const) {
    try {
      if (new URL(origins[portal]).hostname.toLowerCase() === lower) {
        return portal;
      }
    } catch {
      /* ignore invalid env origin */
    }
  }
  return null;
}

/** Portal implied by dedicated subdomain host, if any. */
export function portalFromHostname(
  hostname = typeof window !== "undefined" ? window.location.hostname : "",
): PortalId | null {
  return hostnamePortal(hostname);
}

/** True when this host serves a single portal at `/` (not legacy `/platform` paths). */
export function isDedicatedPortalHost(
  hostname = typeof window !== "undefined" ? window.location.hostname : "",
): boolean {
  return portalFromHostname(hostname) !== null;
}

/** Active portal: subdomain host, else first path segment on combined dev host. */
export function getPortal(
  pathname = typeof window !== "undefined" ? window.location.pathname : "/",
  hostname = typeof window !== "undefined" ? window.location.hostname : "",
): PortalId {
  const fromHost = portalFromHostname(hostname);
  if (fromHost) return fromHost;
  if (pathname.startsWith("/platform")) return "platform";
  if (pathname.startsWith("/agent")) return "agent";
  return "merchant";
}

function portalPrefix(portal: PortalId): string {
  return isDedicatedPortalHost() ? "" : `/${portal}`;
}

/** In-app route for a portal path segment (`settings/team`, `orders`, …). */
export function portalRoute(portal: PortalId, subpath = ""): string {
  const base = portalPrefix(portal);
  const tail = subpath.replace(/^\//, "");
  if (!tail) return base || "/";
  return `${base}/${tail}`.replace(/\/{2,}/g, "/");
}

export function platformRoute(subpath = ""): string {
  return portalRoute("platform", subpath);
}

export function agentRoute(subpath = ""): string {
  return portalRoute("agent", subpath);
}

export function merchantRoute(subpath = ""): string {
  return portalRoute("merchant", subpath);
}

/** Route within the currently active portal. */
export function inPortalRoute(subpath = ""): string {
  return portalRoute(getPortal(), subpath);
}

export function portalOrigin(portal: PortalId): string {
  const origins = readPortalOrigins();
  if (
    typeof window !== "undefined" &&
    isDedicatedPortalHost() &&
    portalFromHostname() === portal
  ) {
    return window.location.origin;
  }
  return origins[portal];
}

/** Absolute URL for cross-portal navigation (different subdomain). */
export function portalHref(portal: PortalId, subpath = ""): string {
  const origin = portalOrigin(portal);
  const path = portalRoute(portal, subpath);
  return `${origin}${path === "/" ? "" : path}`;
}
