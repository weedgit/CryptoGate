/**
 * Live metrics and formatting helpers for platform agent/merchant detail views.
 * Data comes from API responses (including local DB seeds via scripts/seed-*.mjs).
 */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Onboard wizard default until agent commercial API (X-01) ships. */
export const DEFAULT_AGENT_COMMISSION_PERCENT = "15";

/** Figma-style date: 12-Nov-2025 */
export function formatOnboardDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const d = new Date(t);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const mon = MONTHS[d.getUTCMonth()] ?? "—";
  return `${day}-${mon}-${d.getUTCFullYear()}`;
}

export function truncateAddress(addr: string, head = 6, tail = 8): string {
  if (addr.length <= head + tail + 3) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

/** UTC ms for merchant billing window start: later of month start or onboard date. */
export function merchantBillingPeriodStartMs(onboardedAt: string): number {
  const now = new Date();
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const onboard = Date.parse(onboardedAt);
  if (!Number.isFinite(onboard)) return monthStart;
  return Math.max(monthStart, onboard);
}

/** UTC ms at start of current month. */
export function currentMonthStartMs(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
}

/** Confirmed payment-order volume MTD for merchants in `merchantIds`. */
export function agentSubtreeVolumeMtd(
  orders: ReadonlyArray<{
    orgId?: string;
    status: string;
    payableAmount: { amount: string };
    createdAt?: string;
  }>,
  merchantIds: ReadonlySet<string>,
): number {
  const monthStart = currentMonthStartMs();
  let total = 0;
  for (const o of orders) {
    if (!o.orgId || !merchantIds.has(o.orgId)) continue;
    if (o.status !== "completed") continue;
    if (o.createdAt) {
      const created = Date.parse(o.createdAt);
      if (Number.isFinite(created) && created < monthStart) continue;
    }
    const n = Number(o.payableAmount.amount);
    if (Number.isFinite(n)) total += n;
  }
  return Math.round(total * 100) / 100;
}

/** Sum volume fees on service bills whose period overlaps the current UTC month. */
export function agentSubtreePlatformFeeMtd(
  bills: ReadonlyArray<{
    orgId: string;
    periodStart: string;
    periodEnd: string;
    volumeFeeAmount: string;
  }>,
  merchantIds: ReadonlySet<string>,
): number {
  const now = new Date();
  const monthStart = toDateOnlyUtc(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const monthEnd = toDateOnlyUtc(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  );
  let total = 0;
  for (const b of bills) {
    if (!merchantIds.has(b.orgId)) continue;
    if (b.periodEnd < monthStart || b.periodStart > monthEnd) continue;
    const n = Number(b.volumeFeeAmount);
    if (Number.isFinite(n)) total += n;
  }
  return Math.round(total * 100) / 100;
}

function toDateOnlyUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Agent commission MTD = commission % × platform fee MTD. */
export function agentCommissionMtd(
  platformFeeMtd: number,
  commissionPercent: string,
): number {
  const pct = Number(commissionPercent);
  if (!Number.isFinite(pct) || platformFeeMtd <= 0) return 0;
  return Math.round(platformFeeMtd * (pct / 100) * 100) / 100;
}

export type SeedAuditEntry = {
  id: string;
  actorUserId: string | null;
  orgId: string | null;
  action: string;
  metadata: Record<string, string | number | boolean | null>;
  createdAt: string;
};

/** Overview feed row — Figma list style (title + description + time). */
export type ActivityFeedItem = {
  id: string;
  title: string;
  description: string;
  createdAt: string;
};

function auditOrgTypeLabel(type: string | null): string {
  switch (type) {
    case "agent":
      return "Agent account";
    case "agent_sub":
      return "Sub-agent account";
    case "merchant":
      return "Merchant account";
    case "merchant_site":
      return "Merchant site";
    default:
      return "Account";
  }
}

function statusLabel(status: string): string {
  if (status === "paused") return "Paused";
  if (status === "active") return "Active";
  return status.replace(/_/g, " ");
}

function describeLiveAudit(
  action: string,
  metadata: Record<string, string | number | boolean | null>,
  actionLabel: string,
): { title: string; description: string } {
  const name = metadata.name != null ? String(metadata.name) : null;
  const type = metadata.type != null ? String(metadata.type) : null;
  if (action === "org_create" && name) {
    return {
      title: type === "merchant" ? "Merchant onboarded" : "Org created",
      description: `${name} added to the portal`,
    };
  }
  if (action === "org_status") {
    const status = metadata.status != null ? String(metadata.status) : "";
    const prior =
      metadata.priorStatus != null ? String(metadata.priorStatus) : "";
    const account = auditOrgTypeLabel(type);
    const title =
      status === "paused"
        ? "Account suspended"
        : status === "active" && prior === "paused"
          ? "Account reactivated"
          : "Account status updated";
    const description =
      prior && status
        ? `${account} · ${statusLabel(prior)} → ${statusLabel(status)}`
        : account;
    return { title, description };
  }
  if (action === "login") {
    const result = metadata.result === "fail" ? "failed" : "signed in";
    return {
      title: "Sign-in",
      description: `Owner ${result}${metadata.method ? ` · ${String(metadata.method)}` : ""}`,
    };
  }
  if (action.startsWith("service_bill_") && metadata.billId != null) {
    return {
      title: actionLabel,
      description: `Bill ${String(metadata.billId).slice(0, 8)}…${
        metadata.amountUsd != null ? ` · $${metadata.amountUsd}` : ""
      }`,
    };
  }
  if (action === "org_user_invite" && metadata.email != null) {
    return {
      title: "Team member invited",
      description: `${String(metadata.email)} · ${String(metadata.role ?? "member")}`,
    };
  }
  return {
    title: actionLabel,
    description: name ?? "Recorded in audit log",
  };
}

/** Max rows shown on agent Overview — recent activity. */
export const RECENT_ACTIVITY_LIMIT = 5;

/** Map live audit rows for overview activity (no client padding). */
export function mergeActivityFeed(
  live: SeedAuditEntry[],
  _orgId: string,
  actionLabel: (action: string) => string,
  target = RECENT_ACTIVITY_LIMIT,
  _merchantNames: string[] = [],
): ActivityFeedItem[] {
  return live.slice(0, target).map((row) => {
    const label = actionLabel(row.action);
    const { title, description } = describeLiveAudit(
      row.action,
      row.metadata,
      label,
    );
    return {
      id: row.id,
      title,
      description,
      createdAt: row.createdAt,
    };
  });
}

export type MerchantListRow = {
  id: string;
  name: string;
  type: string;
  structure?: string | null;
  parentName: string;
  parentId?: string | null;
  status: string;
};

/** Place each merchant_site directly under its parent merchant. */
export function groupMerchantsUnderParents(
  rows: MerchantListRow[],
): MerchantListRow[] {
  const merchants = rows.filter((r) => r.type === "merchant");
  const sites = rows.filter((r) => r.type === "merchant_site");
  const other = rows.filter(
    (r) => r.type !== "merchant" && r.type !== "merchant_site",
  );

  const merchantIds = new Set(merchants.map((m) => m.id));
  const merchantNames = new Set(merchants.map((m) => m.name));
  const sitesByKey = new Map<string, MerchantListRow[]>();
  const orphans: MerchantListRow[] = [];

  for (const site of sites) {
    const key =
      site.parentId && merchantIds.has(site.parentId)
        ? `id:${site.parentId}`
        : merchantNames.has(site.parentName)
          ? `name:${site.parentName}`
          : null;
    if (!key) {
      orphans.push(site);
      continue;
    }
    const list = sitesByKey.get(key) ?? [];
    list.push(site);
    sitesByKey.set(key, list);
  }

  const out: MerchantListRow[] = [];
  for (const m of merchants) {
    out.push(m);
    out.push(
      ...(sitesByKey.get(`id:${m.id}`) ?? []),
      ...(sitesByKey.get(`name:${m.name}`) ?? []),
    );
  }
  out.push(...orphans, ...other);
  return out;
}

export type ServiceBillListRow = {
  id: string;
  merchantName: string;
  totalAmount: number | string;
  status: string;
};

/** Max service bill rows shown on agent detail. */
export const PREVIEW_SERVICE_BILLS_LIMIT = 15;

/** Max commission statement rows shown on agent detail. */
export const PREVIEW_COMMISSION_LIMIT = 12;

export function mergeServiceBillsWithSeeds(
  live: ReadonlyArray<{
    id: string;
    orgId: string;
    totalAmount: string;
    status: string;
  }>,
  _agentId: string,
  merchantNameById: Map<string, string>,
  _merchantNames: string[],
  target = PREVIEW_SERVICE_BILLS_LIMIT,
): ServiceBillListRow[] {
  const mapped: ServiceBillListRow[] = live.map((b) => ({
    id: b.id,
    merchantName: merchantNameById.get(b.orgId) ?? b.orgId,
    totalAmount: b.totalAmount,
    status: b.status,
  }));
  return mapped.slice(0, Math.max(target, mapped.length));
}

export type CommissionStatementRow = {
  id: string;
  periodKey: string;
  periodLabel: string;
  platformFeeCollected: number;
  commissionPercent: string;
  commissionAmount: number;
  payoutStatus: "paid" | "pending" | "scheduled";
};

export type AgentPayoutStatus = CommissionStatementRow["payoutStatus"];

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Build commission statements from live service bills in the agent subtree. */
export function commissionHistoryFromBills(
  bills: ReadonlyArray<{
    orgId: string;
    periodStart: string;
    volumeFeeAmount: string;
    status: string;
  }>,
  merchantIds: ReadonlySet<string>,
  commissionPercent: string,
): CommissionStatementRow[] {
  const scoped = bills.filter((b) => merchantIds.has(b.orgId));
  if (scoped.length === 0) return [];

  const byPeriod = new Map<
    string,
    { fee: number; hasPaid: boolean; hasOpen: boolean }
  >();
  for (const b of scoped) {
    const key = b.periodStart.slice(0, 7);
    const fee = Number(b.volumeFeeAmount);
    if (!Number.isFinite(fee)) continue;
    const cur = byPeriod.get(key) ?? { fee: 0, hasPaid: false, hasOpen: false };
    cur.fee += fee;
    if (b.status === "paid") cur.hasPaid = true;
    if (b.status === "issued" || b.status === "overdue") cur.hasOpen = true;
    byPeriod.set(key, cur);
  }

  const bps = Math.round(Number(commissionPercent) * 100) || 100;
  return [...byPeriod.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, agg]) => {
      const [y, m] = key.split("-");
      const monthIdx = Number(m) - 1;
      const mon = MONTH_LABELS[monthIdx] ?? m ?? "—";
      const platformFeeCollected = Math.round(agg.fee * 100) / 100;
      const commissionAmount =
        Math.round(platformFeeCollected * (bps / 10_000) * 100) / 100;
      let payoutStatus: AgentPayoutStatus = "scheduled";
      if (agg.hasPaid && !agg.hasOpen) payoutStatus = "paid";
      else if (agg.hasOpen) payoutStatus = "pending";
      return {
        id: `live-commission-${key}`,
        periodKey: key,
        periodLabel: `${mon} ${y}`,
        platformFeeCollected,
        commissionPercent,
        commissionAmount,
        payoutStatus,
      };
    });
}

