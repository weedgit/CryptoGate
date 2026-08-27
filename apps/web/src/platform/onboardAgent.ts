import type { OrgAccount } from "./api";

/** Matches apps/api DEFAULT_MAX_AGENT_DEPTH until exposed on OrgAccount API. */
export const DEFAULT_MAX_AGENT_DEPTH = 2;

const AGENT_TYPES = new Set(["agent", "agent_sub"]);

/**
 * Agent nodes from this org up to (not including) platform — mirrors API agentDepthOfParent.
 */
export function agentDepthOf(orgId: string, orgs: OrgAccount[]): number {
  const byId = new Map(orgs.map((o) => [o.id, o]));
  let depth = 0;
  let current = byId.get(orgId);
  const seen = new Set<string>();
  while (current && current.type !== "platform") {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    if (AGENT_TYPES.has(current.type)) depth += 1;
    if (!current.parentId) break;
    current = byId.get(current.parentId);
  }
  return depth;
}

export function nextAgentDepthIfCreated(
  parentId: string,
  orgType: "agent" | "agent_sub",
  orgs: OrgAccount[],
): number {
  if (orgType === "agent") {
    const parent = orgs.find((o) => o.id === parentId);
    return parent?.type === "platform" ? 1 : agentDepthOf(parentId, orgs) + 1;
  }
  return agentDepthOf(parentId, orgs) + 1;
}

export function canCreateAgentUnderParent(
  parentId: string,
  orgType: "agent" | "agent_sub",
  orgs: OrgAccount[],
  maxDepth = DEFAULT_MAX_AGENT_DEPTH,
): boolean {
  return nextAgentDepthIfCreated(parentId, orgType, orgs) <= maxDepth;
}

/** Phase 1 agent commission — UI-only until X-01 commercial API (Kevin). */
export type OnboardAgentCommercialStub = {
  commissionPercent: string;
};
