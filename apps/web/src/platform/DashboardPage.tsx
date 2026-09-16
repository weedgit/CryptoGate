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
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { AuthToast } from "../auth/AuthToast";
import { platformRoute } from "../shared/portalRouting";
import { AnimatedFundAmount } from "../shared/AnimatedFundAmount";
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
import {
  AgentsNavIcon,
  ComplianceNavIcon,
  HealthNavIcon,
  ServiceBillsNavIcon,
} from "./NavIcons";
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
    moreHref:
      kind === "merchant"
        ? platformRoute(`merchants/${org.id}`)
        : platformRoute(`agents/${org.id}`),
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

/** YYYY-MM keys covering the dashboard window (local calendar months). */
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
  const [topbarSlot, setTopbarSlot] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    setTopbarSlot(document.getElementById("platform-topbar-center"));
  }, []);

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

  const periodPortal = topbarSlot
    ? createPortal(
        <div className="plat-period-controls plat-period-controls--topbar" aria-label="Period">
          <div className="plat-period-pills plat-period-pills--topbar" role="group" aria-label="Quick periods">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`plat-period-pill${period === opt.id ? " is-active" : ""}`}
                onClick={() => onPeriodSelect(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="plat-period-dates plat-period-dates--topbar" aria-label="Date range">
            <label className="plat-period-date">
              <span className="plat-period-date__label">Start</span>
              <input
                type="date"
                value={startDate}
                max={endDate || undefined}
                onChange={(e) => onStartDateChange(e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
              />
            </label>
            <span className="plat-period-dates__sep" aria-hidden="true">
              –
            </span>
            <label className="plat-period-date">
              <span className="plat-period-date__label">End</span>
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => onEndDateChange(e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
              />
            </label>
          </div>
          {loading && hasLoaded ? (
            <span className="plat-period-refresh" role="status">
              Updating…
            </span>
          ) : updatedAt ? (
            <span
              className="plat-period-updated"
              title={new Date(updatedAt).toLocaleString()}
            >
              Updated {formatUpdatedClock(updatedAt)}
            </span>
          ) : null}
          <button
            type="button"
            className="plat-period-refresh-btn"
            onClick={refreshDashboard}
            disabled={loading}
            aria-label="Refresh dashboard"
          >
            Refresh
          </button>
        </div>,
        topbarSlot,
      )
    : null;

  if (loading && !hasLoaded) {
    return (
      <>
        {periodPortal}
        <PagePending />
      </>
    );
  }

  return (
    <div
      className={`dash-page plat-dash${loading ? " is-period-refresh" : ""}`}
      aria-busy={loading}
    >
      <AuthToast message={error} tone="error" onDismiss={dismissError} />
      {isViewer ? (
        <div className="alert-card tone-info">
          <strong>READ-ONLY</strong>
          <p>Viewer role — mutate actions are hidden.</p>
        </div>
      ) : null}

      {periodPortal}

      <div className="plat-overview-grid">
        <div className="plat-overview-card glass-tone-blue">
          <div className="plat-overview-card__head">
            <div className="plat-overview-card__title">
              <span className="plat-overview-card__icon" aria-hidden>
                <AgentsNavIcon />
              </span>
              <h2>Accounts</h2>
            </div>
            <CardHelp text="Who’s on the platform: totals, who had payment activity, and who is paused." />
          </div>
          <AccountRows title="Merchants" slice={stats.merchants} />
          <AccountRows title="Agents" slice={stats.agents} />
        </div>

        <div className="plat-overview-card glass-tone-emerald">
          <div className="plat-overview-card__head">
            <div className="plat-overview-card__title">
              <span className="plat-overview-card__icon" aria-hidden>
                <ComplianceNavIcon />
              </span>
              <h2>Attention</h2>
            </div>
            <CardHelp text="Open payment anomalies (ops queue) and platform→agent commissions for months in this period." />
          </div>
          <MetricLines
            rows={[
              {
                label: "Anomalies",
                value: (
                  <Link className="plat-metric-line__link" to={platformRoute("compliance")}>
                    {stats.anomalies}
                  </Link>
                ),
              },
              {
                label: "Owed",
                value: (
                  <Link
                    className="plat-metric-line__link"
                    to={platformRoute("commissions")}
                    aria-label={`Commission owed ${formatUsd(stats.commissionOwed)}`}
                  >
                    <span className="fund-amount">
                      {formatMoneyFigure(stats.commissionOwed)}
                      <span className="plat-fund-currency">USD</span>
                    </span>
                  </Link>
                ),
              },
              {
                label: "Paid",
                value: (
                  <Link
                    className="plat-metric-line__link"
                    to={platformRoute("commissions")}
                    aria-label={`Commission paid ${formatUsd(stats.commissionPaid)}`}
                  >
                    <span className="fund-amount">
                      {formatMoneyFigure(stats.commissionPaid)}
                      <span className="plat-fund-currency">USD</span>
                    </span>
                  </Link>
                ),
              },
            ]}
          />
        </div>

        <div className="plat-overview-card glass-tone-amber">
          <div className="plat-overview-card__head">
            <div className="plat-overview-card__title">
              <span className="plat-overview-card__icon" aria-hidden>
                <ServiceBillsNavIcon />
              </span>
              <h2>Invoices</h2>
            </div>
            <CardHelp text={`Service bills in ${periodLabel}: issued, paid, or overdue (period-scoped).`} />
          </div>
          <MetricLines
            rows={[
              { label: "Issued", value: stats.invoicesIssued },
              { label: "Paid", value: stats.invoicesPaid },
              { label: "Overdue", value: stats.invoicesOverdue },
            ]}
          />
        </div>

        <section className="plat-fund-rail" aria-label="Observed volume">
          <div className="plat-fund-rail__eyebrow">
            <div className="plat-fund-rail__eyebrow-title">
              <span className="plat-overview-card__icon" aria-hidden>
                <HealthNavIcon />
              </span>
              <span>Volume</span>
            </div>
            <CardHelp
              text={`Observed settled merchant volume in ${periodLabel} (non-custodial — funds stay in merchant wallets). Fees are volume-fee line items on service bills overlapping this range — not estimated from live volume.`}
            />
          </div>
          <div className="plat-fund-rail__primary">
            <div className="plat-fund-rail__copy">
              <p className="plat-fund-rail__pair-labels">
                <span>Observed</span>
                <span aria-hidden>/</span>
                <span>Fees</span>
              </p>
              <span className="plat-fund-rail__hint">
                Settled / fees · <span className="plat-fund-rail__hint-unit">USD</span>
              </span>
            </div>
            <p className="plat-fund-rail__pair" aria-label="Observed volume and fees in US dollars">
              <AnimatedFundAmount
                className="plat-fund-rail__total"
                value={stats.volume}
                showUnit={false}
              />
              <span className="plat-fund-rail__slash" aria-hidden>
                /
              </span>
              <AnimatedFundAmount className="plat-fund-rail__fees" value={stats.fees} />
            </p>
          </div>
          <div className="plat-fund-rail__secondary">
            <div className="plat-fund-rail__copy">
              <span className="plat-fund-rail__label">Collected</span>
              <span className="plat-fund-rail__hint">
                Paid fees · <span className="plat-fund-rail__hint-unit">USD</span>
              </span>
            </div>
            <p
              className="plat-fund-rail__collected-wrap"
              aria-label="Collected in US dollars"
            >
              <AnimatedFundAmount
                className="plat-fund-rail__collected"
                value={stats.collected}
              />
            </p>
          </div>
        </section>
      </div>

      <div className="dash-split">
        <div
          ref={chartPanelRef}
          className="panel dash-chart-panel glass-tone-slate"
        >
          <div className="dash-chart-panel__head">
            <div className="dash-chart-panel__title-row">
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
          className="panel glass-tone-emerald plat-health-card"
        >
          <div className="plat-health-pairs">
            <AssetNetworkTables
              compact
              selection={volumeSelection}
              volumeScope={volumeScope}
              onSelect={onVolumeSelect}
              reloadToken={pairsReloadToken}
            />
          </div>
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
