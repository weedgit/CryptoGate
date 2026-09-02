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
import { Link, useNavigate } from "react-router-dom";
import { agentRoute } from "../shared/portalRouting";
import { AuthToast } from "../auth/AuthToast";
import { AnimatedFundAmount } from "../shared/AnimatedFundAmount";
import { AssetNetworkTables } from "../platform/AssetNetworkTables";
import {
  VolumeChart,
  type VolumeChartZoomApi,
} from "../platform/charts/VolumeChart";
import { ChartHelpButton } from "../platform/ui/ChartHelpButton";
import { PagePending } from "../platform/ui/PlatformPending";
import {
  ChartMaximizeButton,
  ChartMaximizeOverlay,
} from "../platform/ui/ChartMaximize";
import { VolumeScopeToggle } from "../platform/ui/VolumeScopeToggle";
import {
  chartTitleFromFilter,
  isSameSelection,
  matchesVolumeFilter,
  volumeFilterFromSelection,
  type VolumeChartFilter,
  type VolumeScope,
  type VolumeSelection,
} from "../platform/volumeFilter";
import { serviceBillStatusLabel } from "../platform/serviceBillStatus";
import {
  ApiError,
  getAgentCommission,
  type OrgAccount,
  type PaymentOrder,
  type ServiceBill,
  type Session,
} from "./api";
import { getAgentOrgs, peekAgentOrgs } from "./agentOrgList";
import { getAgentOrders, peekAgentOrders } from "./agentOrdersList";
import { getAgentServiceBills, peekAgentServiceBills } from "./agentServiceBillsList";
import {
  merchantsInAgentSubtree,
  orgsInAgentSubtree,
  subAgentsInAgentSubtree,
} from "./agentSubtree";
import { primaryAgentOrgId } from "./org";
import { commissionHistoryFromBills } from "../commercial/commissionStatements";
import { DEFAULT_AGENT_COMMISSION_PERCENT } from "../platform/orgDetailSeeds";

type Props = { session: Session };

type MerchantBillStatus = "overdue" | "issued" | "paid";

type MerchantDashRow = {
  id: string;
  name: string;
  parentName: string;
  onboardedLabel: string;
  onboardedAt: number;
  status: "active" | "paused";
  billStatus: MerchantBillStatus | null;
  volume: number;
  feesPaid: number;
};

type PeriodId = "today" | "7d" | "1m";

type AccountSlice = { total: number; active: number; idle: number; pause: number };

type OverviewStats = {
  merchants: AccountSlice;
  subAgents: AccountSlice;
  invoicesIssued: number;
  invoicesPaid: number;
  invoicesOverdue: number;
  volume: number;
  fees: number;
  overdueMerchants: number;
  commissionMtd: number;
  commissionPercent: string;
};

const PERIOD_OPTIONS: { id: PeriodId; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7d" },
  { id: "1m", label: "1m" },
];

const EMPTY_STATS: OverviewStats = {
  merchants: { total: 0, active: 0, idle: 0, pause: 0 },
  subAgents: { total: 0, active: 0, idle: 0, pause: 0 },
  invoicesIssued: 0,
  invoicesPaid: 0,
  invoicesOverdue: 0,
  volume: 0,
  fees: 0,
  overdueMerchants: 0,
  commissionMtd: 0,
  commissionPercent: DEFAULT_AGENT_COMMISSION_PERCENT,
};

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
  const from = startOfDay(now);
  const days = id === "7d" ? 6 : 29;
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
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatUsd(n: number): string {
  return `${formatMoneyFigure(n)} USD`;
}

function PeriodUsd({ n }: { n: number }) {
  return (
    <>
      {formatMoneyFigure(n)}
      <span className="dash-chart-panel__period-unit">USD</span>
    </>
  );
}

function formatOnboarded(iso?: string): { label: string; at: number } {
  if (!iso) return { label: "—", at: 0 };
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return { label: "—", at: 0 };
  return {
    label: new Date(t).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    at: t,
  };
}

