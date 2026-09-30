import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { addDaysYmd, addMonthsYmd, zonedYmd } from "../shared/dateTime";
import { useViewerTimeZone } from "../shared/useViewerTimeZone";
import { Link } from "react-router-dom";
import { AuthToast } from "../auth/AuthToast";
import { GateLogoMark } from "../auth/GateLogoMark";
import { OrgBrandMark } from "../shared/OrgBrandMark";
import { AnimatedText } from "../shared/AnimatedText";
import { platformRoute } from "../shared/portalRouting";
import {
  useDashboardLiveEvents,
  type DashboardLiveSlice,
} from "../shared/useDashboardLiveEvents";
import {
  ApiError,
  getBackupStatus,
  getPlatformOrgs,
  peekPlatformOrgs,
  type BackupStatus,
  type OrgAccount,
  type Session,
} from "./api";
import {
  chartLabelsFor,
  getCommissionPreview,
  getDashboardKpis,
  getDashboardOrgCards,
  getDashboardRates,
  getDashboardSeries,
  peekCommissionPreview,
  peekDashboardKpis,
  peekDashboardRates,
  peekDashboardSeries,
  type DashboardKpis,
  type DashboardOrgCards,
  type DashboardQuery,
  type DashboardRates,
  type DashboardSeries,
  type DashboardSeriesMetric,
  type CommissionPreview,
} from "../shared/dashboardApi";
import { CommissionByMerchantPanel } from "./ui/CommissionByMerchantPanel";
import { formatUtcDay } from "./ui/commissionPreviewModel";
import { PagePending } from "./ui/PlatformPending";
import { DashKpiCard } from "./ui/DashKpiCard";
import { DashHeroAura, DashHeroHighlights, DashPeriodControls } from "./ui/DashHero";
import { AssetNetworkTables } from "./AssetNetworkTables";
import { AddChartsModal } from "./ui/AddChartsModal";
import { ChartHelpButton } from "./ui/ChartHelpButton";
import { VolumeFilterSelect } from "./ui/VolumeFilterSelect";
import {
  chartFilterAsset,
  chartFilterDetail,
  volumeFilterFromSelection,
  type VolumeChartFilter,
  type VolumeSelection,
} from "./volumeFilter";
import {
  ChartMaximizeButton,
  ChartMaximizeOverlay,
} from "./ui/ChartMaximize";
import { formatAxisNumber } from "./ui/chartAxis";
import { VolumeChart, type VolumeChartZoomApi } from "./charts/VolumeChart";
import { OverviewTable, type OverviewChartCard, trendFromRateSeries, trendFromSeries } from "./ui/OverviewTable";
import {
  assetRateChartColor,
  orgMetricChartColor,
} from "./ui/chartColors";
import {
} from "./org";
import { visibleRegistry, networkShortLabel } from "../shared/assetNetworks";
import { useDashboardPortal } from "./dashboardPortal";
import { usePageRefresh } from "../shared/pageRefresh";

type Props = { session: Session };

type PeriodId = "today" | "7d" | "1m" | "mtd" | "3m";

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
  /** Platform fees billed in period (subscription + volume). */
  fees: number;
  /** Platform fees paid in period (subscription + volume). */
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
  { id: "3m", label: "3m" },
];

/** Agents default to month-to-date in their own zone; commission months stay UTC (labelled). */
const AGENT_PERIOD_OPTIONS: { id: PeriodId; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7d" },
  { id: "mtd", label: "MTD" },
  { id: "3m", label: "3m" },
];

function overviewTrendLabel(period: string): string {
  if (period === "7d") return "vs previous 7d";
  if (period === "1m") return "vs previous 1m";
  if (period === "mtd") return "vs prior period";
  if (period === "3m") return "vs previous 3m";
  if (period === "today") return "vs prior half";
  return "vs prior period";
}

const OVERVIEW_STORAGE_KEY = "paymentgate.platform.overviewCharts.v5";
const OVERVIEW_STORAGE_KEY_LEGACY = [
  "paymentgate.platform.overviewCharts.v4",
  "paymentgate.platform.overviewCharts.v3",
  "paymentgate.platform.overviewCharts.v2",
] as const;
const LEGACY_PLATFORM_IDS = new Set(["invoices", "fees", "accounts"]);

/** One convert-rate card per Networks & Assets pair (not de-duped by asset). */
const RATE_PAIRS = visibleRegistry();

/** Preferred default Metrics row — three cards, matching the mockup grid. */
const DEFAULT_RATE_PREFS: readonly { asset: string; network: string }[] = [
  { asset: "ETH", network: "ethereum" },
  { asset: "TRX", network: "tron" },
  { asset: "USDT", network: "tron" },
];

