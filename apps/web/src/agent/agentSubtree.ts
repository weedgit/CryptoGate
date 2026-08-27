import type { OrgAccount } from "../platform/api";

const MERCHANT_TYPES = new Set(["merchant", "merchant_site"]);
const AGENT_TYPES = new Set(["agent", "agent_sub"]);

function childrenByParentId(
  orgs: ReadonlyArray<OrgAccount>,
): Map<string, OrgAccount[]> {
  const byParent = new Map<string, OrgAccount[]>();
  for (const o of orgs) {
    if (!o.parentId) continue;
    const list = byParent.get(o.parentId);
    if (list) list.push(o);
    else byParent.set(o.parentId, [o]);
  }
  return byParent;
}

function orgByIdMap(
  orgs: ReadonlyArray<OrgAccount>,
): Map<string, OrgAccount> {
  return new Map(orgs.map((o) => [o.id, o]));
}

/** All agent org IDs in this agent's subtree (including self). */
export function agentSubtreeIds(
  agentId: string,
  orgs: ReadonlyArray<OrgAccount>,
): Set<string> {
  const byParent = childrenByParentId(orgs);
  const ids = new Set<string>([agentId]);
  const queue = [agentId];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!;
    for (const child of byParent.get(id) ?? []) {
      if (!AGENT_TYPES.has(child.type) || ids.has(child.id)) continue;
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
  orgs: ReadonlyArray<OrgAccount>,
  byId?: Map<string, OrgAccount>,
): boolean {
  const map = byId ?? orgByIdMap(orgs);
  let current = map.get(orgId);
  while (current) {
    if (current.id === agentId) return true;
    if (!current.parentId) return false;
    current = map.get(current.parentId);
  }
  return false;
}

/** Merchants + sites under this agent (BFS). */
export function merchantsInAgentSubtree(
  agentId: string,
  orgs: ReadonlyArray<OrgAccount>,
): OrgAccount[] {
  const byParent = childrenByParentId(orgs);
  const out: OrgAccount[] = [];
  const queue = [agentId];
  const seen = new Set<string>([agentId]);
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!;
    for (const child of byParent.get(id) ?? []) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      if (MERCHANT_TYPES.has(child.type)) {
        out.push(child);
        if (child.type === "merchant") queue.push(child.id);
      } else if (AGENT_TYPES.has(child.type)) {
        queue.push(child.id);
      }
    }
  }
  return out;
}

export function subAgentsInAgentSubtree(
  agentId: string,
  orgs: ReadonlyArray<OrgAccount>,
): OrgAccount[] {
  const byParent = childrenByParentId(orgs);
  const out: OrgAccount[] = [];
  const queue = [agentId];
  const seen = new Set<string>([agentId]);
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!;
    for (const child of byParent.get(id) ?? []) {
      if (!AGENT_TYPES.has(child.type) || seen.has(child.id)) continue;
      seen.add(child.id);
      if (child.type === "agent_sub") out.push(child);
      queue.push(child.id);
    }
  }
  return out;
}

export function orgsInAgentSubtree(
  agentId: string,
  orgs: ReadonlyArray<OrgAccount>,
): OrgAccount[] {
  const byId = orgByIdMap(orgs);
  return orgs.filter((o) => isOrgUnderAgent(o.id, agentId, orgs, byId));
}
