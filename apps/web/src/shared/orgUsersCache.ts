import { listOrgUsers, type OrgMember } from "../merchant/api";
import { createEntityCache } from "./entityCache";

const orgUsersCache = createEntityCache<OrgMember[]>({
  storageKeyPrefix: "cryptogate.org-users",
  memoryTtlMs: 20_000,
  persistTtlMs: 5 * 60_000,
  fetch: listOrgUsers,
});

export function peekOrgUsers(orgId: string): OrgMember[] | null {
  return orgUsersCache.peek(orgId);
}

export async function getOrgUsers(
  orgId: string,
  opts?: { force?: boolean },
): Promise<OrgMember[]> {
  return orgUsersCache.get(orgId, opts);
}

export function invalidateOrgUsers(orgId: string): void {
  orgUsersCache.invalidate(orgId);
}
