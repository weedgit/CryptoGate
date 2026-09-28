import { getViewerTimeZone } from "./dateTime";
import { apiFetch } from "../auth/apiFetch";
import { API_BASE, parseError } from "./apiCore";

export type DashboardInterval = "hour" | "day" | "week";

export type DashboardQuery = {
  /** Local calendar date YYYY-MM-DD. */
  from: string;
  to: string;
  /** Narrow to one agent / merchant subtree (Agent + Merchant portals). */
  orgId?: string | null;
  /** Skip the server's short cache (refresh button, live events). */
  fresh?: boolean;
  /** Read from / to in this zone instead of the viewer's (MTD uses UTC, like commission months). */
  tz?: string;
};

export type DashboardAccountSlice = {
  total: number;
  active: number;
  paused: number;
  new: number;
};

export type DashboardKpis = {
  range: {
    from: string;
    to: string;
    tz: string;
    days: number;
    interval: DashboardInterval;
    prevFrom: string;
    prevTo: string;
  };
  orders: {
    total: number;
    settled: number;
    volumeUsd: number;
    prevSettled: number;
    prevVolumeUsd: number;
    volumeTrend: number | null;
    settledTrend: number | null;
    successRate: number | null;
    open: number;
    anomalies: number;
    expiringSoon: number;
  };
  /** Merchant scope only: live queue counts per merchant / site. */
  byOrg?: {
    orgId: string;
    open: number;
    anomalies: number;
    orders: number;
    volumeUsd: number;
  }[];
  bills: {
    issued: number;
    paid: number;
    overdue: number;
    feesBilled: number;
    feesCollected: number;
    open: number;
    overdueOpen: number;
  };
  commissions: { owed: number; paid: number } | null;
  accounts: {
    merchants: DashboardAccountSlice;
    agents: DashboardAccountSlice | null;
  };
};

export type DashboardSeriesMetric =
  | "volume"
  | "settled"
  | "volumeAsset"
  | "newMerchants"
  | "newAgents";

export type DashboardSeries = {
  interval: DashboardInterval;
  keys: string[];
  series: Partial<Record<DashboardSeriesMetric, number[]>>;
};

export type DashboardRates = {
  interval: DashboardInterval;
  keys: string[];
  pairs: {
    asset: string;
    network: string;
    /** null when `source` is "market" (platform-wide fallback; count hidden). */
    quoteCount: number | null;
    latest: number | null;
    series: number[];
    source?: "quotes" | "market";
  }[];
};

export type DashboardOrgCards = {
  interval: DashboardInterval;
  keys: string[];
  cards: { orgId: string; volumeUsd: number; feesCollected: number; series: number[] }[];
};

export function viewerTimeZone(): string {
  return getViewerTimeZone();
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: unknown }>();

function buildUrl(path: string, q: DashboardQuery, extra: Record<string, string> = {}) {
  const params = new URLSearchParams({ from: q.from, to: q.to, tz: q.tz || viewerTimeZone() });
  if (q.orgId) params.set("orgId", q.orgId);
  for (const [k, v] of Object.entries(extra)) {
    if (v) params.set(k, v);
  }
  return `${API_BASE}/dashboard/${path}?${params}`;
}

