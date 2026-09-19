import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import { NetworkId } from "@paymentgate/domain";
import { AuthToast } from "../auth/AuthToast";
import { GateLogoMark } from "../auth/GateLogoMark";
import { platformRoute } from "../shared/portalRouting";
import {
  useDashboardLiveEvents,
  type DashboardLiveSlice,
} from "../shared/useDashboardLiveEvents";
import {
  ApiError,
  getPlatformDashboardSummary,
  getPlatformOrgs,
  getPlatformOrders,
  getPlatformServiceBills,
  peekPlatformOrgs,
  peekPlatformOrders,
  peekPlatformServiceBills,
  type OrgAccount,
  type PaymentOrder,
  type ServiceBill,
  type Session,
} from "./api";
import {
  feeAccruedFromBills,
  invoiceStatsFromBills,
} from "./dashboardBillPeriod";
import { listCommissionPayouts } from "../commercial/commissionPayoutRecords";
import { PagePending } from "./ui/PlatformPending";
import { AssetNetworkTables } from "./AssetNetworkTables";
import { AddChartsModal } from "./ui/AddChartsModal";
import { ChartHelpButton } from "./ui/ChartHelpButton";
import { VolumeScopeToggle } from "./ui/VolumeScopeToggle";
import {
  chartTitleFromFilter,
  isSameSelection,
  matchesVolumeFilter,
  volumeFilterFromSelection,
  type VolumeChartFilter,
  type VolumeScope,
  type VolumeSelection,
} from "./volumeFilter";
import {
  ChartMaximizeButton,
  ChartMaximizeOverlay,
} from "./ui/ChartMaximize";
import {
  ChartHoverTip,
  formatChartDateTime,
  useLineChartHover,
} from "./ui/ChartHover";
import { formatAxisNumber, niceAxisTicks, chartScaleTop } from "./ui/chartAxis";
import { VolumeChart, type VolumeChartZoomApi } from "./charts/VolumeChart";
import { OverviewTable, type OverviewChartCard } from "./ui/OverviewTable";
import {
  METRIC_CHART_COLORS,
  orgMetricChartColor,
} from "./ui/chartColors";
import {
  sessionIsPlatformViewerOnly,
} from "./org";

type Props = { session: Session };

type PeriodId = "today" | "7d" | "1m";

type AccountSlice = { total: number; active: number; pause: number };

type OverviewStats = {
  merchants: AccountSlice;
  agents: AccountSlice;
  newMerchants: number;
  newAgents: number;
  newCashiers: number;
  invoicesIssued: number;
  invoicesPaid: number;
  invoicesOverdue: number;
  volume: number;
  /** Volume fees billed in period (issued / overdue / paid). */
  fees: number;
  /** Volume fees paid in period. */
  collected: number;
  /** Open payment anomalies (not period-scoped — ops queue). */
  anomalies: number;
  /** Platform→agent commission still open in period months. */
  commissionOwed: number;
  /** Platform→agent commission paid/settled in period months. */
  commissionPaid: number;
};

const PERIOD_OPTIONS: { id: PeriodId; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7d" },
  { id: "1m", label: "1m" },
];

const OVERVIEW_STORAGE_KEY = "paymentgate.platform.overviewCharts.v2";
const DEFAULT_OVERVIEW_IDS = ["invoices", "fees", "accounts"];

function isOrgOverviewId(id: string): boolean {
  return id.startsWith("merchant:") || id.startsWith("agent:");
}

function parseOrgOverviewId(
  id: string,
): { kind: "merchant" | "agent"; orgId: string } | null {
  const m = /^(merchant|agent):(.+)$/.exec(id);
  if (!m) return null;
  return { kind: m[1] as "merchant" | "agent", orgId: m[2] };
}

function loadOverviewIds(): string[] {
  try {
    const raw = localStorage.getItem(OVERVIEW_STORAGE_KEY);
    if (!raw) return DEFAULT_OVERVIEW_IDS;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === "string")) {
      return DEFAULT_OVERVIEW_IDS;
    }
    return parsed.length ? parsed : DEFAULT_OVERVIEW_IDS;
  } catch {
    return DEFAULT_OVERVIEW_IDS;
  }
}

