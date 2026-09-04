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
export async function refreshPlatformOrgList(opts?: {
  /** Keep these orgs out of the list even if the API still returns them (stale cache). */
  excludeOrgIds?: string[];
}): Promise<OrgAccount[]> {
  orgListCache.invalidate();
  let data = await orgListCache.get({ force: true });
  const exclude = opts?.excludeOrgIds?.filter(Boolean);
  if (exclude?.length) {
    const hidden = new Set(exclude);
    data = data.filter((row) => !hidden.has(row.id));
    orgListCache.seed(data);
  }
  dispatchPlatformOrgsUpdated(data);
  return data;
}

/** Paint a newly created org into list/tree views before listOrgs catches up. */
export function mergePlatformOrg(org: OrgAccount): OrgAccount[] {
  const current = orgListCache.peek() ?? [];
  const next = [org, ...current.filter((row) => row.id !== org.id)];
  orgListCache.seed(next);
  dispatchPlatformOrgsUpdated(next);
  return next;
}

/** Drop a deleted org from list/tree views immediately. */
export function removePlatformOrgFromList(orgId: string): OrgAccount[] {
  const current = orgListCache.peek() ?? [];
  const next = current.filter((row) => row.id !== orgId);
  orgListCache.seed(next);
  dispatchPlatformOrgsUpdated(next);
  return next;
}
