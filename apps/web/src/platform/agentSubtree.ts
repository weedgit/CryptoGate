import type { OrgAccount } from "./api";

const MERCHANT_TYPES = new Set(["merchant", "merchant_site"]);
const AGENT_TYPES = new Set(["agent", "agent_sub"]);

/** All agent org IDs in this agent's subtree (including self). */
export function agentSubtreeIds(agentId: string, orgs: OrgAccount[]): Set<string> {
  const byParent = new Map<string, OrgAccount[]>();
  for (const o of orgs) {
    if (!o.parentId) continue;
    const list = byParent.get(o.parentId) ?? [];
    list.push(o);
    byParent.set(o.parentId, list);
  }
  const ids = new Set<string>([agentId]);
  const queue = [agentId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const child of byParent.get(id) ?? []) {
      if (!AGENT_TYPES.has(child.type)) continue;
      ids.add(child.id);
      queue.push(child.id);
    }
  }
  return ids;
}

/** True when orgId is the agent or a descendant under it. */
export function isOrgUnderAgent(
  orgId: string,
  agentId: string,
  orgs: OrgAccount[],
): boolean {
  const byId = new Map(orgs.map((o) => [o.id, o]));
  let current = byId.get(orgId);
  while (current) {
    if (current.id === agentId) return true;
    if (!current.parentId) return false;
    current = byId.get(current.parentId);
  }
  return false;
}

export function merchantsInAgentSubtree(
  agentId: string,
  orgs: OrgAccount[],
): OrgAccount[] {
  return orgs.filter(
    (o) => MERCHANT_TYPES.has(o.type) && isOrgUnderAgent(o.id, agentId, orgs),
  );
}

export function merchantOrgIdsInAgentSubtree(
  agentId: string,
  orgs: OrgAccount[],
): Set<string> {
  return new Set(merchantsInAgentSubtree(agentId, orgs).map((m) => m.id));
}
