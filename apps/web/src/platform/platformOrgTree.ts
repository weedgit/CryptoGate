import type { OrgAccount } from "./api";

export type PlatformOrgTreeNode = {
  id: string;
  name: string;
  type: string;
  status: string;
  country?: string | null;
  legalName?: string | null;
  createdAt?: string | null;
  orderCreateSuspended?: boolean;
  iconKey?: string | null;
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
  /** Commercial / payout status (platform detail metric cards). */
  pay:
    | "all"
    | "paid"
    | "overdue"
    | "issued"
    | "pending"
    | "scheduled";
};

const AGENT_TYPES = new Set(["agent"]);

function compareByName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

/** Full platform org hierarchy from a flat org list — no extra API calls. */
export function buildPlatformOrgForest(
  orgs: ReadonlyArray<OrgAccount>,
  options?: { expectedRootIds?: ReadonlySet<string> },
): PlatformOrgForest {
  const byIdOrg = new Map(orgs.map((o) => [o.id, o]));
  const childrenRaw = new Map<string, OrgAccount[]>();
  const expectedRoots = options?.expectedRootIds;

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
      country: org.country ?? null,
      legalName: org.legalName ?? null,
      createdAt: org.createdAt ?? null,
      orderCreateSuspended: org.orderCreateSuspended === true,
      iconKey: org.iconKey ?? null,
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
      // Parent missing from this list — only flag as orphan when it is not an
      // intentional scoped root (e.g. agent subtree excludes Platform parent).
      if (
        o.parentId &&
        !byIdOrg.has(o.parentId) &&
        !expectedRoots?.has(o.id)
      ) {
        orphanCount += 1;
      }
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
  payOf?: (node: PlatformOrgTreeNode) => string | null | undefined,
): boolean {
  if (filter.status !== "all" && node.status !== filter.status) return false;
  if (filter.type !== "all") {
    if (filter.type === "platform" && node.type !== "platform") return false;
    if (filter.type === "agent" && !AGENT_TYPES.has(node.type)) return false;
    if (filter.type === "merchant" && node.type !== "merchant") return false;
    if (filter.type === "site" && node.type !== "merchant_site") return false;
  }
  if (filter.pay !== "all") {
    if (!payOf) return false;
    const pay = payOf(node);
    if (pay !== filter.pay) return false;
  }
  const q = filter.query.trim().toLowerCase();
  if (q && !node.name.toLowerCase().includes(q)) return false;
  return true;
}

/** Keep matching nodes and ancestors; prune non-matching branches. */
export function filterPlatformOrgForest(
  roots: PlatformOrgTreeNode[],
  filter: OrgTreeFilter,
  options?: {
    payOf?: (node: PlatformOrgTreeNode) => string | null | undefined;
  },
): PlatformOrgTreeNode[] {
  const q = filter.query.trim().toLowerCase();
  const hasQuery = q.length > 0;
  const hasTypeOrStatus = filter.type !== "all" || filter.status !== "all";
  const hasPay = filter.pay !== "all";

  if (!hasQuery && !hasTypeOrStatus && !hasPay) return roots;

  const payOf = options?.payOf;

  function prune(node: PlatformOrgTreeNode): PlatformOrgTreeNode | null {
    const prunedChildren = node.children
      .map(prune)
      .filter((c): c is PlatformOrgTreeNode => c !== null);

    const selfMatches = nodeMatchesFilter(node, filter, payOf);
    const childKept = prunedChildren.length > 0;

    if (selfMatches || childKept) {
      return { ...node, children: prunedChildren };
    }
    return null;
  }

  return roots.map(prune).filter((n): n is PlatformOrgTreeNode => n !== null);
}

function compareName(a: PlatformOrgTreeNode, b: PlatformOrgTreeNode): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

/** Lift agent nodes to roots (hide platform); keep merchant/site children. */
export function agentsForestRoots(
  roots: ReadonlyArray<PlatformOrgTreeNode>,
): PlatformOrgTreeNode[] {
  const agents: PlatformOrgTreeNode[] = [];
  const walk = (nodes: ReadonlyArray<PlatformOrgTreeNode>) => {
    for (const n of nodes) {
      if (n.type === "agent") {
        agents.push({ ...n, children: n.children.slice() });
      } else {
        walk(n.children);
      }
    }
  };
  walk(roots);
  return agents.sort(compareName);
}

/** Lift merchant nodes to roots; keep site children. */
export function merchantsForestRoots(
  roots: ReadonlyArray<PlatformOrgTreeNode>,
): PlatformOrgTreeNode[] {
  const merchants: PlatformOrgTreeNode[] = [];
  const walk = (nodes: ReadonlyArray<PlatformOrgTreeNode>) => {
    for (const n of nodes) {
      if (n.type === "merchant") {
        merchants.push({
          ...n,
          children: n.children.filter((c) => c.type === "merchant_site"),
        });
      } else {
        walk(n.children);
      }
    }
  };
  walk(roots);
  return merchants.sort(compareName);
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
  // Ancestors only — selecting a node must not force it open.
  while (current?.parentId) {
    ids.add(current.parentId);
    current = byId.get(current.parentId);
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

import { platformRoute } from "../shared/portalRouting";

export function orgDetailHref(
  type: string,
  id: string,
  parentId?: string | null,
): string | null {
  if (type === "platform") return platformRoute("settings/team");
  if (type === "agent")
    return platformRoute(`accounts/agents/${id}`);
  if (type === "merchant") return platformRoute(`accounts/merchants/${id}`);
  if (type === "merchant_site") {
    if (!parentId) return null;
    return platformRoute(`accounts/merchants/${parentId}`);
  }
  return null;
}

export function orgDetailLabel(type: string): string | null {
  if (type === "platform") return "Platform team";
  if (type === "agent") return null;
  if (type === "merchant") return null;
  if (type === "merchant_site") return null;
  return null;
}

/** Onboard route for a single child type. */
export function orgAddChildHref(type: string): string | null {
  if (type === "platform") return platformRoute("agents/new");
  if (type === "agent") {
    return platformRoute("merchants/new");
  }
  if (type === "merchant" || type === "merchant_site") {
    return platformRoute("sites/new");
  }
  return null;
}

/** Whether Add can create a child under this org from the Architecture panel. */
export function orgCanAddChild(type: string): boolean {
  return (
    type === "platform" ||
    type === "agent" ||
    type === "merchant" ||
    type === "merchant_site"
  );
}

/**
 * Agent depth of `node` (agent count up to platform).
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
    if (current.type === "agent") depth += 1;
    if (!current.parentId) break;
    current = byId.get(current.parentId);
  }
  return depth;
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