export function mergeCommissionHistory(
  bills: ReadonlyArray<{
    orgId: string;
    periodStart: string;
    volumeFeeAmount: string;
    status: string;
  }>,
  merchantIds: ReadonlySet<string>,
  _agentId: string,
  commissionPercent: string,
  _previewTarget = PREVIEW_COMMISSION_LIMIT,
): CommissionStatementRow[] {
  return commissionHistoryFromBills(bills, merchantIds, commissionPercent);
}

export function resolveAgentPayoutStatus(
  history: ReadonlyArray<CommissionStatementRow>,
): AgentPayoutStatus | null {
  if (history.length === 0) return null;
  return history[0]!.payoutStatus;
}

export type AccountTreeNode = {
  id: string;
  name: string;
  type: string;
  status: string;
  structure?: string | null;
  parentName?: string;
  merchantsManaged?: number;
  children: AccountTreeNode[];
};

export type AgentAccountsForest = {
  tree: AccountTreeNode[];
  liveMerchantCount: number;
  merchantNames: string[];
};

function liveToMerchantRows(
  live: ReadonlyArray<{
    id: string;
    name: string;
    type: string;
    structure?: string | null;
    parentId?: string | null;
    status?: string | null;
  }>,
  agentName: string,
  parentNameById: Map<string, string>,
): MerchantListRow[] {
  return live.map((m) => ({
    id: m.id,
    name: m.name,
    type: m.type,
    structure: m.structure ?? null,
    parentId: m.parentId ?? null,
    parentName: m.parentId
      ? (parentNameById.get(m.parentId) ?? m.parentId)
      : agentName,
    status: m.status ?? "active",
  }));
}

