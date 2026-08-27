import type { OrgAccount } from "./api";
import { DEFAULT_MAX_AGENT_DEPTH } from "./onboardAgent";

export type PlatformOrgTreeNode = {
  id: string;
  name: string;
  type: string;
  status: string;
  structure?: string | null;
  country?: string | null;
  billingEmail?: string | null;
  legalName?: string | null;
  createdAt?: string | null;
  parentId: string | null;
  parentName: string | null;
  children: PlatformOrgTreeNode[];
};

export type PlatformOrgTreeStats = {
  total: number;
  platform: number;
  agents: number;
  merchants: number;
  sites: number;
  paused: number;
};

export type PlatformOrgForest = {
  roots: PlatformOrgTreeNode[];
  byId: Map<string, PlatformOrgTreeNode>;
  stats: PlatformOrgTreeStats;
  orphanCount: number;
};

export type OrgTreeFilter = {
  query: string;
  type: "all" | "platform" | "agent" | "merchant" | "site";
  status: "all" | "active" | "paused";
};

const AGENT_TYPES = new Set(["agent", "agent_sub"]);

function compareByName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

/** Full platform org hierarchy from a flat org list — no extra API calls. */
export function buildPlatformOrgForest(
  orgs: ReadonlyArray<OrgAccount>,
): PlatformOrgForest {
  const byIdOrg = new Map(orgs.map((o) => [o.id, o]));
  const childrenRaw = new Map<string, OrgAccount[]>();

  for (const o of orgs) {
    if (!o.parentId) continue;
    const list = childrenRaw.get(o.parentId);
    if (list) list.push(o);
    else childrenRaw.set(o.parentId, [o]);
  }

  const byId = new Map<string, PlatformOrgTreeNode>();

  function buildNode(org: OrgAccount): PlatformOrgTreeNode {
    const cached = byId.get(org.id);
    if (cached) return cached;

    const parentName = org.parentId
      ? (byIdOrg.get(org.parentId)?.name ?? null)
      : null;
    const children = (childrenRaw.get(org.id) ?? [])
      .slice()
      .sort(compareByName)
      .map(buildNode);

    const node: PlatformOrgTreeNode = {
      id: org.id,
      name: org.name,
      type: org.type,
      status: org.status ?? "active",
      structure: org.structure ?? null,
      country: org.country ?? null,
      billingEmail: org.billingEmail ?? null,
      legalName: org.legalName ?? null,
      createdAt: org.createdAt ?? null,
      parentId: org.parentId,
      parentName,
      children,
    };
    byId.set(org.id, node);
    return node;
  }

  const roots: PlatformOrgTreeNode[] = [];
  let orphanCount = 0;

  for (const o of orgs) {
    if (!o.parentId || !byIdOrg.has(o.parentId)) {
      if (o.parentId && !byIdOrg.has(o.parentId)) orphanCount += 1;
      roots.push(buildNode(o));
    }
  }
  roots.sort(compareByName);

  const stats: PlatformOrgTreeStats = {
    total: orgs.length,
    platform: 0,
    agents: 0,
    merchants: 0,
    sites: 0,
    paused: 0,
  };
  for (const o of orgs) {
    if (o.type === "platform") stats.platform += 1;
    else if (AGENT_TYPES.has(o.type)) stats.agents += 1;
    else if (o.type === "merchant") stats.merchants += 1;
    else if (o.type === "merchant_site") stats.sites += 1;
    if (o.status === "paused") stats.paused += 1;
  }

  return { roots, byId, stats, orphanCount };
}

function nodeMatchesFilter(
  node: PlatformOrgTreeNode,
  filter: OrgTreeFilter,
): boolean {
  if (filter.status !== "all" && node.status !== filter.status) return false;
  if (filter.type !== "all") {
    if (filter.type === "platform" && node.type !== "platform") return false;
    if (filter.type === "agent" && !AGENT_TYPES.has(node.type)) return false;
    if (filter.type === "merchant" && node.type !== "merchant") return false;
    if (filter.type === "site" && node.type !== "merchant_site") return false;
  }
  const q = filter.query.trim().toLowerCase();
  if (q && !node.name.toLowerCase().includes(q)) return false;
  return true;
}

/** Keep matching nodes and ancestors; prune non-matching branches. */
export function filterPlatformOrgForest(
  roots: PlatformOrgTreeNode[],
  filter: OrgTreeFilter,
): PlatformOrgTreeNode[] {
  const q = filter.query.trim().toLowerCase();
  const hasQuery = q.length > 0;
  const hasTypeOrStatus = filter.type !== "all" || filter.status !== "all";

  if (!hasQuery && !hasTypeOrStatus) return roots;

  function prune(node: PlatformOrgTreeNode): PlatformOrgTreeNode | null {
    const prunedChildren = node.children
      .map(prune)
      .filter((c): c is PlatformOrgTreeNode => c !== null);

    const selfMatches = nodeMatchesFilter(node, filter);
    const childKept = prunedChildren.length > 0;

    if (selfMatches || childKept) {
      return { ...node, children: prunedChildren };
    }
    return null;
  }

  return roots.map(prune).filter((n): n is PlatformOrgTreeNode => n !== null);
}