function defaultOverviewIds(): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const pref of DEFAULT_RATE_PREFS) {
    const row = RATE_PAIRS.find(
      (r) => r.asset === pref.asset && r.network === pref.network,
    );
    if (!row) continue;
    const id = rateOverviewId(row.asset, row.network);
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  // Pad from registry if a preferred pair is missing in this chain env.
  for (const row of RATE_PAIRS) {
    if (ids.length >= 3) break;
    const id = rateOverviewId(row.asset, row.network);
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

const DEFAULT_OVERVIEW_IDS = defaultOverviewIds();

function isOrgOverviewId(id: string): boolean {
  return id.startsWith("merchant:") || id.startsWith("agent:");
}

function isRateOverviewId(id: string): boolean {
  return id.startsWith("rate:");
}

/** `rate:USDT:solana` or legacy `rate:USDT`. */
function parseRateOverviewId(
  id: string,
): { asset: string; network: string | null } | null {
  const m = /^rate:([^:]+)(?::(.+))?$/.exec(id);
  if (!m) return null;
  return { asset: m[1]!, network: m[2] ?? null };
}

function rateOverviewId(asset: string, network: string): string {
  return `rate:${asset}:${network}`;
}

function expandRateOverviewId(id: string): string[] {
  const parsed = parseRateOverviewId(id);
  if (!parsed) return [id];
  if (parsed.network) return [id];
  // Legacy asset-only id → one preferred pair for that asset (not every network).
  const pref = DEFAULT_RATE_PREFS.find((p) => p.asset === parsed.asset);
  if (
    pref &&
    RATE_PAIRS.some(
      (r) => r.asset === pref.asset && r.network === pref.network,
    )
  ) {
    return [rateOverviewId(pref.asset, pref.network)];
  }
  const first = RATE_PAIRS.find((row) => row.asset === parsed.asset);
  return first ? [rateOverviewId(first.asset, first.network)] : [id];
}

function allRegistryRateIds(): string[] {
  return RATE_PAIRS.map((row) => rateOverviewId(row.asset, row.network));
}

function sameIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

function parseOrgOverviewId(
  id: string,
): { kind: "merchant" | "agent"; orgId: string } | null {
  const m = /^(merchant|agent):(.+)$/.exec(id);
  if (!m) return null;
  return { kind: m[1] as "merchant" | "agent", orgId: m[2] };
}

function normalizeOverviewIds(parsed: string[]): string[] {
  const withoutLegacy = parsed.filter((id) => !LEGACY_PLATFORM_IDS.has(id));
  const expanded: string[] = [];
  const seen = new Set<string>();
  for (const id of withoutLegacy) {
    const next = isRateOverviewId(id) ? expandRateOverviewId(id) : [id];
    for (const x of next) {
      if (seen.has(x)) continue;
      seen.add(x);
      expanded.push(x);
    }
  }
  const rates = expanded.filter(isRateOverviewId);
  const orgs = expanded.filter(isOrgOverviewId);
  // Prior default selected every registry pair — collapse to the 3-card default.
  if (rates.length > 0 && sameIdSet(rates, allRegistryRateIds())) {
    return [...DEFAULT_OVERVIEW_IDS, ...orgs];
  }
  if (rates.length === 0) {
    return [...DEFAULT_OVERVIEW_IDS, ...orgs];
  }
  return expanded.length ? expanded : DEFAULT_OVERVIEW_IDS;
}

function loadOverviewIds(storageKey: string = OVERVIEW_STORAGE_KEY): string[] {
  try {
    let raw: string | null = localStorage.getItem(storageKey);
    if (!raw && storageKey === OVERVIEW_STORAGE_KEY) {
      for (const key of OVERVIEW_STORAGE_KEY_LEGACY) {
        raw = localStorage.getItem(key);
        if (raw) break;
      }
    }
    if (!raw) return DEFAULT_OVERVIEW_IDS;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === "string")) {
      return DEFAULT_OVERVIEW_IDS;
    }
    return normalizeOverviewIds(parsed);
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

/** Preset → date inputs in the viewer's profile zone (MTD = 1st of this month there). */
function periodDateInputs(id: PeriodId): { from: string; to: string } {
  const today = zonedYmd();
  if (id === "mtd") return { from: `${today.slice(0, 8)}01`, to: today };
  if (id === "7d") return { from: addDaysYmd(today, -6), to: today };
  if (id === "1m") return { from: addMonthsYmd(today, -1), to: today };
  if (id === "3m") return { from: addMonthsYmd(today, -3), to: today };
  return { from: today, to: today };
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
  card: { volumeUsd: number; feesCollected: number; series: number[] };
  labels: string[];
  trendLabel?: string;
  route?: (path?: string) => string;
}): OverviewChartCard {
  const { overviewId, kind, org, card, labels } = args;
  return {
    id: overviewId,
    category: kind === "merchant" ? "Merchants" : "Agents",
    title: org.name,
    help:
      kind === "merchant"
        ? "Settled merchant volume and paid platform fees (subscription + volume) for this merchant (and sites)."
        : "Settled merchant volume and paid platform fees (subscription + volume) for this agent subtree.",
    value: volFeeValue(card.volumeUsd, card.feesCollected),
    compareLabel: kind === "merchant" ? "Merchant" : "Agent",
    trendPercent: trendFromSeries(card.series),
    trendLabel: args.trendLabel,
    series: card.series,
    seriesLabels: labels,
    seriesMetric: "Volume",
    formatSeriesValue: (n: number) => `${formatMoneyFigure(n)} USD`,
    chartColor: orgMetricChartColor(overviewId, kind),
    seriesStatus: "ready",
    moreHref: (args.route ?? platformRoute)(
      kind === "merchant"
        ? `accounts/merchants/${org.id}`
        : `accounts/agents/${org.id}`,
    ),
  };
}

function formatMoneyFigure(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** Convert-rate display — more precision for sub-$1 / stable pegs. */
function formatRateFigure(n: number): string {
  if (n >= 1000) {
    return n.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  if (n >= 1) {
    return n.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  }
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  });
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

const PLATFORM_DASHBOARD_SOURCES = {
  peekOrgs: peekPlatformOrgs,
  getOrgs: (opts?: { force?: boolean }) => getPlatformOrgs(opts),
};

/** Unfiltered series powering the Volume chart and the KPI sparklines. */
const TOTAL_METRICS: DashboardSeriesMetric[] = [
  "volume",
  "settled",
  "newMerchants",
  "newAgents",
];

const FILTER_METRICS: DashboardSeriesMetric[] = ["volume", "volumeAsset"];

function statsFromKpis(k: DashboardKpis | null): OverviewStats {
  if (!k) return EMPTY_STATS;
  const m = k.accounts.merchants;
  const a = k.accounts.agents;
  return {
    merchants: { total: m.total, active: m.active, pause: m.paused },
    agents: a ? { total: a.total, active: a.active, pause: a.paused } : EMPTY_STATS.agents,
    newMerchants: m.new,
    newAgents: a?.new ?? 0,
    newCashiers: 0,
    invoicesIssued: k.bills.issued,
    invoicesPaid: k.bills.paid,
    invoicesOverdue: k.bills.overdue,
    volume: k.orders.volumeUsd,
    fees: k.bills.feesBilled,
    collected: k.bills.feesCollected,
    anomalies: k.orders.anomalies,
    commissionOwed: k.commissions?.owed ?? 0,
    commissionPaid: k.commissions?.paid ?? 0,
  };
}

function filterAssetNetwork(filter: VolumeChartFilter): {
  asset: string | null;
  network: string | null;
} {
  if (filter.scope === "asset") return { asset: filter.asset, network: null };
  if (filter.scope === "network") return { asset: null, network: filter.network };
  if (filter.scope === "pair") return { asset: filter.asset, network: filter.network };
  return { asset: null, network: null };
}

function dashboardErrorText(err: unknown): string {
  if (err instanceof ApiError) {
    return err.code === "rate_limited"
      ? "Too many requests — wait a moment and retry."
      : err.message;
  }
  return "Failed to load dashboard";
}

export function DashboardPage({ session }: Props) {
  const portal = useDashboardPortal();
  const route = portal?.route ?? platformRoute;
  const sources = portal ?? PLATFORM_DASHBOARD_SOURCES;
  const scopeOrgId = portal?.scopeOrgId ?? null;
  const overviewStorageKey = portal?.overviewStorageKey ?? OVERVIEW_STORAGE_KEY;
  const [commissionPercent, setCommissionPercent] = useState<string | null>(null);
  const isAgent = portal?.kind === "agent";
  const defaultPeriod: PeriodId = isAgent ? "mtd" : "7d";
  const [period, setPeriod] = useState<PeriodId | "custom">(defaultPeriod);
  const [startDate, setStartDate] = useState(() => periodDateInputs(defaultPeriod).from);
  const [endDate, setEndDate] = useState(() => periodDateInputs(defaultPeriod).to);
  const commissionOrgId = isAgent ? scopeOrgId : null;
  const [commissionPreview, setCommissionPreview] = useState<CommissionPreview | null>(() =>
    commissionOrgId ? peekCommissionPreview(commissionOrgId) : null,
  );
  const periodOptions = isAgent ? AGENT_PERIOD_OPTIONS : PERIOD_OPTIONS;
  const viewerTz = useViewerTimeZone();
  const query = useMemo<DashboardQuery>(
    () => ({ from: startDate, to: endDate, orgId: scopeOrgId, tz: viewerTz }),
    [startDate, endDate, scopeOrgId, viewerTz],
  );

  const [kpis, setKpis] = useState<DashboardKpis | null>(() => peekDashboardKpis(query));
  const [totalSeries, setTotalSeries] = useState<DashboardSeries | null>(() =>
    peekDashboardSeries(query, { metrics: TOTAL_METRICS }),
  );
  const [rates, setRates] = useState<DashboardRates | null>(() => peekDashboardRates(query));
  const [orgs, setOrgs] = useState<OrgAccount[]>(() => sources.peekOrgs() ?? []);
  const [loading, setLoading] = useState(() => kpis == null || totalSeries == null);
  const [hasLoaded, setHasLoaded] = useState(() => kpis != null && totalSeries != null);
  const loadGen = useRef(0);
  const lastFetchAt = useRef(0);
  const [pairsReloadToken, setPairsReloadToken] = useState(0);
  const [chartReloadToken, setChartReloadToken] = useState(0);
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dismissError = useCallback(() => setError(null), []);
  const [volumeSelection, setVolumeSelection] = useState<VolumeSelection | null>(
    null,
  );
  /** When an asset is selected: compare USD (convert rate) vs native asset on two axes. */
  const [compareUsdAsset, setCompareUsdAsset] = useState(true);
  const [volumeMaximized, setVolumeMaximized] = useState(false);
  const [volumeZoomed, setVolumeZoomed] = useState(false);
  const [volumeFsZoomed, setVolumeFsZoomed] = useState(false);
  const volumeZoomApiRef = useRef<VolumeChartZoomApi | null>(null);
  const volumeFsZoomApiRef = useRef<VolumeChartZoomApi | null>(null);
  const [overviewIds, setOverviewIds] = useState<string[]>(() =>
    loadOverviewIds(overviewStorageKey),
  );
  const [addChartsOpen, setAddChartsOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const onPeriodSelect = useCallback((id: PeriodId) => {
    const { from, to } = periodDateInputs(id);
    setPeriod(id);
    setStartDate(from);
    setEndDate(to);
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

  /** Cards (KPIs), chart series, rate cards and the org list load independently. */
  const load = useCallback(async (opts?: { force?: boolean }) => {
    if (!startDate || !endDate) return;
    const gen = ++loadGen.current;
    const force = Boolean(opts?.force);
    const q: DashboardQuery = { ...query, fresh: force };
    setError(null);

    const cachedKpis = force ? null : peekDashboardKpis(query);
    const cachedSeries = force ? null : peekDashboardSeries(query, { metrics: TOTAL_METRICS });
    const cachedRates = force ? null : peekDashboardRates(query);
    if (cachedKpis) setKpis(cachedKpis);
    if (cachedSeries) setTotalSeries(cachedSeries);
    if (cachedRates) setRates(cachedRates);
    const warm = Boolean(cachedKpis && cachedSeries);
    if (warm) setHasLoaded(true);
    setLoading(!warm);

    const current = () => gen === loadGen.current;
    const fail = (err: unknown) => {
      if (current()) setError(dashboardErrorText(err));
    };

    if (commissionOrgId) {
      void getCommissionPreview(commissionOrgId, force)
        .then((next) => {
          if (current()) setCommissionPreview(next);
        })
        .catch(() => undefined);
    }

    if (portal) {
      void portal
        .getCommissionPercent()
        .catch(() => null)
        .then((pct) => {
          if (current()) setCommissionPercent(pct);
        });
    }

    await Promise.all([
      getDashboardKpis(q)
        .then((next) => {
          if (!current()) return;
          setKpis(next);
          setHasLoaded(true);
        })
        .catch(fail),
      getDashboardSeries(q, { metrics: TOTAL_METRICS })
        .then((next) => {
          if (!current()) return;
          setTotalSeries(next);
          setHasLoaded(true);
        })
        .catch(fail),
      getDashboardRates(q)
        .then((next) => {
          if (current()) setRates(next);
        })
        .catch(() => undefined),
      sources
        .getOrgs(force ? { force: true } : undefined)
        .then((next) => {
          if (current()) setOrgs(next);
        })
        .catch(() => undefined),
    ]);
    if (!current()) return;
    setLoading(false);
    setHasLoaded(true);
    lastFetchAt.current = Date.now();
  }, [startDate, endDate, query, portal, sources, commissionOrgId]);

  const softRevalidateLiveSlices = useCallback(
    async (slices: DashboardLiveSlice[]) => {
      if (!startDate || !endDate) return;
      const q: DashboardQuery = { ...query, fresh: true };
      const needKpis = slices.some((s) =>
        ["volume", "anomalies", "serviceBills", "orgs", "commissions"].includes(s),
      );
      const needSeries = slices.includes("volume") || slices.includes("orgs");
      try {
        await Promise.all([
          needKpis ? getDashboardKpis(q).then(setKpis) : null,
          needSeries
            ? getDashboardSeries(q, { metrics: TOTAL_METRICS }).then(setTotalSeries)
            : null,
          slices.includes("volume") ? getDashboardRates(q).then(setRates) : null,
          slices.includes("orgs") ? sources.getOrgs({ force: true }).then(setOrgs) : null,
          commissionOrgId &&
          slices.some((s) => ["volume", "serviceBills", "commissions", "orgs"].includes(s))
            ? getCommissionPreview(commissionOrgId, true).then(setCommissionPreview)
            : null,
        ]);
        if (slices.includes("volume") || slices.includes("serviceBills")) {
          setChartReloadToken((n) => n + 1);
        }
        if (slices.includes("networks")) {
          setPairsReloadToken((n) => n + 1);
        }
      } catch {
        // Keep last good snapshot.
      }
    },
    [startDate, endDate, query, sources, commissionOrgId],
  );

  useDashboardLiveEvents({
    enabled: hasLoaded,
    debounceMs: 5_000,
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
      void load();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [load]);

  const refreshDashboard = useCallback(() => {
    setPairsReloadToken((n) => n + 1);
    setChartReloadToken((n) => n + 1);
    void load({ force: true });
  }, [load]);
  usePageRefresh(refreshDashboard);

  useEffect(() => {
    if (portal) return;
    let cancelled = false;
    void (async () => {
      try {
        const snap = await getBackupStatus();
        if (!cancelled) setBackupStatus(snap);
      } catch {
        if (!cancelled) setBackupStatus(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pairsReloadToken, portal]);

  const periodLabel =
    period === "custom"
      ? `${startDate} – ${endDate}`
      : (periodOptions.find((p) => p.id === period)?.label ?? period);

  const chartLabels = useMemo(
    () => (totalSeries ? chartLabelsFor(totalSeries.keys, totalSeries.interval) : []),
    [totalSeries],
  );

  const volumeFilter: VolumeChartFilter = useMemo(
    () => volumeFilterFromSelection(volumeSelection),
    [volumeSelection],
  );
  const chartDetail = chartFilterDetail(volumeFilter);
  const selectedAsset = chartFilterAsset(volumeFilter);
  const canCompareUsdAsset = selectedAsset != null;

  // Selecting an asset turns compare on so both USD + native lines appear immediately.
  useEffect(() => {
    if (canCompareUsdAsset) setCompareUsdAsset(true);
    else setCompareUsdAsset(false);
  }, [selectedAsset, canCompareUsdAsset]);

  /** Asset / network chart filter → its own server series (USD + native amount). */
  const [filteredSeries, setFilteredSeries] = useState<DashboardSeries | null>(null);
  useEffect(() => {
    if (volumeFilter.scope === "all") {
      setFilteredSeries(null);
      return;
    }
    const { asset, network } = filterAssetNetwork(volumeFilter);
    const opts = { metrics: FILTER_METRICS, asset, network };
    setFilteredSeries(peekDashboardSeries(query, opts));
    let cancelled = false;
    getDashboardSeries(query, opts)
      .then((next) => {
        if (!cancelled) setFilteredSeries(next);
      })
      .catch((err) => {
        if (!cancelled) setError(dashboardErrorText(err));
      });
    return () => {
      cancelled = true;
    };
  }, [query, volumeFilter, chartReloadToken]);

  const {
    series,
    dayLabels,
    secondarySeries,
    valueUnit,
    secondaryUnit,
  } = useMemo(() => {
    const single = {
      secondarySeries: undefined as number[] | undefined,
      valueUnit: "usd" as string,
      secondaryUnit: undefined as string | undefined,
    };
    if (volumeFilter.scope === "all") {
      return { ...single, series: totalSeries?.series.volume ?? [], dayLabels: chartLabels };
    }
    if (!filteredSeries) {
      return { ...single, series: [] as number[], dayLabels: chartLabels };
    }
    const labels = chartLabelsFor(filteredSeries.keys, filteredSeries.interval);
    const usd = filteredSeries.series.volume ?? [];
    const asset = chartFilterAsset(volumeFilter);
    if (asset) {
      const native = filteredSeries.series.volumeAsset ?? [];
      // Asset always uses the left axis so the unit does not jump when compare toggles.
      if (compareUsdAsset) {
        return {
          series: native,
          dayLabels: labels,
          secondarySeries: usd,
          valueUnit: asset as string,
          secondaryUnit: "usd" as string | undefined,
        };
      }
      return { ...single, series: native, dayLabels: labels, valueUnit: asset as string };
    }
    // Network-only filter — stay in USD (mixed assets).
    return { ...single, series: usd, dayLabels: labels };
  }, [volumeFilter, totalSeries, chartLabels, filteredSeries, compareUsdAsset]);

  const baseChartCatalog: OverviewChartCard[] = useMemo(() => {
    const labels = rates ? chartLabelsFor(rates.keys, rates.interval) : chartLabels;
    const trendLabel = overviewTrendLabel(period);
    const fmtRate = (n: number) => `${formatRateFigure(n)} USD`;
    const byPair = new Map(
      (rates?.pairs ?? []).map((p) => [`${p.asset}:${p.network}`, p]),
    );

    return RATE_PAIRS.map((row) => {
      const asset = row.asset;
      const network = row.network;
      const netLabel = networkShortLabel(network);
      const pair = byPair.get(`${asset}:${network}`);
      const latest = pair?.latest ?? null;
      const quoteCount = pair?.quoteCount ?? 0;
      const market = pair?.source === "market";
      const empty = latest == null;
      const money = (n: number) => (
        <span className="fund-amount">
          {formatRateFigure(n)}
          <span className="plat-fund-currency">USD</span>
        </span>
      );
      const rateSeries = pair?.series ?? labels.map(() => 0);
      return {
        id: rateOverviewId(asset, network),
        category: portal ? "Rates" : "Platform",
        title: `${asset} · ${netLabel}`,
        help: market
          ? `Market USD convert rate for 1 ${asset} on ${row.displayNetwork} across the platform in the selected period. Shown until your merchants have quotes for this pair.`
          : `Locked USD convert rate for 1 ${asset} on ${row.displayNetwork} from order quotes in the selected period. Days without quotes hold the last known rate.`,
        value: empty ? "—" : money(latest),
        compareLabel: empty
          ? `No quotes · ${periodLabel}`
          : market
            ? `Market rate · ${periodLabel}`
            : `${quoteCount.toLocaleString()} quote${quoteCount === 1 ? "" : "s"} · ${periodLabel}`,
        trendPercent: empty ? null : trendFromRateSeries(rateSeries),
        trendLabel,
        series: empty ? labels.map(() => 0) : rateSeries,
        seriesLabels: labels,
        seriesMetric: `${asset} rate`,
        formatSeriesValue: fmtRate,
        chartColor: assetRateChartColor(asset),
        seriesStatus: "ready" as const,
        empty,
      };
    });
  }, [rates, chartLabels, periodLabel, period, portal]);

  const orgOverviewIds = useMemo(
    () => overviewIds.filter(isOrgOverviewId),
    [overviewIds],
  );
  const [orgCardData, setOrgCardData] = useState<DashboardOrgCards | null>(null);
  useEffect(() => {
    const orgIds = orgOverviewIds
      .map((id) => parseOrgOverviewId(id)?.orgId)
      .filter((id): id is string => Boolean(id));
    if (orgIds.length === 0) {
      setOrgCardData(null);
      return;
    }
    let cancelled = false;
    getDashboardOrgCards(query, orgIds)
      .then((next) => {
        if (!cancelled) setOrgCardData(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [query, orgOverviewIds, chartReloadToken]);

  const orgChartCards = useMemo((): OverviewChartCard[] => {
    if (!orgCardData || orgs.length === 0) return [];
    const labels = chartLabelsFor(orgCardData.keys, orgCardData.interval);
    const byId = new Map(orgCardData.cards.map((c) => [c.orgId, c]));
    const cards: OverviewChartCard[] = [];
    for (const id of orgOverviewIds) {
      const parsed = parseOrgOverviewId(id);
      if (!parsed) continue;
      const org = orgs.find((o) => o.id === parsed.orgId);
      const card = byId.get(parsed.orgId);
      if (!org || !card) continue;
      cards.push(
        buildOrgOverviewCard({
          overviewId: id,
          kind: parsed.kind,
          org,
          card,
          labels,
          trendLabel: overviewTrendLabel(period),
          route,
        }),
      );
    }
    return cards;
  }, [orgCardData, orgs, orgOverviewIds, period, route]);

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
      const parsed = parseOrgOverviewId(overviewId);
      if (!parsed) throw new Error("Invalid overview id");
      const org = orgs.find((o) => o.id === parsed.orgId);
      if (!org) throw new Error("Org not found");
      const data = await getDashboardOrgCards(query, [parsed.orgId]);
      const card = data.cards.find((c) => c.orgId === parsed.orgId);
      if (!card) throw new Error("Org not in dashboard scope");
      return buildOrgOverviewCard({
        overviewId,
        kind: parsed.kind,
        org,
        card,
        labels: chartLabelsFor(data.keys, data.interval),
        trendLabel: overviewTrendLabel(period),
        route,
      });
    },
    [orgs, query, period, route],
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
        .filter((o) => o.type === "agent")
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
      localStorage.setItem(overviewStorageKey, JSON.stringify(ids));
    } catch {
      /* ignore quota */
    }
    setAddChartsOpen(false);
  }, [overviewStorageKey]);

  const persistOverviewIds = useCallback((ids: string[]) => {
    setOverviewIds(ids);
    try {
      localStorage.setItem(overviewStorageKey, JSON.stringify(ids));
    } catch {
      /* ignore quota */
    }
  }, [overviewStorageKey]);

  const removeOverviewCard = useCallback(
    (id: string) => {
      persistOverviewIds(overviewIds.filter((x) => x !== id));
    },
    [overviewIds, persistOverviewIds],
  );

  const periodControls = (
    <DashPeriodControls
      options={periodOptions}
      period={period}
      startDate={startDate}
      endDate={endDate}
      onPeriodSelect={onPeriodSelect}
      onStartDateChange={onStartDateChange}
      onEndDateChange={onEndDateChange}
    />
  );

  const stats = useMemo(() => statsFromKpis(kpis), [kpis]);
  const orderCounts = {
    settled: kpis?.orders.settled ?? 0,
    total: kpis?.orders.total ?? 0,
  };

  const kpiSparks = useMemo(() => {
    const s = totalSeries?.series ?? {};
    return {
      merchants: s.newMerchants ?? [],
      agents: s.newAgents ?? [],
      transactions: s.settled ?? [],
      volume: s.volume ?? [],
      txTrend: kpis?.orders.settledTrend ?? null,
      volumeTrend: kpis?.orders.volumeTrend ?? null,
    };
  }, [totalSeries, kpis]);

  const successRate = kpis?.orders.successRate ?? 100;
  const heroOrg = portal ? orgs.find((o) => o.id === portal.titleOrgId) ?? null : null;

  if (loading && !hasLoaded) {
    return <PagePending />;
  }

  return (
    <div
      className={`dash-page plat-dash pg-dash${loading ? " is-period-refresh" : ""}`}
      aria-busy={loading}
    >
      <AuthToast message={error} tone="error" onDismiss={dismissError} />

      <header className="pg-dash__hero">
        <div className="pg-dash__hero-top">
          <div className="pg-dash__hero-brand">
            {portal ? (
              <OrgBrandMark
                name={heroOrg?.name ?? portal.title}
                iconKey={heroOrg?.iconKey}
                size={104}
                className="pg-dash__org-mark"
              />
            ) : (
              <GateLogoMark size={140} className="pg-dash__mark" alt="" />
            )}
            <div className="pg-dash__hero-copy">
              <p className="pg-dash__eyebrow">{portal ? portal.eyebrow : "Platform"}</p>
              <h1 className="pg-dash__welcome">
                {portal ? (heroOrg?.name ?? portal.title) : "PaymentGate"}
              </h1>
              <p className="pg-dash__lede">
                Here’s what’s happening with your payment ecosystem today.
              </p>
            </div>
          </div>
          <div className="pg-dash__hero-aside">
            <DashHeroHighlights />
            <div className="pg-dash__hero-toolbar">
              {periodControls}
            </div>
          </div>
        </div>
        <DashHeroAura />
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
          spark={kpiSparks.merchants}
          href={route("accounts/merchants")}
          linkLabel="View Merchants"
        />
        {portal ? null : (
          <DashKpiCard
            accent="teal"
            label="Total Agents"
            value={stats.agents.total.toLocaleString()}
            hint={
              stats.newAgents > 0
                ? `+${stats.newAgents} new in period`
                : `${stats.agents.active} active`
            }
            spark={kpiSparks.agents}
            href={platformRoute("accounts/agents")}
            linkLabel="View Agents"
          />
        )}
        <DashKpiCard
          accent="gold"
          label="Total Transactions"
          value={orderCounts.settled.toLocaleString()}
          trend={kpiSparks.txTrend}
          spark={kpiSparks.transactions}
          href={portal ? undefined : platformRoute("invoices")}
          linkLabel="View Transactions"
        />
        <DashKpiCard
          accent="violet"
          label="Total Volume"
          value={
            <span className="pg-kpi__money">
              <AnimatedText text={"$" + formatMoneyFigureFixed(stats.volume)} />
            </span>
          }
          trend={kpiSparks.volumeTrend}
          spark={kpiSparks.volume}
          href={route("service-bills")}
          linkLabel="View Volume"
        />
        {portal ? (
          <DashKpiCard
            accent="teal"
            icon={<MerchantFeesIcon />}
            label="Merchant Fees"
            value={
              <span className="pg-kpi__money">
                <AnimatedText text={"$" + formatMoneyFigureFixed(stats.collected)} />
              </span>
            }
            hint={`paid of $${formatMoneyFigureFixed(stats.fees)} billed · ${periodLabel}`}
            href={route("service-bills")}
            linkLabel="View Bills"
          />
        ) : null}
        <div
          className="pg-feature"
          aria-label={portal ? "Commission earned" : "Platform fees collected"}
        >
          <div className="pg-feature__top">
            <span className="pg-feature__icon" aria-hidden>
              <img
                className="pg-feature__icon-img"
                src="/brand/wallet-icon.png"
                alt=""
                width={40}
                height={40}
                draggable={false}
              />
            </span>
            <p className="pg-feature__kicker">
              {portal ? "Commission earned" : "Platform fees"}
            </p>
          </div>
          {portal && period === "mtd" && commissionPreview?.eligible ? (
            <>
              <p className="pg-feature__value">
                ${formatMoneyFigureFixed(commissionPreview.totals.commissionUsd)}
              </p>
              <p className="pg-feature__label">
                Estimated · {commissionPreview.commissionPercent}% of $
                {formatMoneyFigureFixed(commissionPreview.totals.baseUsd)} paid fees ·{" "}
                {commissionPreview.periodLabel} (UTC)
              </p>
              <p className="pg-feature__sub">
                Invoiced {formatUtcDay(commissionPreview.invoiceDate)}
                {commissionPreview.totals.openBills > 0
                  ? ` · $${formatMoneyFigureFixed(commissionPreview.totals.openBillsUsd)} unpaid not counted`
                  : ""}
              </p>
            </>
          ) : portal ? (
            <>
              <p className="pg-feature__value">
                ${formatMoneyFigureFixed(stats.commissionOwed + stats.commissionPaid)}
              </p>
              <p className="pg-feature__label">
                {commissionPercent
                  ? `${commissionPercent}% of platform fees`
                  : "from merchant fees"}
              </p>
              <p className="pg-feature__sub">
                ${formatMoneyFigureFixed(stats.commissionPaid)} paid · $
                {formatMoneyFigureFixed(stats.commissionOwed)} pending
              </p>
            </>
          ) : (
            <>
              <p className="pg-feature__value">
                <AnimatedText text={"$" + formatMoneyFigureFixed(stats.collected)} />
              </p>
              <p className="pg-feature__label">
                from invoices · {periodLabel}
              </p>
              <p className="pg-feature__sub">
                of ${formatMoneyFigureFixed(stats.fees)} billed
              </p>
            </>
          )}
          <Link
            to={route(portal ? "commissions" : "service-bills")}
            className="pg-feature__link"
          >
            <span className="pg-feature__link-text">
              {portal ? "View Commissions" : "View Volume"}
            </span>
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
          className="panel dash-chart-panel glass-tone-slate pg-chart-panel"
        >
          <div className="dash-chart-panel__head">
            <div className="dash-chart-panel__title-row">
              <div className="pg-chart-panel__heading">
                <span className="pg-chart-panel__title-icon" aria-hidden>
                  <img
                    className="pg-chart-panel__title-icon-img"
                    src="/brand/volume-chart-icon.png"
                    alt=""
                    width={48}
                    height={48}
                    draggable={false}
                  />
                </span>
                <div className="pg-chart-panel__heading-text">
                  <h2>Transaction Volume</h2>
                  <p>
                    {chartDetail
                      ? compareUsdAsset
                        ? `USD (convert rate) vs ${selectedAsset} over time.`
                        : `Successful ${chartDetail} volume over time.`
                      : "Total successful transaction volume over time."}
                  </p>
                </div>
              </div>
              <div className="dash-chart-panel__filters">
                <VolumeFilterSelect
                  selection={volumeSelection}
                  onChange={setVolumeSelection}
                />
                <label
                  className={`volume-compare-toggle${canCompareUsdAsset ? "" : " is-disabled"}`}
                  title={
                    canCompareUsdAsset
                      ? `Show USD (convert rate) and ${selectedAsset} together`
                      : "Select an asset first to compare USD vs native amount"
                  }
                >
                  <input
                    type="checkbox"
                    checked={canCompareUsdAsset && compareUsdAsset}
                    disabled={!canCompareUsdAsset}
                    onChange={(e) => setCompareUsdAsset(e.target.checked)}
                  />
                  <span>
                    {canCompareUsdAsset
                      ? `USD + ${selectedAsset}`
                      : "USD + asset"}
                  </span>
                </label>
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
            secondaryValues={secondarySeries}
            valueUnit={valueUnit}
            secondaryUnit={secondaryUnit}
            showZoomBar={false}
            onZoomedChange={setVolumeZoomed}
            zoomApiRef={volumeZoomApiRef}
          />
        </div>

        <div
          className="panel glass-tone-slate plat-health-card pg-networks-panel"
        >
          <div className="pg-networks-panel__head">
            <div className="pg-networks-panel__title-row">
              <div className="pg-networks-panel__titles">
                <h2>
                  <span className="pg-networks-panel__title-icon" aria-hidden>
                    <svg
                      width="28"
                      height="28"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="6" cy="7" r="2.25" />
                      <circle cx="18" cy="7" r="2.25" />
                      <circle cx="12" cy="17" r="2.25" />
                      <path d="M8 7h8" />
                      <path d="M7.2 8.6 10.8 15" />
                      <path d="M16.8 8.6 13.2 15" />
                    </svg>
                  </span>
                  Networks &amp; Assets
                </h2>
              </div>
              {portal ? null : (
                <Link
                  to={platformRoute("settings/networks")}
                  className="pg-networks-panel__more"
                >
                  View All →
                </Link>
              )}
            </div>
          </div>
          <div className="plat-health-pairs">
            <AssetNetworkTables
              compact
              sortable={false}
              reloadToken={pairsReloadToken}
            />
          </div>
        </div>
      </div>

      {portal ? null : (
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
          href={route("service-bills")}
          linkLabel="Review"
          linkWithTitle
        />
        <DashKpiCard
          accent="violet"
          label="Pending Payouts"
          value={stats.commissionOwed > 0 ? formatMoneyFigure(stats.commissionOwed) : "0"}
          hint={stats.commissionOwed > 0 ? "Commission owed" : "Scheduled"}
          href={route("commissions")}
          linkLabel="View"
          linkWithTitle
        />
        <DashKpiCard
          accent="slate"
          label="Flagged for Review"
          value={stats.anomalies.toLocaleString()}
          hint={
            stats.anomalies > 0 ? "Open Attention" : "No action required"
          }
          href={platformRoute("invoices")}
          linkLabel="Open"
          linkWithTitle
        />
          <DashKpiCard
            accent={
              backupStatus == null
                ? "slate"
                : backupStatus.status === "ok"
                  ? "ok"
                  : backupStatus.status === "stale"
                    ? "warn"
                    : backupStatus.status === "failed"
                      ? "danger"
                      : "slate"
            }
            label="DB Backup"
            value={
              backupStatus == null
                ? "—"
                : backupStatus.status === "ok"
                  ? "OK"
                  : backupStatus.status === "stale"
                    ? "Stale"
                    : backupStatus.status === "failed"
                      ? "Failed"
                      : "None"
            }
            hint={
              backupStatus == null
                ? "Checking backup…"
                : backupStatus.detail
            }
            href={platformRoute("settings/networks")}
            linkLabel="View"
            linkWithTitle
          />
      </div>
      )}

      {isAgent ? (
        <CommissionByMerchantPanel
          preview={commissionPreview}
          route={route}
          canOnboard={!portal?.readOnly}
        />
      ) : null}

      <ChartMaximizeOverlay
        open={volumeMaximized}
        title={
          chartDetail ? `Transaction Volume (${chartDetail})` : "Transaction Volume"
        }
        onClose={() => setVolumeMaximized(false)}
        header={
          <div className="dash-chart-panel__title-row chart-maximize-overlay__title-row">
            <div className="pg-chart-panel__heading">
              <span className="pg-chart-panel__title-icon" aria-hidden>
                <img
                  className="pg-chart-panel__title-icon-img"
                  src="/brand/volume-chart-icon.png"
                  alt=""
                  width={48}
                  height={48}
                  draggable={false}
                />
              </span>
              <div className="pg-chart-panel__heading-text">
                <h2 className="chart-maximize-overlay__title">
                  {chartDetail
                    ? `Transaction Volume (${chartDetail})`
                    : "Transaction Volume"}
                </h2>
                <p>
                  {chartDetail
                    ? compareUsdAsset
                      ? `USD (convert rate) vs ${selectedAsset} over time.`
                      : `Successful ${chartDetail} volume over time.`
                    : "Total successful transaction volume over time."}
                </p>
              </div>
            </div>
            <div className="dash-chart-panel__filters">
              <VolumeFilterSelect
                selection={volumeSelection}
                onChange={setVolumeSelection}
              />
              <label
                className={`volume-compare-toggle${canCompareUsdAsset ? "" : " is-disabled"}`}
                title={
                  canCompareUsdAsset
                    ? `Show USD (convert rate) and ${selectedAsset} together`
                    : "Select an asset first to compare USD vs native amount"
                }
              >
                <input
                  type="checkbox"
                  checked={canCompareUsdAsset && compareUsdAsset}
                  disabled={!canCompareUsdAsset}
                  onChange={(e) => setCompareUsdAsset(e.target.checked)}
                />
                <span>
                  {canCompareUsdAsset
                    ? `USD + ${selectedAsset}`
                    : "USD + asset"}
                </span>
              </label>
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
          key={`vol-fs-${dayLabels[0] ?? ""}-${dayLabels.length}-${series.length}-${compareUsdAsset ? "cmp" : "one"}`}
          values={series}
          labels={dayLabels}
          secondaryValues={secondarySeries}
          valueUnit={valueUnit}
          secondaryUnit={secondaryUnit}
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
        agents={portal ? [] : agentPickOptions}
        selectedIds={overviewIds}
        resolveOrgCard={resolveOrgCard}
        onClose={() => setAddChartsOpen(false)}
        onApply={applyOverviewIds}
      />
    </div>
  );
}

/** Paid merchant bills — receipt with a dollar mark (Commission keeps the wallet). */
function MerchantFeesIcon() {
  return (
    <svg
      width={36}
      height={36}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 3.5h14v17l-2.35-1.5-2.3 1.5-2.35-1.5-2.35 1.5-2.3-1.5L5 20.5v-17Z" />
      <path d="M14.2 8.4c-.4-.7-1.2-1.1-2.2-1.1-1.3 0-2.2.6-2.2 1.6s.9 1.4 2.2 1.7c1.3.3 2.2.8 2.2 1.8s-1 1.6-2.2 1.6c-1 0-1.9-.4-2.3-1.1M12 6.2v1.1M12 13.9v1.1" />
    </svg>
  );
}
