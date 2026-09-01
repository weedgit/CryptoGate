import type { OrgAccount } from "./api";
import { listOrgs } from "./api";
import { createListCache } from "../shared/listCache";

const orgListCache = createListCache<OrgAccount[]>({
  storageKey: "cryptogate.agent.orgs",
  fetch: listOrgs,
});

export function invalidateAgentOrgList(): void {
  orgListCache.invalidate();
}

export function peekAgentOrgs(): OrgAccount[] | null {
  return orgListCache.peek();
}

export async function getAgentOrgs(opts?: { force?: boolean }): Promise<OrgAccount[]> {
  return orgListCache.get(opts);
}
