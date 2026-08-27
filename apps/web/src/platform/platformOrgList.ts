import type { OrgAccount } from "./api";
import { listOrgs } from "./api";

const CACHE_TTL_MS = 30_000;

let cachedOrgs: OrgAccount[] | null = null;
let cachedAt = 0;
let inflight: Promise<OrgAccount[]> | null = null;

/** Drop cached org list after create, delete, or status change. */
export function invalidatePlatformOrgList(): void {
  cachedOrgs = null;
  cachedAt = 0;
  inflight = null;
}

/** Synchronous peek — use to paint cached rows without a loading flash. */
export function peekPlatformOrgs(): OrgAccount[] | null {
  return cachedOrgs;
}

function refreshOrgs(): Promise<OrgAccount[]> {
  if (inflight) return inflight;
  inflight = listOrgs()
    .then((orgs) => {
      cachedOrgs = orgs;
      cachedAt = Date.now();
      inflight = null;
      return orgs;
    })
    .catch((err) => {
      inflight = null;
      throw err;
    });
  return inflight;
}

/** Deduped platform org list — shared across Agents, Merchants, Dashboard, etc. */
export async function getPlatformOrgs(opts?: {
  force?: boolean;
}): Promise<OrgAccount[]> {
  const now = Date.now();
  const fresh = cachedOrgs && now - cachedAt < CACHE_TTL_MS;

  if (!opts?.force && fresh) {
    return cachedOrgs!;
  }

  // Stale-while-revalidate: return stale immediately and refresh in background.
  if (!opts?.force && cachedOrgs) {
    void refreshOrgs().catch(() => {
      /* keep serving stale on background failure */
    });
    return cachedOrgs;
  }

  return refreshOrgs();
}
