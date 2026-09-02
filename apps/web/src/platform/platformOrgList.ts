import type { OrgAccount } from "./api";
import { listOrgs } from "./api";
import { createListCache } from "../shared/listCache";

/** Fired after the platform org list cache is force-refreshed (onboard, delete, etc.). */
export const PLATFORM_ORGS_UPDATED_EVENT = "paymentgate:platform-orgs-updated";

const orgListCache = createListCache<OrgAccount[]>({
  storageKey: "paymentgate.platform.orgs",
  fetch: listOrgs,
});

function dispatchPlatformOrgsUpdated(data: OrgAccount[]): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(PLATFORM_ORGS_UPDATED_EVENT, { detail: data }),
  );
}

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

/** Force API reload, repopulate cache, and notify mounted list/tree views. */
export async function refreshPlatformOrgList(): Promise<OrgAccount[]> {
  orgListCache.invalidate();
  const data = await orgListCache.get({ force: true });
  dispatchPlatformOrgsUpdated(data);
  return data;
}
