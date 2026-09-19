import { platformRoute } from "../shared/portalRouting";

function platformReturnPrefix(): string {
  const base = platformRoute();
  return base === "/" ? "/" : `${base}/`;
}

/** Cancel target for onboard wizards — only in-app platform paths are allowed. */
export function onboardReturnPath(
  searchParams: URLSearchParams,
  fallback: string,
): string {
  const raw = searchParams.get("returnTo")?.trim();
  if (!raw || !raw.startsWith(platformReturnPrefix())) return fallback;
  return raw;
}

export const ACCOUNTS_RETURN_TO = platformRoute("accounts");
/** @deprecated use ACCOUNTS_RETURN_TO */
export const ARCHITECTURE_RETURN_TO = ACCOUNTS_RETURN_TO;

export function withReturnTo(href: string, returnTo = ACCOUNTS_RETURN_TO): string {
  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  params.set("returnTo", returnTo);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}