const EMPTY_STATS: OverviewStats = {
  merchants: { total: 0, active: 0, pause: 0 },
  agents: { total: 0, active: 0, pause: 0 },
  newMerchants: 0,
  newAgents: 0,
  newCashiers: 0,
  invoicesIssued: 0,
  invoicesPaid: 0,
  invoicesOverdue: 0,
  volume: 0,
  fees: 0,
  collected: 0,
  anomalies: 0,
  commissionOwed: 0,
  commissionPaid: 0,
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateInput(value: string, end = false): Date {
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return end ? endOfDay(date) : startOfDay(date);
}

function buildDayKeys(from: Date, to: Date): string[] {
  const dayKeys: string[] = [];
  const cursor = startOfDay(from);
  const end = startOfDay(to);
  while (cursor.getTime() <= end.getTime()) {
    dayKeys.push(toDateInputValue(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dayKeys;
}

/** UTC calendar days — matches SQL `date_trunc('day', … AT TIME ZONE 'UTC')`. */
function buildUtcDayKeys(from: Date, to: Date): string[] {
  const dayKeys: string[] = [];
  const cursor = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  const endMs = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  while (cursor.getTime() <= endMs) {
    dayKeys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dayKeys;
}

function normalizeVolumeDayKey(raw: string): string {
  const s = String(raw ?? "");
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (iso) return iso[1];
  const t = Date.parse(s);
  if (Number.isFinite(t)) return new Date(t).toISOString().slice(0, 10);
  return s.slice(0, 10);
}

function periodWindow(id: PeriodId): { from: Date; to: Date; dayKeys: string[] } {
  const now = new Date();
  let from = startOfDay(now);
  const to = endOfDay(now);

  if (id === "7d") {
    from = startOfDay(now);
    from.setDate(from.getDate() - 6);
  } else if (id === "1m") {
    from = startOfDay(now);
    from.setDate(from.getDate() - 29);
  }

  return { from, to, dayKeys: buildDayKeys(from, to) };
}

function inWindow(iso: string | null | undefined, from: Date, to: Date): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return t >= from.getTime() && t <= to.getTime();
}

function dayKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return toDateInputValue(new Date(t));
}

function isSettledOrder(status: string): boolean {
  return status === "completed" || status === "confirmed";
}

function isMerchantType(type: string): boolean {
  return type === "merchant" || type === "merchant_site";
}

function isAgentType(type: string): boolean {
  return type === "agent" || type === "agent_sub";
}

function buildChildrenMap(orgs: OrgAccount[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const o of orgs) {
    if (!o.parentId) continue;
    const list = map.get(o.parentId) ?? [];
    list.push(o.id);
    map.set(o.parentId, list);
  }
  return map;
}

function subtreeIds(rootId: string, children: Map<string, string[]>): Set<string> {
  const out = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const child of children.get(id) ?? []) {
      if (out.has(child)) continue;
      out.add(child);
      stack.push(child);
    }
  }
  return out;
}

/** Orgs with payment-order activity in window (order expiresAt proxy until createdAt ships). */
function activeOrgIds(
  orders: PaymentOrder[],
  from: Date,
  to: Date,
): Set<string> {
  const active = new Set<string>();
  for (const o of orders) {
    if (!o.orgId) continue;
    if (!inWindow(o.expiresAt, from, to)) continue;
    active.add(o.orgId);
  }
  return active;
}

function accountSlice(
  orgs: OrgAccount[],
  typePred: (t: string) => boolean,
  activeLeaves: Set<string>,
  children: Map<string, string[]>,
  pausedOrgIds: Set<string>,
): AccountSlice {
  const targets = orgs.filter((o) => typePred(o.type));
  let active = 0;
  let pause = 0;
  for (const org of targets) {
    if (pausedOrgIds.has(org.id)) {
      pause += 1;
      continue;
    }
    const tree = subtreeIds(org.id, children);
    let hit = false;
    for (const id of tree) {
      if (activeLeaves.has(id)) {
        hit = true;
        break;
      }
    }
    if (hit) active += 1;
  }
  return { total: targets.length, active, pause };
}

/** Orgs marked paused on the org row (avoid N+1 membership fetches). */
function pausedOrgIdsFromOrgs(orgs: OrgAccount[]): Set<string> {
  const paused = new Set<string>();
  for (const o of orgs) {
    if ((isMerchantType(o.type) || isAgentType(o.type)) && o.status === "paused") {
      paused.add(o.id);
    }
  }
  return paused;
}

function volumeSeries(
  orders: PaymentOrder[],
  days: string[],
  filter: VolumeChartFilter = { scope: "all" },
  orgScope: Set<string> | null = null,
): number[] {
  const map = new Map(days.map((d) => [d, 0]));
  for (const o of orders) {
    if (!isSettledOrder(o.status)) continue;
    if (!matchesVolumeFilter(o, filter)) continue;
    if (orgScope && (!o.orgId || !orgScope.has(o.orgId))) continue;
    const key = dayKey(o.expiresAt);
    if (!key || !map.has(key)) continue;
    const n = Number(o.payableAmount.amount);
    if (Number.isFinite(n)) map.set(key, (map.get(key) ?? 0) + n);
  }
  return days.map((d) => map.get(d) ?? 0);
}

function filteredVolumeTotal(
  orders: PaymentOrder[],
  from: Date,
  to: Date,
  filter: VolumeChartFilter,
): number {
  let total = 0;
  for (const o of orders) {
    if (!isSettledOrder(o.status)) continue;
    if (!matchesVolumeFilter(o, filter)) continue;
    if (!inWindow(o.expiresAt, from, to)) continue;
    const n = Number(o.payableAmount.amount);
    if (Number.isFinite(n)) total += n;
  }
  return total;
}

function orgFeeTotal(
  bills: ServiceBill[],
  from: Date,
  to: Date,
  orgScope: Set<string>,
): number {
  let total = 0;
  for (const b of bills) {
    if (b.status !== "paid") continue;
    if (!orgScope.has(b.orgId)) continue;
    if (!inWindow(b.paidAt ?? b.dueAt, from, to)) continue;
    const n = Number(b.volumeFeeAmount);
    if (Number.isFinite(n)) total += n;
  }
  return total;
}

function orgVolumeTotal(
  orders: PaymentOrder[],
  from: Date,
  to: Date,
  orgScope: Set<string>,
): number {
  let total = 0;
  for (const o of orders) {
    if (!isSettledOrder(o.status)) continue;
    if (!o.orgId || !orgScope.has(o.orgId)) continue;
    if (!inWindow(o.expiresAt, from, to)) continue;
    const n = Number(o.payableAmount.amount);
    if (Number.isFinite(n)) total += n;
  }
  return total;
}

function volFeeValue(volume: number, fees: number) {
  return (
    <span className="plat-vol-fee plat-vol-fee--card">
      <span className="fund-amount">{formatMoneyFigure(volume)}</span>
      <span className="plat-vol-fee__sep">/</span>
      <span className="fund-amount">
        {formatMoneyFigure(fees)}
        <span className="plat-fund-currency">USD</span>
      </span>
    </span>
  );
}

function buildOrgOverviewCard(args: {
  overviewId: string;
  kind: "merchant" | "agent";
  org: OrgAccount;
  orders: PaymentOrder[];
  bills: ServiceBill[];
  from: Date;
  to: Date;
  keys: string[];
  children: Map<string, string[]>;
}): OverviewChartCard {
  const { overviewId, kind, org, orders, bills, from, to, keys, children } = args;
  const scope = subtreeIds(org.id, children);
  const vol = orgVolumeTotal(orders, from, to, scope);
  const fee = orgFeeTotal(bills, from, to, scope);
  let buckets = volumeSeries(orders, keys, { scope: "all" }, scope);
  const volume = vol || buckets.reduce((a, b) => a + b, 0);
  // Never invent a fee rate — show 0 when no paid bills in scope.
  const fees = fee;
  return {
    id: overviewId,
    category: kind === "merchant" ? "Merchants" : "Agents",
    title: org.name,
    help:
      kind === "merchant"
        ? "Settled merchant volume and paid volume fees for this merchant (and sites)."
        : "Settled merchant volume and paid volume fees for this agent subtree.",
    value: volFeeValue(volume, fees),
    compareLabel: kind === "merchant" ? "Merchant" : "Agent",
    series: buckets,
    seriesLabels: keys,
    seriesMetric: "Volume",
    formatSeriesValue: (n: number) => `${formatMoneyFigure(n)} USD`,
    chartColor: orgMetricChartColor(overviewId, kind),
    seriesStatus: "ready",
    moreHref: platformRoute(
      kind === "merchant"
        ? `accounts/merchants/${org.id}`
        : `accounts/agents/${org.id}`,
    ),
  };
}

function periodVolume(orders: PaymentOrder[], from: Date, to: Date): number {
  let total = 0;
  for (const o of orders) {
    if (!isSettledOrder(o.status)) continue;
    if (!inWindow(o.expiresAt, from, to)) continue;
    const n = Number(o.payableAmount.amount);
    if (Number.isFinite(n)) total += n;
  }
  return total;
}

function periodSettledOrderCount(
  orders: PaymentOrder[],
  from: Date,
  to: Date,
): { settled: number; total: number } {
  let settled = 0;
  let total = 0;
  for (const o of orders) {
    if (!inWindow(o.expiresAt, from, to)) continue;
    total += 1;
    if (isSettledOrder(o.status)) settled += 1;
  }
  return { settled, total };
}

function seriesTrendPct(values: number[]): number | null {
  if (values.length < 4) return null;
  const mid = Math.floor(values.length / 2);
  const a = values.slice(0, mid).reduce((s, n) => s + n, 0);
  const b = values.slice(mid).reduce((s, n) => s + n, 0);
  if (a <= 0) return b > 0 ? 100 : 0;
  return Math.round(((b - a) / a) * 100);
}

function MiniSpark({
  values,
  className = "",
}: {
  values: number[];
  className?: string;
}) {
  const gradId = useId().replace(/:/g, "");
  const geometry = useMemo(() => {
    if (values.length < 2) return null;
    const max = Math.max(...values, 1e-9);
    const w = 132;
    const h = 40;
    const pts = values.map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - (v / max) * (h - 8) - 4;
      return { x, y };
    });
    const line = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const area = [
      `0,${h}`,
      ...pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`),
      `${w},${h}`,
    ].join(" ");
    return { line, area, pts, w, h };
  }, [values]);
  if (!geometry) return null;
  const last = geometry.pts[geometry.pts.length - 1]!;
  return (
    <div
      className={`pg-kpi__spark-wrap${className ? ` ${className}` : ""}`}
      aria-hidden
    >
      <svg
        className="pg-kpi__spark"
        viewBox={`0 0 ${geometry.w} ${geometry.h}`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={`pg-spark-${gradId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.52" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.06" />
          </linearGradient>
        </defs>
        <polygon points={geometry.area} fill={`url(#pg-spark-${gradId})`} />
        <polyline
          points={geometry.line}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.65"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="nonScalingStroke"
        />
      </svg>
      {/* CSS dots stay circular — SVG circles stretch with preserveAspectRatio=none */}
      <div className="pg-kpi__spark-dots">
        {geometry.pts.map((p, i) => {
          const isLast = i === geometry.pts.length - 1;
          return (
            <span
              key={i}
              className={
                isLast ? "pg-kpi__spark-dot is-end" : "pg-kpi__spark-dot"
              }
              style={{
                left: `${(p.x / geometry.w) * 100}%`,
                top: `${(p.y / geometry.h) * 100}%`,
              }}
            />
          );
        })}
        <span
          className="pg-kpi__spark-dot-ring"
          style={{
            left: `${(last.x / geometry.w) * 100}%`,
            top: `${(last.y / geometry.h) * 100}%`,
          }}
        />
      </div>
    </div>
  );
}

type KpiAccent = "blue" | "teal" | "gold" | "violet" | "ok" | "danger" | "warn" | "slate";

function DashKpiCard({
  accent,
  label,
  value,
  hint,
  trend,
  spark,
  href,
  linkLabel,
}: {
  accent: KpiAccent;
  label: string;
  value: ReactNode;
  hint?: string;
  trend?: number | null;
  spark?: number[];
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className={`pg-kpi is-${accent}`}>
      <div className="pg-kpi__top">
        <span className="pg-kpi__icon" aria-hidden>
          <DashKpiIcon accent={accent} />
        </span>
        <span className="pg-kpi__label">{label}</span>
      </div>
      <div className="pg-kpi__metrics">
        <span className="pg-kpi__value">{value}</span>
        {trend != null ? (
          <span className={`pg-kpi__trend${trend >= 0 ? " is-up" : " is-down"}`}>
            <span className="pg-kpi__trend-pct">
              {trend >= 0 ? "↑" : "↓"} {Math.abs(trend)}%
            </span>
            <span className="pg-kpi__trend-sub">vs prior</span>
          </span>
        ) : hint ? (
          <span className="pg-kpi__hint">{hint}</span>
        ) : null}
      </div>
      {spark && spark.length > 1 ? <MiniSpark values={spark} /> : null}
      {href && linkLabel ? (
        <Link to={href} className="pg-kpi__link">
          <span className="pg-kpi__link-text">{linkLabel}</span>
          <span className="pg-kpi__link-arrow" aria-hidden>
            →
          </span>
        </Link>
      ) : null}
    </div>
  );
}

function DashKpiIcon({ accent }: { accent: KpiAccent }) {
  const p = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    "aria-hidden": true,
  };
  if (accent === "blue") {
    /* Merchants — storefront (matches MerchantsNavIcon) */
    return (
      <svg {...p} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9 12 3l9 6" />
        <path d="M5 10v10h14V10" />
        <path d="M9 20v-6h6v6" />
      </svg>
    );
  }
  if (accent === "teal") {
    /* Agents — people (matches AgentsNavIcon) */
    return (
      <svg {...p} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  }
  if (accent === "gold") {
    /* Mockup: check in circle / badge */
    return (
      <svg {...p}>
        <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.2" />
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M8.2 12.15 10.7 14.6 15.9 9.2"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (accent === "violet") {
    /* Volume — Lucide trending-up */
    return (
      <svg {...p} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
        <polyline points="16 7 22 7 22 13" />
      </svg>
    );
  }
  if (accent === "ok") {
    return (
      <svg {...p}>
        <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.2" />
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M8.2 12.15 10.7 14.6 15.9 9.2"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (accent === "danger") {
    return (
      <svg {...p}>
        <path
          d="M12 3.4 21.2 19.6H2.8L12 3.4Z"
          fill="currentColor"
          opacity="0.2"
        />
        <path
          d="M12 3.4 21.2 19.6H2.8L12 3.4Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M12 9.2v4.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="12" cy="16.6" r="1.15" fill="currentColor" />
      </svg>
    );
  }
  if (accent === "warn") {
    return (
      <svg {...p}>
        <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.2" />
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 7.4v5.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="12" cy="15.9" r="1.15" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg {...p}>
      <path
        d="M12 3.2 19.6 7.4v9.2L12 20.8 4.4 16.6V7.4L12 3.2Z"
        fill="currentColor"
        opacity="0.22"
      />
      <path
        d="M12 3.2 19.6 7.4 12 11.6 4.4 7.4 12 3.2Z"
        fill="currentColor"
        opacity="0.9"
      />
      <path
        d="M12 11.6 19.6 7.4v9.2L12 20.8V11.6Z"
        fill="currentColor"
        opacity="0.7"
      />
      <path
        d="M12 11.6 4.4 7.4v9.2L12 20.8V11.6Z"
        fill="currentColor"
        opacity="0.52"
      />
    </svg>
  );
}

function commissionMonthKeys(from: Date, to: Date): Set<string> {
  const keys = new Set<string>();
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);
  while (cursor.getTime() <= end.getTime()) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, "0");
    keys.add(`${y}-${m}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return keys;
}

function seriesFromVolumeByDay(
  days: string[],
  volumeByDay: { date: string; volume: string }[],
): number[] {
  const map = new Map<string, number>();
  let rawTotal = 0;
  for (const row of volumeByDay) {
    const n = Number(row.volume) || 0;
    rawTotal += n;
    const key = normalizeVolumeDayKey(row.date);
    map.set(key, (map.get(key) ?? 0) + n);
  }
  const series = days.map((d) => map.get(d) ?? 0);
  const mapped = series.reduce((a, n) => a + n, 0);
  // Broken/mismatched day keys: still show period volume on the last bucket.
  if (mapped === 0 && rawTotal > 0 && days.length > 0) {
    const out = days.map(() => 0);
    out[out.length - 1] = Math.round(rawTotal * 100) / 100;
    return out;
  }
  return series;
}

/** Volume fees paid in period — collected platform fees. */
function feeCollected(bills: ServiceBill[], from: Date, to: Date): number {
  let total = 0;
  for (const b of bills) {
    if (b.status !== "paid") continue;
    if (!inWindow(b.paidAt ?? b.dueAt, from, to)) continue;
    const n = Number(b.volumeFeeAmount);
    if (Number.isFinite(n)) total += n;
  }
  return total;
}

function invoiceStats(bills: ServiceBill[], from: Date, to: Date) {
  return invoiceStatsFromBills(bills, from, to);
}

function formatMoneyFigure(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** Always show two decimal places for KPI fund amounts (mockup: $89,460.00). */
function formatMoneyFigureFixed(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatUsd(n: number): string {
  return `${formatMoneyFigure(n)} USD`;
}

function formatUpdatedClock(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function PeriodUsd({ n }: { n: number }) {
  return (
    <>
      {formatMoneyFigure(n)}
      <span className="dash-chart-panel__period-unit">USD</span>
    </>
  );
}

function formatAxisUsd(n: number): string {
  return formatAxisNumber(n, true);
}

function CardHelp({ text }: { text: string }) {
  return (
    <ChartHelpButton text={text} label="About this card" openOnHover />
  );
}

function AccountRows({
  title,
  slice,
}: {
  title: string;
  slice: AccountSlice;
}) {
  return (
    <div className="plat-stat-block">
      <p className="plat-stat-block__title">{title}</p>
      <div className="plat-stat-triple">
        <div>
          <span className="plat-stat-k">Total</span>
          <span className="plat-stat-v">{slice.total}</span>
        </div>
        <div>
          <span className="plat-stat-k">Active</span>
          <span className="plat-stat-v">{slice.active}</span>
        </div>
        <div>
          <span className="plat-stat-k">Pause</span>
          <span className="plat-stat-v">{slice.pause}</span>
        </div>
      </div>
    </div>
  );
}

function MetricLines({
  rows,
}: {
  rows: { label: string; value: ReactNode }[];
}) {
  return (
    <ul className="plat-metric-lines">
      {rows.map((row) => (
        <li key={row.label} className="plat-metric-line">
          <span className="plat-metric-line__label">{row.label}</span>
          <span className="plat-metric-line__value">{row.value}</span>
        </li>
      ))}
    </ul>
  );
}

function DashOnboardMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={`pg-dash__onboard-wrap${open ? " is-open" : ""}`}
    >
      <button
        type="button"
        className="pg-dash__onboard"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <svg
          className="pg-dash__onboard-icon"
          viewBox="0 0 24 24"
          width="15"
          height="15"
          fill="none"
          aria-hidden
        >
          <path
            d="M12 5v14M5 12h14"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        Onboard
        <svg
          className="pg-dash__onboard-chevron"
          viewBox="0 0 10 6"
          width="10"
          height="6"
          fill="none"
          aria-hidden
        >
          <path
            d="M1 1l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open ? (
        <ul id={menuId} className="pg-dash__onboard-menu" role="menu">
          <li role="none">
            <Link
              role="menuitem"
              className="pg-dash__onboard-option"
              to={platformRoute("agents/new")}
              onClick={() => setOpen(false)}
            >
              Onboard agent
            </Link>
          </li>
          <li role="none">
            <Link
              role="menuitem"
              className="pg-dash__onboard-option"
              to={platformRoute("merchants/new")}
              onClick={() => setOpen(false)}
            >
              Onboard merchant
            </Link>
          </li>
        </ul>
      ) : null}
    </div>
  );
}

export function DashboardPage({ session }: Props) {
  const isViewer = useMemo(() => sessionIsPlatformViewerOnly(session), [session]);

  const [period, setPeriod] = useState<PeriodId | "custom">("7d");
  const [startDate, setStartDate] = useState(() =>
    toDateInputValue(periodWindow("7d").from),
  );
  const [endDate, setEndDate] = useState(() => toDateInputValue(periodWindow("7d").to));
  const [loading, setLoading] = useState(
    () => peekPlatformOrgs() == null && peekPlatformOrders() == null,
  );
  const [hasLoaded, setHasLoaded] = useState(
    () => peekPlatformOrgs() != null || peekPlatformOrders() != null,
  );
  const loadGen = useRef(0);
  const initialLoad = useRef(true);
  const lastFetchAt = useRef(0);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [pairsReloadToken, setPairsReloadToken] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const dismissError = useCallback(() => setError(null), []);
  const [stats, setStats] = useState<OverviewStats>(EMPTY_STATS);
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [bills, setBills] = useState<ServiceBill[]>([]);
  const [orgs, setOrgs] = useState<OrgAccount[]>([]);
  const [periodDayKeys, setPeriodDayKeys] = useState<string[]>([]);
  const [summaryVolumeByDay, setSummaryVolumeByDay] = useState<
    { date: string; volume: string }[]
  >([]);
  /** Total-scope chart waits for SQL volumeByDay so we don't flash orders→SQL. */
  const [sqlVolumeReady, setSqlVolumeReady] = useState(false);
  const heldVolumeChartRef = useRef<{
    series: number[];
    dayLabels: string[];
    chartPeriodTotal: number;
  } | null>(null);
  const [volumeScope, setVolumeScope] = useState<VolumeScope>("total");
  const [volumeSelection, setVolumeSelection] = useState<VolumeSelection | null>(null);
  const [volumeMaximized, setVolumeMaximized] = useState(false);
  const [volumeZoomed, setVolumeZoomed] = useState(false);
  const [volumeFsZoomed, setVolumeFsZoomed] = useState(false);
  const volumeZoomApiRef = useRef<VolumeChartZoomApi | null>(null);
  const volumeFsZoomApiRef = useRef<VolumeChartZoomApi | null>(null);
  const [overviewIds, setOverviewIds] = useState<string[]>(() => loadOverviewIds());
  const [addChartsOpen, setAddChartsOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const chartPanelRef = useRef<HTMLDivElement>(null);
  const healthCardRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const chartPanel = chartPanelRef.current;
    const healthCard = healthCardRef.current;
    if (!chartPanel || !healthCard) return;

    const mq = window.matchMedia("(max-width: 1100px)");

    const syncChartHeight = () => {
      if (mq.matches) {
        chartPanel.style.height = "";
        return;
      }
      chartPanel.style.height = `${healthCard.getBoundingClientRect().height}px`;
    };

    syncChartHeight();
    const observer = new ResizeObserver(syncChartHeight);
    observer.observe(healthCard);
    mq.addEventListener("change", syncChartHeight);
    window.addEventListener("resize", syncChartHeight);

    return () => {
      observer.disconnect();
      mq.removeEventListener("change", syncChartHeight);
      window.removeEventListener("resize", syncChartHeight);
      chartPanel.style.height = "";
    };
  }, [loading]);

  const onPeriodSelect = useCallback((id: PeriodId) => {
    const { from, to } = periodWindow(id);
    setPeriod(id);
    setStartDate(toDateInputValue(from));
    setEndDate(toDateInputValue(to));
  }, []);

  const onStartDateChange = useCallback((value: string) => {
    if (!value) return;
    setPeriod("custom");
    setStartDate(value);
    setEndDate((prev) => (prev && value > prev ? value : prev));
  }, []);

  const onEndDateChange = useCallback((value: string) => {
    if (!value) return;
    setPeriod("custom");
    setEndDate(value);
    setStartDate((prev) => (prev && value < prev ? value : prev));
  }, []);

  const load = useCallback(async (opts?: { force?: boolean }) => {
    if (!startDate || !endDate) return;
    const gen = ++loadGen.current;
    const force = Boolean(opts?.force);
    setError(null);
    const from = parseDateInput(startDate, false);
    const to = parseDateInput(endDate, true);
    const dayKeys = buildDayKeys(from, to);

    const applyCore = (
      nextOrgs: OrgAccount[],
      nextOrders: PaymentOrder[],
      nextBills: ServiceBill[],
    ) => {
      const children = buildChildrenMap(nextOrgs);
      const leaves = activeOrgIds(nextOrders, from, to);
      const pausedOrgIds = pausedOrgIdsFromOrgs(nextOrgs);
      const invoices = invoiceStats(nextBills, from, to);
      setStats((prev) => ({
        merchants: accountSlice(
          nextOrgs,
          isMerchantType,
          leaves,
          children,
          pausedOrgIds,
        ),
        agents: accountSlice(
          nextOrgs,
          isAgentType,
          leaves,
          children,
          pausedOrgIds,
        ),
        newMerchants: prev.newMerchants,
        newAgents: prev.newAgents,
        newCashiers: prev.newCashiers,
        invoicesIssued: invoices.issued,
        invoicesPaid: invoices.paid,
        invoicesOverdue: invoices.overdue,
        volume: periodVolume(nextOrders, from, to),
        fees: feeAccruedFromBills(nextBills, from, to),
        collected: feeCollected(nextBills, from, to),
        anomalies: prev.anomalies,
        commissionOwed: prev.commissionOwed,
        commissionPaid: prev.commissionPaid,
      }));
      setOrders(nextOrders);
      setBills(nextBills);
      setOrgs(nextOrgs);
      setPeriodDayKeys(dayKeys);
    };

    // Freeze Total chart until this fetch's summary arrives (avoids orders→SQL flash).
    setSqlVolumeReady(false);

    const cachedOrgs = peekPlatformOrgs();
    const cachedBills = peekPlatformServiceBills();
    const cachedOrders = peekPlatformOrders();
    const hadCache = Boolean(cachedOrgs || cachedOrders);
    if (hadCache) {
      applyCore(cachedOrgs ?? [], cachedOrders ?? [], cachedBills ?? []);
      setHasLoaded(true);
    }

    if (initialLoad.current) {
      if (!hadCache) setLoading(true);
      initialLoad.current = false;
    } else {
      setLoading(true);
    }

    const fetchOpts = force ? { force: true as const } : undefined;
    const orgsPromise = getPlatformOrgs(fetchOpts);
    const ordersPromise = getPlatformOrders(fetchOpts);
    const billsPromise = getPlatformServiceBills(fetchOpts).catch(
      () => [] as ServiceBill[],
    );
    const summaryPromise = getPlatformDashboardSummary(
      from.toISOString(),
      to.toISOString(),
    ).catch(() => null);
    const commissionsPromise = listCommissionPayouts({ payer: "platform" }).catch(
      () => [],
    );

    try {
      const [nextOrgs, nextOrders, nextBills, summary, commissionRows] =
        await Promise.all([
          orgsPromise,
          ordersPromise,
          billsPromise,
          summaryPromise,
          commissionsPromise,
        ]);
      if (gen !== loadGen.current) return;
      applyCore(nextOrgs, nextOrders, nextBills);
      setHasLoaded(true);
      setLoading(false);

      const monthKeys = commissionMonthKeys(from, to);
      let commissionOwed = 0;
      let commissionPaid = 0;
      for (const row of commissionRows) {
        if (!monthKeys.has(row.periodKey)) continue;
        const amt = Number(row.commissionAmount) || 0;
        if (
          row.payoutStatus === "issued" ||
          row.payoutStatus === "ready" ||
          row.payoutStatus === "verifying"
        ) {
          commissionOwed += amt;
        } else if (
          row.payoutStatus === "paid" ||
          row.payoutStatus === "settled"
        ) {
          commissionPaid += amt;
        }
      }
      commissionOwed = Math.round(commissionOwed * 100) / 100;
      commissionPaid = Math.round(commissionPaid * 100) / 100;

      if (summary) {
        setSummaryVolumeByDay(summary.orders.volumeByDay ?? []);
        setStats((prev) => ({
          ...prev,
          newMerchants: summary.signups.newMerchants,
          newAgents: summary.signups.newAgents,
          newCashiers: summary.signups.newCashiers,
          volume:
            Number(summary.orders.periodVolume) ||
            periodVolume(nextOrders, from, to),
          anomalies: summary.orders.anomalies?.length ?? 0,
          commissionOwed,
          commissionPaid,
        }));
      } else {
        setSummaryVolumeByDay([]);
        setStats((prev) => ({
          ...prev,
          commissionOwed,
          commissionPaid,
          anomalies: nextOrders.filter((o) => o.status === "payment_anomaly")
            .length,
        }));
      }
      setSqlVolumeReady(true);
      const now = Date.now();
      lastFetchAt.current = now;
      setUpdatedAt(now);
    } catch (err) {
      if (gen !== loadGen.current) return;
      const text =
        err instanceof ApiError
          ? err.code === "rate_limited"
            ? "Too many requests — wait a moment and retry."
            : err.message
          : "Failed to load dashboard";
      setError(text);
      setSqlVolumeReady(true);
    } finally {
      if (gen === loadGen.current) {
        setLoading(false);
        setHasLoaded(true);
      }
    }
  }, [startDate, endDate]);

  const softRevalidateLiveSlices = useCallback(
    async (slices: DashboardLiveSlice[]) => {
      if (!startDate || !endDate) return;
      const from = parseDateInput(startDate, false);
      const to = parseDateInput(endDate, true);
      const needVolume = slices.includes("volume");
      const needAnomalies = slices.includes("anomalies");
      const needBills = slices.includes("serviceBills");
      const needOrgs = slices.includes("orgs");
      const needCommissions = slices.includes("commissions");
      const needNetworks = slices.includes("networks");

      try {
        if (needVolume || needAnomalies) {
          const summary = await getPlatformDashboardSummary(
            from.toISOString(),
            to.toISOString(),
          );
          if (needVolume) {
            setSummaryVolumeByDay(summary.orders.volumeByDay ?? []);
            setSqlVolumeReady(true);
          }
          setStats((prev) => ({
            ...prev,
            ...(needVolume
              ? {
                  volume:
                    Number(summary.orders.periodVolume) || prev.volume,
                }
              : {}),
            ...(needAnomalies
              ? {
                  anomalies:
                    summary.orders.anomalies?.length ?? prev.anomalies,
                }
              : {}),
          }));
        }

        if (needBills) {
          const nextBills = await getPlatformServiceBills({ force: true });
          setBills(nextBills);
          const invoices = invoiceStats(nextBills, from, to);
          setStats((prev) => ({
            ...prev,
            invoicesIssued: invoices.issued,
            invoicesPaid: invoices.paid,
            invoicesOverdue: invoices.overdue,
            fees: feeAccruedFromBills(nextBills, from, to),
            collected: feeCollected(nextBills, from, to),
          }));
        }

        if (needOrgs) {
          const nextOrgs = await getPlatformOrgs({ force: true });
          setOrgs(nextOrgs);
          const children = buildChildrenMap(nextOrgs);
          const leaves = activeOrgIds(orders, from, to);
          const pausedOrgIds = pausedOrgIdsFromOrgs(nextOrgs);
          setStats((prev) => ({
            ...prev,
            merchants: accountSlice(
              nextOrgs,
              isMerchantType,
              leaves,
              children,
              pausedOrgIds,
            ),
            agents: accountSlice(
              nextOrgs,
              isAgentType,
              leaves,
              children,
              pausedOrgIds,
            ),
          }));
          try {
            const summary = await getPlatformDashboardSummary(
              from.toISOString(),
              to.toISOString(),
            );
            setStats((prev) => ({
              ...prev,
              newMerchants: summary.signups.newMerchants,
              newAgents: summary.signups.newAgents,
              newCashiers: summary.signups.newCashiers,
            }));
          } catch {
            // keep prior signup counts
          }
        }

        if (needCommissions) {
          const commissionRows = await listCommissionPayouts({
            payer: "platform",
          }).catch(() => []);
          const monthKeys = commissionMonthKeys(from, to);
          let commissionOwed = 0;
          let commissionPaid = 0;
          for (const row of commissionRows) {
            if (!monthKeys.has(row.periodKey)) continue;
            const amt = Number(row.commissionAmount) || 0;
            if (
              row.payoutStatus === "issued" ||
              row.payoutStatus === "ready" ||
              row.payoutStatus === "verifying"
            ) {
              commissionOwed += amt;
            } else if (
              row.payoutStatus === "paid" ||
              row.payoutStatus === "settled"
            ) {
              commissionPaid += amt;
            }
          }
          setStats((prev) => ({
            ...prev,
            commissionOwed: Math.round(commissionOwed * 100) / 100,
            commissionPaid: Math.round(commissionPaid * 100) / 100,
          }));
        }

        if (needNetworks) {
          setPairsReloadToken((n) => n + 1);
        }

        setUpdatedAt(Date.now());
      } catch {
        // Keep last good SWR snapshot.
      }
    },
    [startDate, endDate, orders],
  );

  useDashboardLiveEvents({
    enabled: hasLoaded,
    onSlices: (slices) => {
      void softRevalidateLiveSlices(slices);
    },
  });

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastFetchAt.current < 30_000) return;
      void load({ force: true });
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [load]);

  const refreshDashboard = useCallback(() => {
    setPairsReloadToken((n) => n + 1);
    void load({ force: true });
  }, [load]);

  const periodLabel =
    period === "custom"
      ? `${startDate} – ${endDate}`
      : (PERIOD_OPTIONS.find((p) => p.id === period)?.label ?? period);

  const chartWindow = useMemo(() => {
    const from = parseDateInput(startDate, false);
    const to = parseDateInput(endDate, true);
    const keys = periodDayKeys.length ? periodDayKeys : buildDayKeys(from, to);
    return { from, to, keys };
  }, [startDate, endDate, periodDayKeys]);

  const volumeFilter = useMemo(
    () => volumeFilterFromSelection(volumeScope, volumeSelection),
    [volumeScope, volumeSelection],
  );

  const onVolumeSelect = useCallback((selection: VolumeSelection) => {
    setVolumeSelection((prev) => {
      if (prev && isSameSelection(prev, selection)) {
        setVolumeScope("total");
        return null;
      }
      setVolumeScope("asset");
      return selection;
    });
  }, []);

  const onVolumeScopeChange = useCallback((scope: VolumeScope) => {
    setVolumeScope(scope);
  }, []);

  const chartTitle = chartTitleFromFilter(volumeFilter);

  const { series, dayLabels, chartPeriodTotal } = useMemo(() => {
    const { from, to, keys } = chartWindow;
    if (volumeFilter.scope === "all") {
      if (!sqlVolumeReady) {
        const held = heldVolumeChartRef.current;
        if (held && held.dayLabels.length > 0) return held;
        const sqlKeys = buildUtcDayKeys(from, to);
        return {
          series: sqlKeys.map(() => 0),
          dayLabels: sqlKeys,
          chartPeriodTotal: 0,
        };
      }
      if (summaryVolumeByDay.length > 0) {
        const sqlKeys = buildUtcDayKeys(from, to);
        const next = {
          series: seriesFromVolumeByDay(sqlKeys, summaryVolumeByDay),
          dayLabels: sqlKeys,
          chartPeriodTotal: stats.volume,
        };
        heldVolumeChartRef.current = next;
        return next;
      }
    }
    const next = {
      series: volumeSeries(orders, keys, volumeFilter),
      dayLabels: keys,
      chartPeriodTotal: filteredVolumeTotal(orders, from, to, volumeFilter),
    };
    if (volumeFilter.scope === "all") heldVolumeChartRef.current = next;
    return next;
  }, [
    orders,
    chartWindow,
    volumeFilter,
    summaryVolumeByDay,
    stats.volume,
    sqlVolumeReady,
  ]);

  const baseChartCatalog: OverviewChartCard[] = useMemo(() => {
    const { keys } = chartWindow;
    const labels = keys.length ? keys : dayLabels;
    const money = (n: number) => (
      <span className="fund-amount">
        {formatMoneyFigure(n)}
        <span className="plat-fund-currency">USD</span>
      </span>
    );
    const fmtMoney = (n: number) => `${formatMoneyFigure(n)} USD`;
    const fmtCount = (n: number) =>
      Math.round(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
    const accountTotal = stats.merchants.total + stats.agents.total;
    // No synthetic sparklines — empty series until real history exists.
    const emptySeries = keys.map(() => 0);

    const base: OverviewChartCard[] = [
      {
        id: "invoices",
        category: "Platform",
        title: "Invoices",
        help: "Service bills issued / paid / overdue in the selected period.",
        value: stats.invoicesIssued,
        compareLabel: `${stats.invoicesPaid} paid · ${stats.invoicesOverdue} overdue`,
        series: emptySeries,
        seriesLabels: labels,
        seriesMetric: "Invoices",
        formatSeriesValue: fmtCount,
        chartColor: METRIC_CHART_COLORS.invoices,
        seriesStatus: "ready",
        moreHref: platformRoute("service-bills"),
      },
      {
        id: "fees",
        category: "Platform",
        title: "Fees",
        help: "Platform volume fees billed in the period. Collected is the paid subset.",
        value: money(stats.fees),
        compareLabel: `${formatMoneyFigure(stats.collected)} collected · ${periodLabel}`,
        series: emptySeries,
        seriesLabels: labels,
        seriesMetric: "Fees",
        formatSeriesValue: fmtMoney,
        chartColor: METRIC_CHART_COLORS.fees,
        seriesStatus: "ready",
        moreHref: platformRoute("service-bills"),
      },
      {
        id: "accounts",
        category: "Platform",
        title: "Account count",
        help: "Merchants and agents on the platform.",
        value: accountTotal,
        compareLabel: `${stats.merchants.total} merchants · ${stats.agents.total} agents`,
        series: emptySeries,
        seriesLabels: labels,
        seriesMetric: "Accounts",
        formatSeriesValue: fmtCount,
        chartColor: METRIC_CHART_COLORS.accounts,
        seriesStatus: "ready",
      },
    ];

    return base;
  }, [chartWindow, dayLabels, stats, periodLabel]);

  const [orgChartCards, setOrgChartCards] = useState<OverviewChartCard[]>([]);
  useEffect(() => {
    const orgIds = overviewIds.filter(isOrgOverviewId);
    if (orgIds.length === 0 || orgs.length === 0) {
      setOrgChartCards([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      if (cancelled) return;
      const { from, to, keys } = chartWindow;
      const labels = keys.length ? keys : dayLabels;
      const children = buildChildrenMap(orgs);
      const cards: OverviewChartCard[] = [];
      for (const id of orgIds) {
        const parsed = parseOrgOverviewId(id);
        if (!parsed) continue;
        const org = orgs.find((o) => o.id === parsed.orgId);
        if (!org) continue;
        cards.push(
          buildOrgOverviewCard({
            overviewId: id,
            kind: parsed.kind,
            org,
            orders,
            bills,
            from,
            to,
            keys: labels,
            children,
          }),
        );
      }
      setOrgChartCards(cards);
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [overviewIds, orgs, orders, bills, chartWindow, dayLabels]);

  const chartCatalog = useMemo(
    () => [...baseChartCatalog, ...orgChartCards],
    [baseChartCatalog, orgChartCards],
  );

  const platformCards = useMemo(
    () => chartCatalog.filter((c) => !isOrgOverviewId(c.id)),
    [chartCatalog],
  );

  const resolveOrgCard = useCallback(
    async (overviewId: string): Promise<OverviewChartCard> => {
      // Yield so the pending mark paints before heavy series work.
      await new Promise<void>((r) => setTimeout(r, 0));
      const parsed = parseOrgOverviewId(overviewId);
      if (!parsed) throw new Error("Invalid overview id");
      const org = orgs.find((o) => o.id === parsed.orgId);
      if (!org) throw new Error("Org not found");
      const { from, to, keys } = chartWindow;
      const labels = keys.length ? keys : dayLabels;
      return buildOrgOverviewCard({
        overviewId,
        kind: parsed.kind,
        org,
        orders,
        bills,
        from,
        to,
        keys: labels,
        children: buildChildrenMap(orgs),
      });
    },
    [orgs, orders, bills, chartWindow, dayLabels],
  );

  const merchantPickOptions = useMemo(
    () =>
      orgs
        .filter((o) => o.type === "merchant" || o.type === "merchant_site")
        .map((o) => ({ id: o.id, name: o.name, kind: "merchant" as const }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [orgs],
  );

  const agentPickOptions = useMemo(
    () =>
      orgs
        .filter((o) => o.type === "agent" || o.type === "agent_sub")
        .map((o) => ({ id: o.id, name: o.name, kind: "agent" as const }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [orgs],
  );

  const visibleCards = useMemo(() => {
    const map = new Map(chartCatalog.map((c) => [c.id, c]));
    return overviewIds.map((id) => map.get(id)).filter(Boolean) as OverviewChartCard[];
  }, [chartCatalog, overviewIds]);

  const applyOverviewIds = useCallback((ids: string[]) => {
    setOverviewIds(ids);
    try {
      localStorage.setItem(OVERVIEW_STORAGE_KEY, JSON.stringify(ids));
    } catch {
      /* ignore quota */
    }
    setAddChartsOpen(false);
  }, []);

  const persistOverviewIds = useCallback((ids: string[]) => {
    setOverviewIds(ids);
    try {
      localStorage.setItem(OVERVIEW_STORAGE_KEY, JSON.stringify(ids));
    } catch {
      /* ignore quota */
    }
  }, []);

  const removeOverviewCard = useCallback(
    (id: string) => {
      persistOverviewIds(overviewIds.filter((x) => x !== id));
    },
    [overviewIds, persistOverviewIds],
  );

  const periodControls = (
    <div className="pg-dash__period" aria-label="Period">
      <div className="pg-dash__period-pills" role="group" aria-label="Quick periods">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`pg-dash__period-pill${period === opt.id ? " is-active" : ""}`}
            onClick={() => onPeriodSelect(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="pg-dash__period-dates" aria-label="Date range">
        <label className="pg-dash__period-date">
          <span className="sr-only">Start</span>
          <input
            type="date"
            value={startDate}
            max={endDate || undefined}
            onChange={(e) => onStartDateChange(e.target.value)}
            onWheel={(e) => e.currentTarget.blur()}
          />
        </label>
        <span className="pg-dash__period-sep" aria-hidden>
          –
        </span>
        <label className="pg-dash__period-date">
          <span className="sr-only">End</span>
          <input
            type="date"
            value={endDate}
            min={startDate || undefined}
            onChange={(e) => onEndDateChange(e.target.value)}
            onWheel={(e) => e.currentTarget.blur()}
          />
        </label>
      </div>
      <button
        type="button"
        className="pg-dash__period-refresh"
        onClick={refreshDashboard}
        disabled={loading}
        aria-label="Refresh dashboard"
        title={
          updatedAt
            ? `Updated ${formatUpdatedClock(updatedAt)}`
            : "Refresh dashboard"
        }
      >
        {loading && hasLoaded ? "…" : "↻"}
      </button>
    </div>
  );

  const welcomeName =
    session.displayName?.trim() ||
    session.email.split("@")[0] ||
    "Admin";

  const orderCounts = useMemo(
    () =>
      periodSettledOrderCount(orders, chartWindow.from, chartWindow.to),
    [orders, chartWindow.from, chartWindow.to],
  );

  const volumeTrend = useMemo(() => seriesTrendPct(series), [series]);

  const successRate =
    orderCounts.total > 0
      ? Math.round((orderCounts.settled / orderCounts.total) * 1000) / 10
      : 100;

  const sparkSeed = useMemo(() => {
    if (series.length > 1) return series;
    return [2, 3, 2.4, 4, 3.6, 5, 4.2, 6];
  }, [series]);

  if (loading && !hasLoaded) {
    return <PagePending />;
  }

  return (
    <div
      className={`dash-page plat-dash pg-dash${loading ? " is-period-refresh" : ""}`}
      aria-busy={loading}
    >
      <AuthToast message={error} tone="error" onDismiss={dismissError} />
      {isViewer ? (
        <div className="alert-card tone-info">
          <strong>READ-ONLY</strong>
          <p>Viewer role — mutate actions are hidden.</p>
        </div>
      ) : null}

      <header className="pg-dash__hero">
        <div className="pg-dash__hero-copy">
          <h1 className="pg-dash__welcome">Hello, {welcomeName}!</h1>
          <p className="pg-dash__lede">
            Here’s what’s happening with your payment ecosystem today.
          </p>
        </div>
        <div className="pg-dash__hero-actions">
          {periodControls}
          {!isViewer ? <DashOnboardMenu /> : null}
        </div>
      </header>

      <div className="pg-dash__kpi-row">
        <DashKpiCard
          accent="blue"
          label="Total Merchants"
          value={stats.merchants.total.toLocaleString()}
          hint={
            stats.newMerchants > 0
              ? `+${stats.newMerchants} new in period`
              : `${stats.merchants.active} active`
          }
          spark={sparkSeed.map((v, i) => v * (0.7 + ((i * 17) % 5) * 0.08))}
          href={platformRoute("accounts/merchants")}
          linkLabel="View Merchants"
        />
        <DashKpiCard
          accent="teal"
          label="Total Agents"
          value={stats.agents.total.toLocaleString()}
          hint={
            stats.newAgents > 0
              ? `+${stats.newAgents} new in period`
              : `${stats.agents.active} active`
          }
          spark={sparkSeed.map((v, i) => v * (0.85 + ((i * 13) % 4) * 0.06))}
          href={platformRoute("accounts/agents")}
          linkLabel="View Agents"
        />
        <DashKpiCard
          accent="gold"
          label="Total Transactions"
          value={orderCounts.settled.toLocaleString()}
          trend={volumeTrend}
          spark={sparkSeed}
          href={platformRoute("compliance")}
          linkLabel="View Transactions"
        />
        <DashKpiCard
          accent="violet"
          label="Total Volume"
          value={
            <span className="pg-kpi__money">
              ${formatMoneyFigureFixed(stats.volume)}
            </span>
          }
          trend={volumeTrend}
          spark={series.length > 1 ? series : sparkSeed}
          href={platformRoute("service-bills")}
          linkLabel="View Volume"
        />
        <div className="pg-feature" aria-label="Platform fees collected">
          <div className="pg-feature__top">
            <span className="pg-feature__icon" aria-hidden>
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <path d="M2 10h20" />
                <path d="M6 15h4" />
              </svg>
            </span>
            <p className="pg-feature__kicker">Platform fees</p>
          </div>
          <p className="pg-feature__value">
            ${formatMoneyFigureFixed(stats.collected)}
          </p>
          <p className="pg-feature__label">
            from invoices · {periodLabel}
          </p>
          <p className="pg-feature__sub">
            of ${formatMoneyFigureFixed(stats.fees)} billed
          </p>
          <Link
            to={platformRoute("service-bills")}
            className="pg-feature__link"
          >
            <span className="pg-feature__link-text">View Volume</span>
            <span className="pg-feature__link-arrow" aria-hidden>
              →
            </span>
          </Link>
          <img
            className="pg-feature__globe"
            src="/brand/growth-chart.png"
            alt=""
            width={168}
            height={168}
            draggable={false}
          />
        </div>
      </div>

      <div className="dash-split pg-dash__split">
        <div
          ref={chartPanelRef}
          className="panel dash-chart-panel glass-tone-slate pg-chart-panel"
        >
          <div className="dash-chart-panel__head">
            <div className="dash-chart-panel__title-row">
              <div className="pg-chart-panel__heading">
                <h2>Transaction Volume</h2>
                <p>Total successful transaction volume over time.</p>
              </div>
              <div className="dash-chart-panel__filters">
                <VolumeScopeToggle
                  scope={volumeScope}
                  selection={volumeSelection}
                  onScopeChange={onVolumeScopeChange}
                />
              </div>
              <div className="dash-chart-panel__title-main">
                <p className="dash-chart-panel__period-total" aria-label="Period total volume">
                  <span className="dash-chart-panel__period-value">
                    <PeriodUsd n={chartPeriodTotal} />
                  </span>
                </p>
              </div>
              <div className="dash-chart-panel__tools">
                <div className="volume-chart__zoom-bar volume-chart__zoom-bar--tools">
                  {volumeZoomed ? (
                    <button
                      type="button"
                      className="volume-chart__zoom-reset"
                      onClick={() => volumeZoomApiRef.current?.reset()}
                    >
                      Reset
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="volume-chart__zoom-btn"
                    aria-label="Zoom out"
                    title="Zoom out"
                    onClick={() => volumeZoomApiRef.current?.zoomOut()}
                  >
                    −
                  </button>
                  <button
                    type="button"
                    className="volume-chart__zoom-btn"
                    aria-label="Zoom in"
                    title="Zoom in"
                    onClick={() => volumeZoomApiRef.current?.zoomIn()}
                  >
                    +
                  </button>
                </div>
                <ChartHelpButton label="Volume chart help" />
                <ChartMaximizeButton
                  label="Maximize Volume chart"
                  onClick={() => setVolumeMaximized(true)}
                />
              </div>
            </div>
          </div>
          <VolumeChart
            values={series}
            labels={dayLabels}
            showZoomBar={false}
            onZoomedChange={setVolumeZoomed}
            zoomApiRef={volumeZoomApiRef}
          />
        </div>

        <div
          ref={healthCardRef}
          className="panel glass-tone-emerald plat-health-card pg-networks-panel"
        >
          <div className="pg-networks-panel__head">
            <div className="pg-networks-panel__title-row">
              <div className="pg-networks-panel__titles">
                <h2>Networks &amp; Assets</h2>
                <p>Live settlement rails</p>
              </div>
              <Link
                to={platformRoute("settings/networks")}
                className="pg-networks-panel__more"
              >
                More →
              </Link>
            </div>
          </div>
          <div className="plat-health-pairs">
            <AssetNetworkTables
              compact
              selection={volumeSelection}
              volumeScope={volumeScope}
              onSelect={onVolumeSelect}
              reloadToken={pairsReloadToken}
              networkIds={[
                NetworkId.Tron,
                NetworkId.Ethereum,
                NetworkId.Solana,
              ]}
            />
          </div>
        </div>
      </div>

      <div className="pg-dash__status-row">
        <DashKpiCard
          accent="ok"
          label="Successful Payments"
          value={orderCounts.settled.toLocaleString()}
          hint={`${successRate}% success rate`}
        />
        <DashKpiCard
          accent="danger"
          label="Overdue Invoices"
          value={stats.invoicesOverdue.toLocaleString()}
          hint={
            stats.invoicesOverdue > 0 ? "Needs attention" : "All clear"
          }
          href={platformRoute("service-bills")}
          linkLabel="Review bills"
        />
        <DashKpiCard
          accent="violet"
          label="Pending Payouts"
          value={stats.commissionOwed > 0 ? formatMoneyFigure(stats.commissionOwed) : "0"}
          hint={stats.commissionOwed > 0 ? "Commission owed" : "Scheduled"}
          href={platformRoute("commissions")}
          linkLabel="View payouts"
        />
        <DashKpiCard
          accent="slate"
          label="Flagged for Review"
          value={stats.anomalies.toLocaleString()}
          hint={
            stats.anomalies > 0 ? "Open anomalies" : "No action required"
          }
          href={platformRoute("compliance")}
          linkLabel="Open queue"
        />
        <div className="pg-cta">
          <GateLogoMark size={36} className="pg-cta__mark" alt="" />
          <div className="pg-cta__copy">
            <strong>Scale faster with PaymentGate</strong>
            <span>Grow agents, merchants, and settlement coverage.</span>
          </div>
          <Link className="pg-cta__btn" to={platformRoute("settings/team")}>
            Contact Sales
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>

      <ChartMaximizeOverlay
        open={volumeMaximized}
        title={chartTitle}
        onClose={() => setVolumeMaximized(false)}
        header={
          <div className="dash-chart-panel__title-row chart-maximize-overlay__title-row">
            <div className="dash-chart-panel__filters">
              <VolumeScopeToggle
                scope={volumeScope}
                selection={volumeSelection}
                onScopeChange={onVolumeScopeChange}
              />
            </div>
            <div className="dash-chart-panel__title-main">
              <p className="dash-chart-panel__period-total" aria-label="Period total volume">
                <span className="dash-chart-panel__period-value">
                  <PeriodUsd n={chartPeriodTotal} />
                </span>
              </p>
            </div>
            <div className="dash-chart-panel__tools">
              <div className="volume-chart__zoom-bar volume-chart__zoom-bar--tools">
                {volumeFsZoomed ? (
                  <button
                    type="button"
                    className="volume-chart__zoom-reset"
                    onClick={() => volumeFsZoomApiRef.current?.reset()}
                  >
                    Reset
                  </button>
                ) : null}
                <button
                  type="button"
                  className="volume-chart__zoom-btn"
                  aria-label="Zoom out"
                  title="Zoom out"
                  onClick={() => volumeFsZoomApiRef.current?.zoomOut()}
                >
                  −
                </button>
                <button
                  type="button"
                  className="volume-chart__zoom-btn"
                  aria-label="Zoom in"
                  title="Zoom in"
                  onClick={() => volumeFsZoomApiRef.current?.zoomIn()}
                >
                  +
                </button>
              </div>
              <ChartHelpButton label="Volume chart help" />
              <button
                type="button"
                className="chart-maximize-overlay__close"
                aria-label="Close fullscreen chart"
                onClick={() => setVolumeMaximized(false)}
              >
                ×
              </button>
            </div>
          </div>
        }
      >
        <VolumeChart
          values={series}
          labels={dayLabels}
          size="fullscreen"
          showZoomBar={false}
          onZoomedChange={setVolumeFsZoomed}
          zoomApiRef={volumeFsZoomApiRef}
        />
      </ChartMaximizeOverlay>

      <OverviewTable
        title="Metrics"
        editMode={editMode}
        onRemoveCard={removeOverviewCard}
        onReorderCards={persistOverviewIds}
        action={
          <>
            <button
              type="button"
              className="overview-charts__btn"
              onClick={() => {
                setEditMode(false);
                setAddChartsOpen(true);
              }}
            >
              + Add
            </button>
            <button
              type="button"
              className={`overview-charts__btn${editMode ? " is-active" : ""}`}
              onClick={() => setEditMode((v) => !v)}
            >
              {editMode ? "Done" : "Edit"}
            </button>
          </>
        }
        cards={visibleCards}
      />

      <AddChartsModal
        open={addChartsOpen}
        platformCards={platformCards}
        merchants={merchantPickOptions}
        agents={agentPickOptions}
        selectedIds={overviewIds}
        resolveOrgCard={resolveOrgCard}
        onClose={() => setAddChartsOpen(false)}
        onApply={applyOverviewIds}
      />
    </div>
  );
}
