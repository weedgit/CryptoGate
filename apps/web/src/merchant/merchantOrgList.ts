import type { OrgAccount } from "./api";
import { listOrgs } from "./api";
import { createListCache } from "../shared/listCache";

/** Fired after the merchant org list cache is force-refreshed (create, delete, etc.). */
export const MERCHANT_ORGS_UPDATED_EVENT = "paymentgate:merchant-orgs-updated";

const orgListCache = createListCache<OrgAccount[]>({
  storageKey: "paymentgate.merchant.orgs",
  fetch: listOrgs,
});

function dispatchMerchantOrgsUpdated(data: OrgAccount[]): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(MERCHANT_ORGS_UPDATED_EVENT, { detail: data }),
  );
}

export function invalidateMerchantOrgList(): void {
  orgListCache.invalidate();
}

export function peekMerchantOrgs(): OrgAccount[] | null {
  return orgListCache.peek();
}

export async function getMerchantOrgs(opts?: {
  force?: boolean;
}): Promise<OrgAccount[]> {
  return orgListCache.get(opts);
}

/** Force API reload, repopulate cache, and notify mounted list/tree views. */
export async function refreshMerchantOrgList(opts?: {
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
  dispatchMerchantOrgsUpdated(data);
  return data;
}

/** Drop a deleted org from list/tree views immediately. */
export function removeMerchantOrgFromList(orgId: string): OrgAccount[] {
  const current = orgListCache.peek() ?? [];
  const next = current.filter((row) => row.id !== orgId);
  orgListCache.seed(next);
  dispatchMerchantOrgsUpdated(next);
  return next;
}
