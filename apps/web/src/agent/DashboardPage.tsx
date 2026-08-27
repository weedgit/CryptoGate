import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { AuthToast } from "../auth/AuthToast";
import { AssetNetworkTables } from "../platform/AssetNetworkTables";
import {
  VolumeChart,
  type VolumeChartZoomApi,
} from "../platform/DashboardPage";
import { ChartHelpButton } from "../platform/ui/ChartHelpButton";
import {
  ChartMaximizeButton,
  ChartMaximizeOverlay,
} from "../platform/ui/ChartMaximize";
import { OverviewTable, type OverviewChartCard } from "../platform/ui/OverviewTable";
import { VolumeScopeToggle } from "../platform/ui/VolumeScopeToggle";
import { METRIC_CHART_COLORS } from "../platform/ui/chartColors";
import {
  chartTitleFromFilter,
  isSameSelection,
  matchesVolumeFilter,
  volumeFilterFromSelection,
  type VolumeChartFilter,
  type VolumeScope,
  type VolumeSelection,
} from "../platform/volumeFilter";
import {
  ApiError,
  getAgentCommission,
  listAuditLog,
  listOrders,
  listOrgs,
  listServiceBills,
  type AuditLogEntry,
  type OrgAccount,
  type PaymentOrder,
  type ServiceBill,
  type Session,
} from "./api";
import {
  isOrgUnderAgent,
  merchantsInAgentSubtree,
  orgsInAgentSubtree,
  subAgentsInAgentSubtree,
} from "./agentSubtree";
import {
  primaryAgentOrgId,
  sessionCanOnboardMerchant,
  sessionIsAgentViewerOnly,
} from "./org";
import { commissionHistoryFromBills } from "../commercial/commissionStatements";
import { DEFAULT_AGENT_COMMISSION_PERCENT } from "../platform/orgDetailSeeds";

type Props = { session: Session };

type PeriodId = "today" | "yesterday" | "7d" | "15d" | "1m" | "2m";

type AccountSlice = { total: number; active: number; idle: number; pause: number };

type OverviewStats = {
  merchants: AccountSlice;
  subAgents: AccountSlice;
  newMerchants: number;
  invoicesIssued: number;
  invoicesPaid: number;
  invoicesOverdue: number;
  volume: number;
  fees: number;
  openBills: number;
  overdueMerchants: number;
  commissionMtd: number;
};

type MerchantVolumeRow = {
  orgId: string;
  name: string;
  volume: number;
};

const PERIOD_OPTIONS: { id: PeriodId; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7d", label: "7d" },
  { id: "15d", label: "15d" },
  { id: "1m", label: "1m" },
  { id: "2m", label: "2m" },
];

const EMPTY_STATS: OverviewStats = {
  merchants: { total: 0, active: 0, idle: 0, pause: 0 },
  subAgents: { total: 0, active: 0, idle: 0, pause: 0 },
  newMerchants: 0,
  invoicesIssued: 0,
  invoicesPaid: 0,
  invoicesOverdue: 0,
  volume: 0,
  fees: 0,
  openBills: 0,
  overdueMerchants: 0,
  commissionMtd: 0,
};

function isMerchantType(t: string) {
  return t === "merchant" || t === "merchant_site";
}

function isSettledOrder(status: string) {
  return status === "completed" || status === "confirmed";
}

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

function periodWindow(id: PeriodId): { from: Date; to: Date } {
  const now = new Date();
  const to = endOfDay(now);
  if (id === "today") return { from: startOfDay(now), to };
  if (id === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return { from: startOfDay(y), to: endOfDay(y) };
  }
  const from = startOfDay(now);
  const days = id === "7d" ? 6 : id === "15d" ? 14 : id === "1m" ? 29 : 59;
  from.setDate(from.getDate() - days);
  return { from, to };
}

