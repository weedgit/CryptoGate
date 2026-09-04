import type { OrgAccount } from "./api";
import { listOrgs } from "./api";
import { createListCache } from "../shared/listCache";

/** Fired after the agent org list cache is force-refreshed (onboard, delete, etc.). */
export const AGENT_ORGS_UPDATED_EVENT = "paymentgate:agent-orgs-updated";

const orgListCache = createListCache<OrgAccount[]>({
  storageKey: "paymentgate.agent.orgs",
  fetch: listOrgs,
});

function dispatchAgentOrgsUpdated(data: OrgAccount[]): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(AGENT_ORGS_UPDATED_EVENT, { detail: data }),
  );
}

export function invalidateAgentOrgList(): void {
  orgListCache.invalidate();
}

export function peekAgentOrgs(): OrgAccount[] | null {
  return orgListCache.peek();
}

export async function getAgentOrgs(opts?: {
  force?: boolean;
}): Promise<OrgAccount[]> {
  return orgListCache.get(opts);
}

/** Force API reload, repopulate cache, and notify mounted list/tree views. */
export async function refreshAgentOrgList(opts?: {
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
  dispatchAgentOrgsUpdated(data);
  return data;
}

/** Paint a newly created org into list/tree views before listOrgs catches up. */
export function mergeAgentOrg(org: OrgAccount): OrgAccount[] {
  const current = orgListCache.peek() ?? [];
  const next = [org, ...current.filter((row) => row.id !== org.id)];
  orgListCache.seed(next);
  dispatchAgentOrgsUpdated(next);
  return next;
}

/** Drop a deleted org from list/tree views immediately. */
export function removeAgentOrgFromList(orgId: string): OrgAccount[] {
  const current = orgListCache.peek() ?? [];
  const next = current.filter((row) => row.id !== orgId);
  orgListCache.seed(next);
  dispatchAgentOrgsUpdated(next);
  return next;
}
