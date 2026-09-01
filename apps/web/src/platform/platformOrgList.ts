import type { OrgAccount } from "./api";
import { listOrgs } from "./api";
import { createListCache } from "../shared/listCache";

const orgListCache = createListCache<OrgAccount[]>({
  storageKey: "cryptogate.platform.orgs",
  fetch: listOrgs,
});

/** Drop cached org list after create, delete, or status change. */
export function invalidatePlatformOrgList(): void {
  orgListCache.invalidate();
}

/** Synchronous peek — use to paint cached rows without a loading flash. */
export function peekPlatformOrgs(): OrgAccount[] | null {
  return orgListCache.peek();
}

/** Deduped platform org list — shared across Agents, Merchants, Dashboard, etc. */
export async function getPlatformOrgs(opts?: {
  force?: boolean;
}): Promise<OrgAccount[]> {
  return orgListCache.get(opts);
}