function resolveMerchantBillStatus(
  bills: ServiceBill[],
): MerchantBillStatus | null {
  let hasIssued = false;
  let hasPaid = false;
  for (const bill of bills) {
    if (bill.status === "overdue") return "overdue";
    if (bill.status === "issued") hasIssued = true;
    else if (bill.status === "paid") hasPaid = true;
  }
  if (hasIssued) return "issued";
  if (hasPaid) return "paid";
  return null;
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
  const agentId = useMemo(() => primaryAgentOrgId(session), [session]);

  const [period, setPeriod] = useState<PeriodId | "custom">("7d");
  const [startDate, setStartDate] = useState(() =>
    toDateInputValue(periodWindow("7d").from),
  );
  const [endDate, setEndDate] = useState(() => toDateInputValue(periodWindow("7d").to));
  const [loading, setLoading] = useState(
    () => peekAgentOrgs() == null && peekAgentOrders() == null,
  );
  const [hasLoaded, setHasLoaded] = useState(
    () => peekAgentOrgs() != null || peekAgentOrders() != null,
  );
  const loadGen = useRef(0);
  const initialLoad = useRef(true);
  const [error, setError] = useState<string | null>(null);
  const dismissError = useCallback(() => setError(null), []);
  const [stats, setStats] = useState<OverviewStats>(EMPTY_STATS);
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [bills, setBills] = useState<ServiceBill[]>([]);
  const [orgs, setOrgs] = useState<OrgAccount[]>([]);
  const [periodDayKeys, setPeriodDayKeys] = useState<string[]>([]);
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
  const navigate = useNavigate();

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
      setHasLoaded(true);
      setError(agentId ? null : "No agent membership on this session");
      return;
    }
    const gen = ++loadGen.current;
    setError(null);
    const from = parseDateInput(startDate, false);
    const to = parseDateInput(endDate, true);
    const dayKeys = buildDayKeys(from, to);

    const applyCore = (
      allOrgs: OrgAccount[],
      allOrders: PaymentOrder[],
      allBills: ServiceBill[],
      commission: { commissionPercent?: string } | null,
    ) => {
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
        invoicesIssued: invoices.issued,
        invoicesPaid: invoices.paid,
        invoicesOverdue: invoices.overdue,
        volume: periodVolume(orders, from, to),
        fees: feeCollected(bills, from, to),
        overdueMerchants: overdueOrgIds.size,
        commissionMtd: mtdRow?.commissionAmount ?? 0,
        commissionPercent: commissionPct,
      });
      setOrders(orders);
      setBills(bills);
      setOrgs(subtreeOrgs);
      setPeriodDayKeys(dayKeys);
    };

    const cachedOrgs = peekAgentOrgs();
    const cachedOrders = peekAgentOrders();
    const cachedBills = peekAgentServiceBills();
    const hadCache = Boolean(cachedOrgs || cachedOrders);
    if (hadCache) {
      applyCore(cachedOrgs ?? [], cachedOrders ?? [], cachedBills ?? [], null);
      setHasLoaded(true);
    }

    if (initialLoad.current) {
      if (!hadCache) setLoading(true);
      initialLoad.current = false;
    } else {
      setLoading(true);
    }

    try {
      const [allOrgs, allOrders, allBills, commission] = await Promise.all([
        getAgentOrgs(),
        getAgentOrders().catch(() => [] as PaymentOrder[]),
        getAgentServiceBills().catch(() => [] as ServiceBill[]),
        getAgentCommission(agentId).catch(() => null),
      ]);

      if (gen !== loadGen.current) return;

      applyCore(allOrgs, allOrders, allBills, commission);
      setHasLoaded(true);
    } catch (err) {
      if (gen !== loadGen.current) return;
      const text =
        err instanceof ApiError
          ? err.code === "rate_limited"
            ? "Too many requests — wait a moment and retry."
            : err.message
          : "Failed to load dashboard";
      setError(text);
    } finally {
      if (gen === loadGen.current) {
        setLoading(false);
        setHasLoaded(true);
      }
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

  const merchantRows = useMemo((): MerchantDashRow[] => {
    const { from, to } = chartWindow;
    const children = buildChildrenMap(orgs);
    const byId = new Map(orgs.map((o) => [o.id, o]));
    const billsByOrg = new Map<string, ServiceBill[]>();
    for (const bill of bills) {
      const list = billsByOrg.get(bill.orgId);
      if (list) list.push(bill);
      else billsByOrg.set(bill.orgId, [bill]);
    }

    const merchants = orgs.filter((o) => o.type === "merchant");
    const rows: MerchantDashRow[] = merchants.map((m) => {
      const scope = subtreeIds(m.id, children);
      let volume = 0;
      for (const o of orders) {
        if (!isSettledOrder(o.status) || !o.orgId || !scope.has(o.orgId)) {
          continue;
        }
        if (!inWindow(o.expiresAt, from, to)) continue;
        const n = Number(o.payableAmount.amount);
        if (Number.isFinite(n)) volume += n;
      }

      let feesPaid = 0;
      const merchantBills = billsByOrg.get(m.id) ?? [];
      for (const b of merchantBills) {
        if (b.status !== "paid") continue;
        if (!inWindow(b.paidAt ?? b.dueAt, from, to)) continue;
        const n = Number(b.totalAmount);
        if (Number.isFinite(n)) feesPaid += n;
      }

      const parent = m.parentId ? byId.get(m.parentId) : null;
      const onboarded = formatOnboarded(m.createdAt);
      return {
        id: m.id,
        name: m.name,
        parentName: parent?.name ?? "—",
        onboardedLabel: onboarded.label,
        onboardedAt: onboarded.at,
        status: m.status === "paused" ? "paused" : "active",
        billStatus: resolveMerchantBillStatus(merchantBills),
        volume,
        feesPaid,
      };
    });

    return rows.sort((a, b) => {
      if (b.onboardedAt !== a.onboardedAt) return b.onboardedAt - a.onboardedAt;
      return a.name.localeCompare(b.name);
    });
  }, [orgs, orders, bills, chartWindow]);

  const periodPortal = topbarSlot
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
          {loading && hasLoaded ? (
            <span className="plat-period-refresh" role="status">
              Updating…
            </span>
          ) : null}
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

      {stats.overdueMerchants > 0 ? (
        <div className="plat-dash-actions" aria-label="Quick actions">
          <Link
            className="btn-ghost"
            to={agentRoute("service-bills?status=overdue")}
          >
            Overdue bills ({stats.overdueMerchants})
          </Link>
        </div>
      ) : null}

      {periodPortal}

      <div className="plat-overview-grid">
        <div className="panel plat-overview-card glass-tone-blue">
          <div className="plat-overview-card__head">
            <h2>Accounts</h2>
            <CardHelp text="Merchants and agent (sub) accounts in your subtree: totals, payment activity, and paused." />
          </div>
          <AccountRows title="Merchants" slice={stats.merchants} />
          <AccountRows title="Agent (sub)" slice={stats.subAgents} />
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

        <div className="panel plat-overview-card glass-tone-emerald plat-commission-card">
          <div className="plat-overview-card__head">
            <h2>Commission</h2>
            <CardHelp text="Your agreed commission rate on platform fees collected from your subtree." />
          </div>
          <div
            className="plat-commission-hero"
            aria-label={`Your commission rate: ${stats.commissionPercent} percent`}
          >
            <p className="plat-commission-hero__eyebrow">Your rate</p>
            <p className="plat-commission-hero__value">
              <span className="plat-commission-hero__num">
                {stats.commissionPercent}
              </span>
              <span className="plat-commission-hero__pct" aria-hidden>
                %
              </span>
            </p>
            <p className="plat-commission-hero__hint">
              Platform fee collected
            </p>
          </div>
        </div>

        <section className="plat-fund-rail" aria-label="Funds">
          <div className="plat-fund-rail__eyebrow">
            <span>Funds</span>
            <CardHelp
              text={`Period settled volume and billed fees in USD (stables counted 1:1), plus commission MTD for ${periodLabel}.`}
            />
          </div>
          <div className="plat-fund-rail__primary">
            <div className="plat-fund-rail__copy">
              <p className="plat-fund-rail__pair-labels">
                <span>Volume</span>
                <span aria-hidden>/</span>
                <span>Fees</span>
              </p>
              <span className="plat-fund-rail__hint">
                Settled volume / billed volume fees · USD
              </span>
            </div>
            <p className="plat-fund-rail__pair" aria-label="Volume and fees in US dollars">
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
              <span className="plat-fund-rail__label">Commission</span>
              <span className="plat-fund-rail__hint">Rebate MTD · USD</span>
            </div>
            <p
              className="plat-fund-rail__collected-wrap"
              aria-label="Commission in US dollars"
            >
              <AnimatedFundAmount
                className="plat-fund-rail__collected"
                value={stats.commissionMtd}
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
                <p
                  className="dash-chart-panel__period-total"
                  aria-label="Period total volume"
                >
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
              <p
                className="dash-chart-panel__period-total"
                aria-label="Period total volume"
              >
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

      <section className="panel glass-tone-slate plat-dash-merchants">
        <div className="plat-dash-merchants__head">
          <div className="plat-overview-card__head">
            <h2>Merchants</h2>
            <CardHelp text="Subtree merchants: onboard date, bill status, and period volume / platform fees paid (commission base)." />
          </div>
          <div className="plat-dash-merchants__head-meta">
            <p className="plat-dash-merchants__meta muted">
              {merchantRows.length}{" "}
              {merchantRows.length === 1 ? "merchant" : "merchants"} ·{" "}
              {periodLabel}
            </p>
            <Link className="plat-dash-merchants__all" to={agentRoute("merchants")}>
              View all
            </Link>
          </div>
        </div>

        {merchantRows.length === 0 ? (
          <p className="muted plat-dash-merchants__empty">
            No merchants in your subtree yet.
          </p>
        ) : (
          <div className="org-agents plat-dash-merchants__table">
            <div className="org-agents__table-panel">
              <div
                className="org-agents__table-wrap"
                role="grid"
                aria-label="Merchants"
              >
                <table className="org-agents__table org-agents__table--compact">
                  <colgroup>
                    <col className="org-agents__col-num" />
                    <col className="org-agents__col-name" />
                    <col className="org-agents__col-onboarded" />
                    <col className="org-agents__col-parent" />
                    <col className="org-agents__col-volume" />
                    <col className="org-agents__col-fee" />
                    <col className="org-agents__col-bill" />
                    <col className="org-agents__col-status" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="org-agents__th-num">#</th>
                      <th>Merchant</th>
                      <th>Onboarded</th>
                      <th>Parent</th>
                      <th>Volume</th>
                      <th>Fees paid</th>
                      <th className="org-agents__th-bill">Bill</th>
                      <th className="org-agents__th-status">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {merchantRows.map((row, index) => (
                      <tr
                        key={row.id}
                        className="org-agents__row"
                        onClick={() => navigate(agentRoute(`merchants/${row.id}`))}
                        style={{
                          animationDelay: `${Math.min(index, 40) * 40}ms`,
                          cursor: "pointer",
                        }}
                      >
                        <td className="org-agents__idx">{index + 1}</td>
                        <td>
                          <span className="org-agents__name">{row.name}</span>
                        </td>
                        <td>
                          <span className="muted">{row.onboardedLabel}</span>
                        </td>
                        <td className="org-agents__td-parent">
                          <span className="org-agents__parent" title={row.parentName}>
                            {row.parentName}
                          </span>
                        </td>
                        <td>
                          <span className="fund-amount">{formatUsd(row.volume)}</span>
                        </td>
                        <td>
                          <span className="fund-amount">
                            {formatUsd(row.feesPaid)}
                          </span>
                        </td>
                        <td className="org-agents__td-bill">
                          {row.billStatus ? (
                            <span
                              className={`org-agents__bill is-${row.billStatus}${
                                row.billStatus === "overdue" ? " is-pulse" : ""
                              }`}
                            >
                              {serviceBillStatusLabel(row.billStatus)}
                            </span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td className="org-agents__td-status">
                          <span
                            className={`org-agents__status${
                              row.status === "paused" ? " is-paused" : " is-active"
                            }`}
                          >
                            {row.status === "paused" ? "Paused" : "Active"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
