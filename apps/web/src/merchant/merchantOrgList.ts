import type { OrgAccount } from "./api";
import { listOrgs } from "./api";
import { createListCache } from "../shared/listCache";

const orgListCache = createListCache<OrgAccount[]>({
  storageKey: "paymentgate.merchant.orgs",
  fetch: listOrgs,
});

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