function buildDayKeys(from: Date, to: Date): string[] {
  const keys: string[] = [];
  const cur = startOfDay(from);
  const end = startOfDay(to);
  while (cur <= end) {
    keys.push(toDateInputValue(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return keys.length ? keys : [toDateInputValue(from)];
}

function dayKey(iso: string): string | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return toDateInputValue(new Date(t));
}

function inWindow(iso: string, from: Date, to: Date): boolean {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return t >= from.getTime() && t <= to.getTime();
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
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift()!;
    for (const child of children.get(id) ?? []) {
      if (out.has(child)) continue;
      out.add(child);
      queue.push(child);
    }
  }
  return out;
}

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
  activeLeaves: Set<string>,
  children: Map<string, string[]>,
): AccountSlice {
  let active = 0;
  let pause = 0;
  let idle = 0;
  for (const org of orgs) {
    if (org.status === "paused") {
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
    else idle += 1;
  }
  return { total: orgs.length, active, idle, pause };
}

function formatMoneyFigure(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatUsd(n: number): string {
  return `$${formatMoneyFigure(n)}`;
}

function periodVolume(
  orders: PaymentOrder[],
  from: Date,
  to: Date,
  filter: VolumeChartFilter = { scope: "all" },
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

function volumeSeries(
  orders: PaymentOrder[],
  days: string[],
  filter: VolumeChartFilter = { scope: "all" },
): number[] {
  const map = new Map(days.map((d) => [d, 0]));
  for (const o of orders) {
    if (!isSettledOrder(o.status)) continue;
    if (!matchesVolumeFilter(o, filter)) continue;
    const key = dayKey(o.expiresAt);
    if (!key || !map.has(key)) continue;
    const n = Number(o.payableAmount.amount);
    if (Number.isFinite(n)) map.set(key, (map.get(key) ?? 0) + n);
  }
  return days.map((d) => map.get(d) ?? 0);
}

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
  let issued = 0;
  let paid = 0;
  let overdue = 0;
  for (const b of bills) {
    if (b.status === "void") continue;
    if (inWindow(b.dueAt, from, to) || inWindow(b.periodStart, from, to)) {
      issued += 1;
    }
    if (b.status === "paid" && inWindow(b.paidAt ?? b.dueAt, from, to)) {
      paid += 1;
    }
    if (b.status === "overdue") overdue += 1;
  }
  return { issued, paid, overdue };
}

function topMerchantsByVolume(
  merchants: OrgAccount[],
  orders: PaymentOrder[],
  from: Date,
  to: Date,
  limit = 8,
): MerchantVolumeRow[] {
  const byId = new Map(merchants.map((m) => [m.id, m]));
  const parents = merchants.filter((m) => m.type === "merchant");
  const clean = new Map<string, number>();
  for (const o of orders) {
    if (!isSettledOrder(o.status) || !o.orgId) continue;
    if (!inWindow(o.expiresAt, from, to)) continue;
    let id = o.orgId;
    const org = byId.get(id);
    if (org?.type === "merchant_site" && org.parentId) id = org.parentId;
    if (!parents.some((p) => p.id === id)) continue;
    const n = Number(o.payableAmount.amount);
    if (!Number.isFinite(n)) continue;
    clean.set(id, (clean.get(id) ?? 0) + n);
  }
  return parents
    .map((m) => ({
      orgId: m.id,
      name: m.name,
      volume: clean.get(m.id) ?? 0,
    }))
    .sort((a, b) => b.volume - a.volume)
    .slice(0, limit);
}

function CardHelp({ text }: { text: string }) {
  return (
    <span className="plat-card-help">
      <button type="button" className="plat-card-help__btn" aria-label={text}>
        ?
      </button>
      <span className="plat-card-help__tip" role="tooltip">
        {text}
      </span>
    </span>
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
      <div className="plat-stat-quad">
        <div>
          <span className="plat-stat-k">Total</span>
          <span className="plat-stat-v">{slice.total}</span>
        </div>
        <div>
          <span className="plat-stat-k">Active</span>
          <span className="plat-stat-v">{slice.active}</span>
        </div>
        <div>
          <span className="plat-stat-k">Idle</span>
          <span className="plat-stat-v">{slice.idle}</span>
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
  const isViewer = useMemo(() => sessionIsAgentViewerOnly(session), [session]);
  const canOnboard = useMemo(() => sessionCanOnboardMerchant(session), [session]);
  const agentId = useMemo(() => primaryAgentOrgId(session), [session]);

  const [period, setPeriod] = useState<PeriodId | "custom">("7d");
  const [startDate, setStartDate] = useState(() =>
    toDateInputValue(periodWindow("7d").from),
  );
  const [endDate, setEndDate] = useState(() => toDateInputValue(periodWindow("7d").to));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dismissError = useCallback(() => setError(null), []);
  const [stats, setStats] = useState<OverviewStats>(EMPTY_STATS);
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [periodDayKeys, setPeriodDayKeys] = useState<string[]>([]);
  const [topMerchants, setTopMerchants] = useState<MerchantVolumeRow[]>([]);
  const [volumeScope, setVolumeScope] = useState<VolumeScope>("total");
  const [volumeSelection, setVolumeSelection] = useState<VolumeSelection | null>(null);
  const [volumeMaximized, setVolumeMaximized] = useState(false);
  const [volumeZoomed, setVolumeZoomed] = useState(false);
  const [volumeFsZoomed, setVolumeFsZoomed] = useState(false);
  const volumeZoomApiRef = useRef<VolumeChartZoomApi | null>(null);
  const volumeFsZoomApiRef = useRef<VolumeChartZoomApi | null>(null);
  const chartPanelRef = useRef<HTMLDivElement>(null);
  const healthCardRef = useRef<HTMLDivElement>(null);
  const [topbarSlot, setTopbarSlot] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    setTopbarSlot(document.getElementById("agent-topbar-center"));
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

  const load = useCallback(async () => {
    if (!startDate || !endDate || !agentId) {
      setLoading(false);
      setError(agentId ? null : "No agent membership on this session");
      return;
    }
    setLoading(true);
    setError(null);
    const from = parseDateInput(startDate, false);
    const to = parseDateInput(endDate, true);
    const dayKeys = buildDayKeys(from, to);
    try {
      const [allOrgs, allOrders, allBills, createEvents, commission] =
        await Promise.all([
        listOrgs(),
        listOrders({ limit: 500 }).catch(() => [] as PaymentOrder[]),
        listServiceBills().catch(() => [] as ServiceBill[]),
        listAuditLog({
          action: "org_create",
          from: from.toISOString(),
          to: to.toISOString(),
          limit: 200,
        }).catch(() => [] as AuditLogEntry[]),
        getAgentCommission(agentId).catch(() => null),
      ]);

      const subtreeOrgs = orgsInAgentSubtree(agentId, allOrgs);
      const merchantRows = merchantsInAgentSubtree(agentId, allOrgs);
      const subAgentRows = subAgentsInAgentSubtree(agentId, allOrgs);
      const merchantIds = new Set(merchantRows.map((m) => m.id));
      const orders = allOrders.filter((o) => o.orgId && merchantIds.has(o.orgId));
      const bills = allBills.filter((b) => merchantIds.has(b.orgId));

      const children = buildChildrenMap(subtreeOrgs);
      const leaves = activeOrgIds(orders, from, to);
      const invoices = invoiceStats(bills, from, to);
      const overdueOrgIds = new Set(
        bills.filter((b) => b.status === "overdue").map((b) => b.orgId),
      );
      let newMerchants = 0;
      const byId = new Map(allOrgs.map((o) => [o.id, o]));
      for (const e of createEvents) {
        if (!inWindow(e.createdAt, from, to)) continue;
        const type = String(e.metadata.type ?? "");
        const orgId = e.orgId;
        if (!isMerchantType(type) || !orgId) continue;
        if (isOrgUnderAgent(orgId, agentId, allOrgs, byId)) newMerchants += 1;
      }

      const monthKey = new Date().toISOString().slice(0, 7);
      const commissionPct =
        commission?.commissionPercent?.trim() ||
        DEFAULT_AGENT_COMMISSION_PERCENT;
      const statements = commissionHistoryFromBills(
        bills,
        merchantIds,
        commissionPct,
      );
      const mtdRow =
        statements.find((r) => r.periodKey === monthKey) ?? statements[0];

      setStats({
        merchants: accountSlice(
          merchantRows.filter((m) => m.type === "merchant"),
          leaves,
          children,
        ),
        subAgents: accountSlice(subAgentRows, leaves, children),
        newMerchants,
        invoicesIssued: invoices.issued,
        invoicesPaid: invoices.paid,
        invoicesOverdue: invoices.overdue,
        volume: periodVolume(orders, from, to),
        fees: feeCollected(bills, from, to),
        openBills: bills.filter((b) => b.status === "issued" || b.status === "overdue")
          .length,
        overdueMerchants: overdueOrgIds.size,
        commissionMtd: mtdRow?.commissionAmount ?? 0,
      });
      setOrders(orders);
      setPeriodDayKeys(dayKeys);
      setTopMerchants(topMerchantsByVolume(merchantRows, orders, from, to));
    } catch (err) {
      const text =
        err instanceof ApiError
          ? err.code === "rate_limited"
            ? "Too many requests — wait a moment and retry."
            : err.message
          : "Failed to load dashboard";
      setError(text);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, agentId]);

  useEffect(() => {
    void load();
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
    const live = volumeSeries(orders, keys, volumeFilter);
    const volume = periodVolume(orders, from, to, volumeFilter);
    return {
      series: live,
      dayLabels: keys,
      chartPeriodTotal: volume,
    };
  }, [orders, chartWindow, volumeFilter]);

  const metricCards: OverviewChartCard[] = useMemo(() => {
    const { keys } = chartWindow;
    const labels = keys.length ? keys : dayLabels;
    const money = (n: number) => (
      <span className="fund-amount">
        {formatMoneyFigure(n)}
        <span className="plat-fund-currency">$</span>
      </span>
    );
    const fmtMoney = (n: number) => `$${formatMoneyFigure(n)}`;
    const fmtCount = (n: number) =>
      Math.round(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
    const feeBuckets =
      stats.volume > 0
        ? series.map((v) => (v / Math.max(stats.volume, 1)) * stats.fees)
        : keys.map(() => 0);

    return [
      {
        id: "invoices",
        category: "Subtree",
        title: "Service bills",
        help: "Service bills issued / paid in the selected period for merchants in your subtree.",
        value: stats.invoicesIssued,
        compareLabel: `${stats.invoicesPaid} paid · ${stats.invoicesOverdue} overdue`,
        series: keys.map(() => stats.invoicesIssued),
        seriesLabels: labels,
        seriesMetric: "Bills",
        formatSeriesValue: fmtCount,
        chartColor: METRIC_CHART_COLORS.invoices,
        seriesStatus: "ready",
        moreHref: "/agent/service-bills",
      },
      {
        id: "fees",
        category: "Subtree",
        title: "Platform fees",
        help: "Volume fees collected via paid service bills (not agent commission).",
        value: money(stats.fees),
        compareLabel: periodLabel,
        series: feeBuckets,
        seriesLabels: labels,
        seriesMetric: "Fees",
        formatSeriesValue: fmtMoney,
        chartColor: METRIC_CHART_COLORS.fees,
        seriesStatus: "ready",
        moreHref: "/agent/service-bills",
      },
      {
        id: "merchants",
        category: "Subtree",
        title: "Merchants",
        help: "Merchant accounts in your channel subtree.",
        value: stats.merchants.total,
        compareLabel: `${stats.subAgents.total} agent (sub) · ${stats.newMerchants} new`,
        series: keys.map((_, i) =>
          Math.max(stats.merchants.total - (keys.length - 1 - i), 0),
        ),
        seriesLabels: labels,
        seriesMetric: "Merchants",
        formatSeriesValue: fmtCount,
        chartColor: METRIC_CHART_COLORS.accounts,
        seriesStatus: "ready",
        moreHref: "/agent/merchants",
      },
      {
        id: "commission",
        category: "Subtree",
        title: "Commission MTD",
        help: "Rebate from platform fees on subtree service bills. Not taken from payer on-chain payments.",
        value: fmtMoney(stats.commissionMtd),
        compareLabel: "C10 statements",
        series: keys.map(() => stats.commissionMtd),
        seriesLabels: labels,
        seriesMetric: "Commission",
        formatSeriesValue: fmtMoney,
        chartColor: METRIC_CHART_COLORS.fees,
        seriesStatus: "ready",
        moreHref: "/agent/commissions",
      },
    ];
  }, [chartWindow, dayLabels, periodLabel, series, stats]);

  if (loading) {
    return <p className="muted">Loading agent overview…</p>;
  }

  return (
    <div className="dash-page plat-dash">
      <AuthToast message={error} tone="error" onDismiss={dismissError} />
      {isViewer ? (
        <div className="alert-card tone-info">
          <strong>READ-ONLY</strong>
          <p>Viewer role — mutate actions are hidden.</p>
        </div>
      ) : null}

      {topbarSlot
        ? createPortal(
            <div
              className="plat-period-controls plat-period-controls--topbar"
              aria-label="Period"
            >
              <div
                className="plat-period-pills plat-period-pills--topbar"
                role="group"
                aria-label="Quick periods"
              >
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
              <div
                className="plat-period-dates plat-period-dates--topbar"
                aria-label="Date range"
              >
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
            </div>,
            topbarSlot,
          )
        : null}

      <div className="plat-overview-grid">
        <div className="panel plat-overview-card glass-tone-blue">
          <div className="plat-overview-card__head">
            <h2>Accounts</h2>
            <CardHelp text="Merchants and agent (sub) accounts in your subtree: totals, payment activity, idle, and paused." />
          </div>
          <AccountRows title="Merchants" slice={stats.merchants} />
          <AccountRows title="Agent (sub)" slice={stats.subAgents} />
        </div>

        <div className="panel plat-overview-card glass-tone-emerald">
          <div className="plat-overview-card__head">
            <h2>Alerts</h2>
            <CardHelp text={`Subtree signals for ${periodLabel}.`} />
          </div>
          <MetricLines
            rows={[
              { label: "New merchants", value: stats.newMerchants },
              { label: "Open bills", value: stats.openBills },
              { label: "Overdue merchants", value: stats.overdueMerchants },
            ]}
          />
          <div className="action-row" style={{ marginTop: 14 }}>
            {canOnboard ? (
              <Link className="btn-secondary btn-inline" to="/agent/merchants/new">
                Onboard merchant
              </Link>
            ) : null}
            <Link
              className="btn-ghost btn-inline"
              to="/agent/service-bills?status=overdue"
            >
              Overdue bills
            </Link>
          </div>
        </div>

        <div className="panel plat-overview-card glass-tone-amber">
          <div className="plat-overview-card__head">
            <h2>Invoices</h2>
            <CardHelp
              text={`Service bills in ${periodLabel}: issued, paid, or overdue for merchants you manage.`}
            />
          </div>
          <MetricLines
            rows={[
              { label: "Issued", value: stats.invoicesIssued },
              { label: "Paid", value: stats.invoicesPaid },
              { label: "Overdue", value: stats.invoicesOverdue },
            ]}
          />
        </div>

        <section className="plat-fund-list" aria-label="Funds">
          <div className="plat-fund-row">
            <div className="plat-fund-row__meta">
              <span className="plat-fund-row__label">Volume</span>
              <span className="plat-fund-currency">$</span>
            </div>
            <p className="plat-fund-row__value">
              <span className="fund-amount">
                {stats.volume.toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}
              </span>
            </p>
          </div>
          <div className="plat-fund-row">
            <div className="plat-fund-row__meta">
              <span className="plat-fund-row__label">Fees</span>
              <span className="plat-fund-currency">$</span>
            </div>
            <p className="plat-fund-row__value">
              <span className="fund-amount">
                {stats.fees.toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}
              </span>
            </p>
          </div>
          <div className="plat-fund-row">
            <div className="plat-fund-row__meta">
              <span className="plat-fund-row__label">Commission</span>
              <span className="plat-fund-currency">$</span>
            </div>
            <p className="plat-fund-row__value">
              <span className="fund-amount">—</span>
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
                <p
                  className="dash-chart-panel__period-total"
                  aria-label="Period total volume"
                >
                  <span className="dash-chart-panel__period-value">
                    {formatUsd(chartPeriodTotal)}
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
            />
          </div>
          <div className="agent-top-merchants" style={{ marginTop: 16 }}>
            <div className="plat-overview-card__head">
              <h2 style={{ fontSize: 14, margin: 0 }}>Top merchants</h2>
              <CardHelp text={`Settled subtree volume by merchant in ${periodLabel}.`} />
            </div>
            {topMerchants.length === 0 ? (
              <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>
                No settled volume in this period.
              </p>
            ) : (
              <ul className="plat-metric-lines" style={{ marginTop: 10 }}>
                {topMerchants.map((row) => (
                  <li key={row.orgId} className="plat-metric-line">
                    <Link
                      className="plat-metric-line__label"
                      to={`/agent/merchants/${row.orgId}`}
                      style={{ color: "inherit", textDecoration: "none" }}
                    >
                      {row.name}
                    </Link>
                    <span className="plat-metric-line__value">
                      {formatUsd(row.volume)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
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
              <p
                className="dash-chart-panel__period-total"
                aria-label="Period total volume"
              >
                <span className="dash-chart-panel__period-value">
                  {formatUsd(chartPeriodTotal)}
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

      <OverviewTable title="Metrics" cards={metricCards} />
    </div>
  );
}