export function defaultExpandedIds(
  roots: ReadonlyArray<PlatformOrgTreeNode>,
): Set<string> {
  const ids = new Set<string>();
  for (const root of roots) {
    ids.add(root.id);
    for (const child of root.children) {
      ids.add(child.id);
    }
  }
  return ids;
}

export function collectTreeNodeIds(
  roots: ReadonlyArray<PlatformOrgTreeNode>,
): string[] {
  const ids: string[] = [];
  const walk = (nodes: ReadonlyArray<PlatformOrgTreeNode>) => {
    for (const n of nodes) {
      ids.push(n.id);
      walk(n.children);
    }
  };
  walk(roots);
  return ids;
}

/** Visible nodes in tree order, respecting which parents are expanded. */
export function visibleTreeNodeIds(
  roots: ReadonlyArray<PlatformOrgTreeNode>,
  expanded: ReadonlySet<string>,
): string[] {
  const ids: string[] = [];
  const walk = (nodes: ReadonlyArray<PlatformOrgTreeNode>) => {
    for (const n of nodes) {
      ids.push(n.id);
      if (n.children.length > 0 && expanded.has(n.id)) {
        walk(n.children);
      }
    }
  };
  walk(roots);
  return ids;
}

/**
 * Ancestors of `nodeId` plus `nodeId` when it has children — keeps the selected
 * branch visible after "collapse all".
 */
export function expandedIdsForSelectedBranch(
  nodeId: string | null,
  byId: ReadonlyMap<string, PlatformOrgTreeNode>,
): Set<string> {
  if (!nodeId) return new Set();
  const ids = new Set<string>();
  let current = byId.get(nodeId);
  while (current?.parentId) {
    ids.add(current.parentId);
    current = byId.get(current.parentId);
  }
  const selected = byId.get(nodeId);
  if (selected && selected.children.length > 0) {
    ids.add(nodeId);
  }
  return ids;
}

export function childTypeCounts(node: PlatformOrgTreeNode): {
  agents: number;
  merchants: number;
  sites: number;
  total: number;
} {
  let agents = 0;
  let merchants = 0;
  let sites = 0;
  for (const c of node.children) {
    if (AGENT_TYPES.has(c.type)) agents += 1;
    else if (c.type === "merchant") merchants += 1;
    else if (c.type === "merchant_site") sites += 1;
  }
  return { agents, merchants, sites, total: node.children.length };
}

export function orgDetailHref(
  type: string,
  id: string,
  parentId?: string | null,
): string | null {
  if (type === "platform") return "/platform/settings/team";
  if (type === "agent" || type === "agent_sub") return `/platform/agents/${id}`;
  if (type === "merchant") return `/platform/merchants/${id}`;
  if (type === "merchant_site") {
    if (!parentId) return null;
    return `/platform/merchants/${parentId}?tab=sites`;
  }
  return null;
}

export function orgDetailLabel(type: string): string | null {
  if (type === "platform") return "Platform team";
  if (type === "agent" || type === "agent_sub") return "Open agent detail";
  if (type === "merchant") return "Open merchant detail";
  if (type === "merchant_site") return "Open merchant (Sites)";
  return null;
}

/** Onboard route for a single child type (platform → agent only). */
export function orgAddChildHref(type: string): string | null {
  if (type === "platform") return "/platform/agents/new";
  return null;
}

/** Whether Add can create a child under this org from the Architecture panel. */
export function orgCanAddChild(type: string): boolean {
  return type === "platform" || type === "agent" || type === "agent_sub";
}

/**
 * Agent depth of `node` (agent / agent_sub count up to platform).
 * Used to decide if a further agent_sub is allowed under this parent.
 */
export function agentDepthOfNode(
  node: PlatformOrgTreeNode,
  byId: ReadonlyMap<string, PlatformOrgTreeNode>,
): number {
  let depth = 0;
  let current: PlatformOrgTreeNode | undefined = node;
  const seen = new Set<string>();
  while (current && current.type !== "platform") {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    if (current.type === "agent" || current.type === "agent_sub") depth += 1;
    if (!current.parentId) break;
    current = byId.get(current.parentId);
  }
  return depth;
}

export function canAddSubAgentUnderNode(
  node: PlatformOrgTreeNode,
  byId: ReadonlyMap<string, PlatformOrgTreeNode>,
  maxDepth = DEFAULT_MAX_AGENT_DEPTH,
): boolean {
  if (node.type !== "agent" && node.type !== "agent_sub") return false;
  return agentDepthOfNode(node, byId) + 1 <= maxDepth;
}

export function orgBreadcrumbPath(
  nodeId: string,
  byId: ReadonlyMap<string, PlatformOrgTreeNode>,
): PlatformOrgTreeNode[] {
  const path: PlatformOrgTreeNode[] = [];
  let current = byId.get(nodeId);
  while (current) {
    path.unshift(current);
    if (!current.parentId) break;
    current = byId.get(current.parentId);
  }
  return path;
}

export function countTreeNodes(
  roots: ReadonlyArray<PlatformOrgTreeNode>,
): number {
  let n = 0;
  const walk = (nodes: ReadonlyArray<PlatformOrgTreeNode>) => {
    for (const node of nodes) {
      n += 1;
      walk(node.children);
    }
  };
  walk(roots);
  return n;
}