async function fetchCached<T>(url: string, fresh?: boolean): Promise<T> {
  const res = await apiFetch(fresh ? `${url}&fresh=1` : url, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  const value = (await res.json()) as T;
  cache.set(url, { at: Date.now(), value });
  return value;
}

function peek<T>(url: string): T | null {
  const hit = cache.get(url);
  if (!hit || Date.now() - hit.at > CACHE_TTL_MS) return null;
  return hit.value as T;
}

function seriesExtra(opts: {
  metrics: DashboardSeriesMetric[];
  asset?: string | null;
  network?: string | null;
}) {
  return {
    metrics: [...opts.metrics].sort().join(","),
    asset: opts.asset ?? "",
    network: opts.network ?? "",
  };
}

export function getDashboardKpis(q: DashboardQuery): Promise<DashboardKpis> {
  return fetchCached(buildUrl("kpis", q), q.fresh);
}

export function peekDashboardKpis(q: DashboardQuery): DashboardKpis | null {
  return peek(buildUrl("kpis", q));
}

export function getDashboardSeries(
  q: DashboardQuery,
  opts: { metrics: DashboardSeriesMetric[]; asset?: string | null; network?: string | null },
): Promise<DashboardSeries> {
  return fetchCached(buildUrl("series", q, seriesExtra(opts)), q.fresh);
}

export function peekDashboardSeries(
  q: DashboardQuery,
  opts: { metrics: DashboardSeriesMetric[]; asset?: string | null; network?: string | null },
): DashboardSeries | null {
  return peek(buildUrl("series", q, seriesExtra(opts)));
}

export function getDashboardRates(q: DashboardQuery): Promise<DashboardRates> {
  return fetchCached(buildUrl("rates", q), q.fresh);
}

export function peekDashboardRates(q: DashboardQuery): DashboardRates | null {
  return peek(buildUrl("rates", q));
}

export function getDashboardOrgCards(
  q: DashboardQuery,
  orgIds: string[],
): Promise<DashboardOrgCards> {
  return fetchCached(
    buildUrl("org-cards", q, { orgIds: [...orgIds].sort().join(",") }),
    q.fresh,
  );
}

export type DashboardReportStat = { count: number; volumeUsd: number };

export type DashboardReports = {
  totals: { orders: number; settledVolumeUsd: number; anomalies: number };
  byStatus: (DashboardReportStat & { status: string })[];
  byAsset: (DashboardReportStat & { asset: string; network: string })[];
  byOrg: (DashboardReportStat & { orgId: string; orgName: string | null })[];
  /** Newest 14 local days with orders. */
  byDay: (DashboardReportStat & { day: string })[];
  byCreator: (DashboardReportStat & { userId: string | null; email: string | null })[];
  byMode: { mode: string; count: number }[];
  /** Absent from cached payloads before the channel column shipped. */
  byChannel?: (DashboardReportStat & { channel: "web" | "pos" | "api" | null })[];
};

/** from / to omitted = all time. */
export type DashboardReportsQuery = {
  from?: string | null;
  to?: string | null;
  orgId?: string | null;
  fresh?: boolean;
  tz?: string;
};

function reportsUrl(q: DashboardReportsQuery): string {
  const params = new URLSearchParams({ tz: q.tz || viewerTimeZone() });
  if (q.from && q.to) {
    params.set("from", q.from);
    params.set("to", q.to);
  }
  if (q.orgId) params.set("orgId", q.orgId);
  return `${API_BASE}/dashboard/reports?${params}`;
}

export function getDashboardReports(q: DashboardReportsQuery): Promise<DashboardReports> {
  return fetchCached(reportsUrl(q), q.fresh);
}

export function peekDashboardReports(q: DashboardReportsQuery): DashboardReports | null {
  return peek(reportsUrl(q));
}

/** Warm the dashboard's first paint (cards + unfiltered chart) during session restore. */
export function prefetchDashboard(q: DashboardQuery): void {
  void getDashboardKpis(q).catch(() => undefined);
  void getDashboardSeries(q, {
    metrics: ["volume", "settled", "newMerchants", "newAgents"],
  }).catch(() => undefined);
}

/** Week-bucket keys render as "Week of …" in chart labels. */
export function chartLabelsFor(keys: string[], interval: DashboardInterval): string[] {
  return interval === "week" ? keys.map((k) => `W${k}`) : keys;
}

export type CommissionPreviewMerchant = {
  orgId: string;
  name: string;
  iconKey?: string | null;
  /** YYYY-MM-DD; null until the activation fee is paid. */
  billingAnchorAt?: string | null;
  /** YYYY-MM-DD of the next monthly bill. */
  nextInvoiceOn?: string | null;
  status: "active" | "idle" | "paused";
  siteCount: number;
  transactions: number;
  volumeUsd: number;
  subscriptionUsd: number;
  volumeFeeUsd: number;
  baseUsd: number;
  commissionUsd: number;
  paidBillId: string | null;
  openBill: {
    id: string;
    status: "issued" | "overdue";
    dueAt: string | null;
    count: number;
    amountUsd: number;
  } | null;
};

/** Current UTC month commission by merchant; invoiced on `invoiceDate` (day C). */
export type CommissionPreview =
  | { eligible: false }
  | {
      eligible: true;
      periodKey: string;
      periodLabel: string;
      periodStart: string;
      invoiceDate: string;
      commissionPercent: string;
      totals: {
        merchants: number;
        transactions: number;
        volumeUsd: number;
        baseUsd: number;
        commissionUsd: number;
        openBills: number;
        openBillsUsd: number;
      };
      merchants: CommissionPreviewMerchant[];
    };

function commissionPreviewUrl(agentOrgId: string): string {
  return `${API_BASE}/dashboard/commission-preview?${new URLSearchParams({ orgId: agentOrgId })}`;
}

export function getCommissionPreview(agentOrgId: string, fresh?: boolean): Promise<CommissionPreview> {
  return fetchCached(commissionPreviewUrl(agentOrgId), fresh);
}

export function peekCommissionPreview(agentOrgId: string): CommissionPreview | null {
  return peek(commissionPreviewUrl(agentOrgId));
}
