import { listOrgUsers, type InviteOrgUserResult, type OrgMember } from "../merchant/api";
import { createEntityCache } from "./entityCache";

const orgUsersCache = createEntityCache<OrgMember[]>({
  storageKeyPrefix: "paymentgate.org-users",
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

export function primeOrgUsers(orgId: string, members: OrgMember[]): void {
  orgUsersCache.prime(orgId, members);
}

export function orgMemberFromInvite(
  invited: InviteOrgUserResult,
  email: string,
): OrgMember {
  return {
    orgId: invited.orgId,
    userId: invited.userId,
    role: invited.role,
    orgType: invited.orgType,
    status: invited.status ?? "active",
    email,
    mfaEnrolled: false,
    lastLoginAt: null,
  };
}

export function mergeOrgMember(
  members: OrgMember[],
  member: OrgMember,
): OrgMember[] {
  const index = members.findIndex(
    (row) => row.userId === member.userId || row.email === member.email,
  );
  if (index < 0) return [...members, member];
  const next = [...members];
  next[index] = { ...next[index], ...member };
  return next;
}