/** Live Accounts forest for agent detail — org_accounts from API only. */
export function buildAgentAccountsForest(input: {
  agentId: string;
  agentName: string;
  liveSubAgents: ReadonlyArray<{
    id: string;
    name: string;
    status?: string | null;
  }>;
  liveMerchants: ReadonlyArray<{
    id: string;
    name: string;
    type: string;
    structure?: string | null;
    parentId?: string | null;
    status?: string | null;
  }>;
  parentNameById: Map<string, string>;
}): AgentAccountsForest {
  const { agentName, liveSubAgents, liveMerchants, parentNameById } = input;

  const liveMerchantCount = liveMerchants.filter((m) => m.type === "merchant").length;
  const liveRows = liveToMerchantRows(liveMerchants, agentName, parentNameById);
  const liveMerchantRows = liveRows.filter((m) => m.type === "merchant");
  const liveSiteRows = liveRows.filter((m) => m.type === "merchant_site");

  const liveSubIds = new Set(liveSubAgents.map((s) => s.id));

  type MutableNode = AccountTreeNode;
  const subNodes: MutableNode[] = liveSubAgents.map((s) => ({
    id: s.id,
    name: s.name,
    type: "agent_sub",
    status: s.status ?? "active",
    parentName: agentName,
    merchantsManaged: 0,
    children: [],
  }));
  const subById = new Map(subNodes.map((s) => [s.id, s]));

  const rootMerchants: MutableNode[] = [];

  function attachSites(
    merchantNode: MutableNode,
    merchantId: string,
    merchantName: string,
  ) {
    for (const site of liveSiteRows) {
      const under =
        site.parentId === merchantId ||
        (!site.parentId && site.parentName === merchantName);
      if (!under) continue;
      if (merchantNode.children.some((c) => c.id === site.id)) continue;
      merchantNode.children.push({
        id: site.id,
        name: site.name,
        type: site.type,
        status: site.status,
        structure: null,
        parentName: merchantName,
        children: [],
      });
    }
  }

  for (const m of liveMerchantRows) {
    const node: MutableNode = {
      id: m.id,
      name: m.name,
      type: m.type,
      status: m.status,
      structure: m.structure ?? null,
      parentName: m.parentName,
      children: [],
    };
    attachSites(node, m.id, m.name);
    if (m.parentId && liveSubIds.has(m.parentId)) {
      subById.get(m.parentId)?.children.push(node);
    } else {
      rootMerchants.push(node);
    }
  }

  for (const sub of subNodes) {
    sub.merchantsManaged = sub.children.filter((c) => c.type === "merchant").length;
  }

  const tree = [...subNodes, ...rootMerchants];
  const merchantNames: string[] = [];
  const walkNames = (nodes: AccountTreeNode[]) => {
    for (const n of nodes) {
      if (n.type === "merchant") merchantNames.push(n.name);
      walkNames(n.children);
    }
  };
  walkNames(tree);

  return { tree, liveMerchantCount, merchantNames };
}

export function countAccountTreeNodes(nodes: AccountTreeNode[]): number {
  let n = 0;
  const walk = (list: AccountTreeNode[]) => {
    for (const node of list) {
      n += 1;
      walk(node.children);
    }
  };
  walk(nodes);
  return n;
}
