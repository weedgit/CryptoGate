import {
  getServerJson,
  invalidateServerJson,
  peekServerJson,
  toServerPage,
  type ServerPage,
  type ServerParams,
} from "./serverListApi";

export type ServiceBillBucket =
  | "all"
  | "issued"
  | "overdue"
  | "unpaid"
  | "draft"
  | "activation"
  | "paid"
  | "waived"
  | "cancelled"
  /** Merchant portal: draft / issued / overdue (incl. activation). */
  | "open"
  /** Merchant portal: any overdue bill. */
  | "late";

export type ServiceBillSortKey =
  | "billId"
  | "merchant"
  | "billedVolume"
  | "total"
  | "dueDate"
  | "status"
  | "period"
  /** Open activation bill first, then newest due date. */
  | "activationFirst";

/** Optional local calendar window; open issued / overdue bills always match. */
export type ServiceBillWindow = {
  from?: string;
  to?: string;
  tz?: string;
  orgId?: string | null;
  /** Merchants in this agent's subtree. */
  agentOrgId?: string | null;
  /** Billing period overlaps [periodFrom, periodTo] (YYYY-MM-DD); replaces from/to. */
  periodFrom?: string | null;
  periodTo?: string | null;
};

export type ServiceBillsListParams = ServiceBillWindow & {
  bucket: ServiceBillBucket;
  q?: string;
  sort: ServiceBillSortKey;
  dir: "asc" | "desc";
  limit: number;
  offset: number;
};

export type ServiceBillsSummary = {
  counts: Record<ServiceBillBucket, number>;
  amounts: { issuedUsd: string; overdueUsd: string; paidUsd: string };
};

export const SERVICE_BILLS_PAGE_SIZE = 10;

export function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Platform / Agent list opens on the last month of UTC days (daily invoice job calendar). */
export function defaultServiceBillsWindow(now = new Date()): {
  from: string;
  to: string;
  tz: string;
} {
  const from = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, now.getUTCDate()),
  );
  return { from: utcDateKey(from), to: utcDateKey(now), tz: "UTC" };
}

export function defaultServiceBillsListParams(now = new Date()): ServiceBillsListParams {
  return {
    ...defaultServiceBillsWindow(now),
    bucket: "all",
    q: "",
    sort: "dueDate",
    dir: "desc",
    limit: SERVICE_BILLS_PAGE_SIZE,
    offset: 0,
  };
}

/** Merchant list opens on every bill, open activation first. */
export const MERCHANT_SERVICE_BILLS_DEFAULT: ServiceBillsListParams = {
  bucket: "all",
  q: "",
  sort: "activationFirst",
  dir: "desc",
  limit: SERVICE_BILLS_PAGE_SIZE,
  offset: 0,
};

/** The merchant's open activation bill (list callout + app banner). */
export const OPEN_ACTIVATION_QUERY: ServiceBillsListParams = {
  bucket: "activation",
  sort: "dueDate",
  dir: "desc",
  limit: 1,
  offset: 0,
};

export function prefetchServiceBillsList(portal: "platform" | "agent" | "merchant"): void {
  if (portal === "merchant") {
    void listServiceBillsServer(MERCHANT_SERVICE_BILLS_DEFAULT).catch(() => undefined);
    void getServiceBillsSummary({}).catch(() => undefined);
    return;
  }
  const window = defaultServiceBillsWindow();
  void listServiceBillsServer(defaultServiceBillsListParams()).catch(() => undefined);
  void getServiceBillsSummary(window).catch(() => undefined);
}

function listParams(p: ServiceBillsListParams): ServerParams {
  return {
    bucket: p.bucket === "all" ? null : p.bucket,
    from: p.from,
    to: p.to,
    tz: p.from ? p.tz : null,
    orgId: p.orgId,
    agentOrgId: p.agentOrgId,
    periodFrom: p.periodFrom,
    periodTo: p.periodTo,
    q: p.q?.trim() || null,
    sort: p.sort,
    dir: p.dir,
    limit: p.limit,
    offset: p.offset,
  };
}

function windowParams(p: ServiceBillWindow): ServerParams {
  return {
    from: p.from,
    to: p.to,
    tz: p.from ? p.tz : null,
    orgId: p.orgId,
    agentOrgId: p.agentOrgId,
    periodFrom: p.periodFrom,
    periodTo: p.periodTo,
  };
}

export async function listServiceBillsServer<B>(
  p: ServiceBillsListParams,
): Promise<ServerPage<B>> {
  const data = await getServerJson<Partial<ServerPage<B>>>(
    "/service-bills",
    listParams(p),
  );
  return toServerPage(data, p.limit);
}

export function peekServiceBillsServer<B>(
  p: ServiceBillsListParams,
): ServerPage<B> | null {
  const data = peekServerJson<Partial<ServerPage<B>>>("/service-bills", listParams(p));
  return data ? toServerPage(data, p.limit) : null;
}

export function getServiceBillsSummary(p: ServiceBillWindow): Promise<ServiceBillsSummary> {
  return getServerJson<ServiceBillsSummary>("/service-bills/summary", windowParams(p));
}

export type ServiceBillOrgStatus = {
  orgId: string;
  billStatus: "overdue" | "activation" | "issued" | "paid" | null;
  /** Accounts tree badge (drafts ignored). */
  feeStatus: "overdue" | "issued" | "paid" | null;
  /** YYYY-MM of the newest bill period. */
  latestPeriod: string | null;
  /** Newest period still has issued / overdue bills. */
  latestPeriodOpen: boolean;
};

export async function getServiceBillOrgStatus(): Promise<Map<string, ServiceBillOrgStatus>> {
  const data = await getServerJson<{ items: ServiceBillOrgStatus[] }>(
    "/service-bills/org-status",
  );
  return new Map((data.items ?? []).map((r) => [r.orgId, r]));
}

export function peekServiceBillOrgStatus(): Map<string, ServiceBillOrgStatus> | null {
  const data = peekServerJson<{ items: ServiceBillOrgStatus[] }>(
    "/service-bills/org-status",
  );
  return data ? new Map((data.items ?? []).map((r) => [r.orgId, r])) : null;
}

/**
 * Agent payout badge from its merchants' newest billing month:
 * pending while that month still has open bills, otherwise scheduled.
 */
export function agentPayoutFromOrgStatus(
  byOrg: ReadonlyMap<string, ServiceBillOrgStatus>,
  merchantIds: ReadonlySet<string>,
): "pending" | "scheduled" | null {
  let latest: string | null = null;
  let open = false;
  for (const id of merchantIds) {
    const row = byOrg.get(id);
    if (!row?.latestPeriod) continue;
    if (latest == null || row.latestPeriod > latest) {
      latest = row.latestPeriod;
      open = row.latestPeriodOpen;
    } else if (row.latestPeriod === latest && row.latestPeriodOpen) {
      open = true;
    }
  }
  if (latest == null) return null;
  return open ? "pending" : "scheduled";
}

export function peekServiceBillsSummary(p: ServiceBillWindow): ServiceBillsSummary | null {
  return peekServerJson<ServiceBillsSummary>("/service-bills/summary", windowParams(p));
}

/** Drop cached bill pages / summaries after issue, void, mark paid or adjust. */
export function invalidateServiceBillsServer(): void {
  invalidateServerJson("/service-bills");
}
