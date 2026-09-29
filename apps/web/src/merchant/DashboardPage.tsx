import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useViewerTimeZone } from "../shared/useViewerTimeZone";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  ApiError,
  getMerchantCommercial,
  type MerchantCommercialSettings,
  type OrgAccount,
  type Session,
} from "./api";
import {
  MERCHANT_ORGS_UPDATED_EVENT,
  getMerchantOrgs,
  peekMerchantOrgs,
} from "./merchantOrgList";
import {
  getDashboardKpis,
  getDashboardReports,
  peekDashboardKpis,
  peekDashboardReports,
  type DashboardKpis,
  type DashboardQuery,
  type DashboardReports,
} from "../shared/dashboardApi";
import {
  parentMerchantOrgId,
  primaryMerchantOrgId,
  sitesInMerchantSubtree,
} from "./org";
import { CashiersTable } from "./dashboard/CashiersTable";
import { mergeCashierRows } from "./dashboard/cashierRows";
import { useCashierMembers } from "./dashboard/useCashierMembers";
import { useWorkspaceScopeOrgId } from "./workspace";
import { sessionCanCharge } from "./org";
import { NetworksAssetsPanel } from "./dashboard/NetworksAssetsPanel";
import { TransactionVolumePanel } from "./dashboard/TransactionVolumePanel";
import { platformFeeStatus } from "./dashboard/platformFeeStatus";
import { SitesTable, type SiteRow } from "./dashboard/SitesTable";
import { AuthToast } from "../auth/AuthToast";
import { merchantRoute } from "../shared/portalRouting";
import { AnimatedMetric } from "../shared/AnimatedMetric";
import { OrgBrandMark } from "../shared/OrgBrandMark";
import { DashKpiCard } from "../platform/ui/DashKpiCard";
import { DashHeroAura, DashHeroHighlights, DashPeriodControls } from "../platform/ui/DashHero";
import {
  useDashboardLiveEvents,
  type DashboardLiveSlice,
} from "../shared/useDashboardLiveEvents";
import {
  DASHBOARD_PERIOD_OPTIONS,
  periodLabel,
  periodWindow,
  toDateInputValue,
  type DashboardPeriodId,
} from "../shared/dashboardPeriod";

type Props = { session: Session };

function tierLabel(tier: string | undefined): string {
  if (!tier) return "—";
  if (tier === "small") return "Small";
  if (tier === "mid") return "Mid";
  if (tier === "enterprise") return "Enterprise";
  return tier;
}

/** D1 — Merchant home (HQ ops board). Sites use SiteHomePage; cashiers use the pay pad. */
export function DashboardPage({ session }: Props) {
  const orgId = useMemo(() => primaryMerchantOrgId(session), [session]);
  const parentId = useMemo(() => parentMerchantOrgId(session), [session]);
  const scopeOrgId = useWorkspaceScopeOrgId(orgId);
  const [sites, setSites] = useState<OrgAccount[]>([]);
  const [homeOrg, setHomeOrg] = useState<OrgAccount | null>(
    () => peekMerchantOrgs()?.find((o) => o.id === orgId) ?? null,
  );
  const [commercial, setCommercial] = useState<MerchantCommercialSettings | null>(
    null,
  );
  const [chartReloadToken, setChartReloadToken] = useState(0);
  const [pairsReloadToken, setPairsReloadToken] = useState(0);

  const tz = useViewerTimeZone();
  const [period, setPeriod] = useState<DashboardPeriodId | "custom">("mtd");
  const [startDate, setStartDate] = useState(() =>
    toDateInputValue(periodWindow("mtd").from),
  );
  const [endDate, setEndDate] = useState(() =>
    toDateInputValue(periodWindow("mtd").to),
  );
  const [dashKpis, setDashKpis] = useState<DashboardKpis | null>(() =>
    peekDashboardKpis({ from: startDate, to: endDate, orgId: scopeOrgId, tz }),
  );
  const [loading, setLoading] = useState(() => dashKpis == null);
  const [hasLoaded, setHasLoaded] = useState(() => dashKpis != null);
  const [error, setError] = useState<string | null>(null);
  const [topbarActionsSlot, setTopbarActionsSlot] = useState<HTMLElement | null>(
    null,
  );

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    void getMerchantOrgs()
      .then((orgs) => {
        if (!cancelled) setHomeOrg(orgs.find((o) => o.id === orgId) ?? null);
      })
      .catch(() => {});
    const onUpdated = (e: Event) => {
      const rows = (e as CustomEvent<OrgAccount[]>).detail;
      if (!cancelled && Array.isArray(rows)) {
        setHomeOrg(rows.find((o) => o.id === orgId) ?? null);
      }
    };
    window.addEventListener(MERCHANT_ORGS_UPDATED_EVENT, onUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener(MERCHANT_ORGS_UPDATED_EVENT, onUpdated);
    };
  }, [orgId]);

  useLayoutEffect(() => {
    setTopbarActionsSlot(document.getElementById("platform-topbar-actions"));
  }, []);

  const onPeriodSelect = useCallback((id: DashboardPeriodId) => {
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

  /** Period cards come from server aggregates (sums / counts in SQL). */
  const loadKpis = useCallback(
    async (fresh = false) => {
      if (!startDate || !endDate) return;
      const cached = fresh
        ? null
        : peekDashboardKpis({ from: startDate, to: endDate, orgId: scopeOrgId, tz });
      if (cached) {
        setDashKpis(cached);
        setHasLoaded(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        setDashKpis(
          await getDashboardKpis({ from: startDate, to: endDate, orgId: scopeOrgId, tz, fresh }),
        );
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load dashboard");
      } finally {
        setLoading(false);
        setHasLoaded(true);
      }
    },
    [startDate, endDate, scopeOrgId, tz],
  );

  useEffect(() => {
    void loadKpis();
  }, [loadKpis]);

  const [reports, setReports] = useState<DashboardReports | null>(null);
  useEffect(() => {
    if (!startDate || !endDate) return;
    const q = { from: startDate, to: endDate, orgId: scopeOrgId, tz };
    setReports(peekDashboardReports(q));
    let cancelled = false;
    void getDashboardReports(q)
      .then((next) => {
        if (!cancelled) setReports(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate, scopeOrgId, tz]);

  const load = useCallback(async () => {
    if (orgId) {
      void Promise.all([
        getMerchantCommercial(orgId).catch(() => null),
        getMerchantOrgs().catch(() => [] as OrgAccount[]),
      ])
        .then(([commercialSettings, orgs]) => {
          setCommercial(commercialSettings);
          setSites(sitesInMerchantSubtree(orgs, parentId ?? orgId));
        })
        .catch(() => undefined);
    } else {
      setCommercial(null);
      setSites([]);
    }
  }, [orgId, parentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshDashboard = useCallback(() => {
    void loadKpis(true);
    void load();
    setChartReloadToken((n) => n + 1);
    setPairsReloadToken((n) => n + 1);
  }, [loadKpis, load]);

  const softRevalidateLiveSlices = useCallback(
    async (slices: DashboardLiveSlice[]) => {
      try {
        if (
          slices.includes("volume") ||
          slices.includes("anomalies") ||
          slices.includes("serviceBills")
        ) {
          await loadKpis(true);
        }
        if (slices.includes("volume")) setChartReloadToken((n) => n + 1);
        if (slices.includes("networks")) setPairsReloadToken((n) => n + 1);
      } catch {
        // Keep last good SWR snapshot.
      }
    },
    [loadKpis],
  );

  useDashboardLiveEvents({
    enabled: hasLoaded,
    debounceMs: 5_000,
    onSlices: (slices) => {
      void softRevalidateLiveSlices(slices);
    },
  });

  const activePeriodLabel = periodLabel(period, startDate, endDate);
  const chartQuery = useMemo<DashboardQuery>(
    () => ({ from: startDate, to: endDate, orgId: scopeOrgId, tz }),
    [startDate, endDate, scopeOrgId, tz],
  );

  const kpis = useMemo(() => {
    const volume = dashKpis?.orders.volumeUsd ?? 0;
    const feePct = Number(commercial?.volumeFeePercent);
    const platformFee =
      Number.isFinite(feePct) && feePct > 0 ? (volume * feePct) / 100 : 0;
    return {
      volume,
      platformFee,
      openWork: dashKpis?.orders.open ?? 0,
      anomalies: dashKpis?.orders.anomalies ?? 0,
      expiringSoon: dashKpis?.orders.expiringSoon ?? 0,
      openBills: dashKpis?.bills.open ?? 0,
      overdueBills: dashKpis?.bills.overdueOpen ?? 0,
      completedCount: dashKpis?.orders.settled ?? 0,
      settledTrend: dashKpis?.orders.settledTrend ?? null,
    };
  }, [dashKpis, commercial]);

  const feeStatus = useMemo(
    () =>
      platformFeeStatus({
        billingAnchorAt: commercial?.billingAnchorAt,
        nextInvoiceOn: commercial?.nextInvoiceOn,
        waivedMonthsLeft: commercial?.waivedMonthsLeft,
        openBills: kpis.openBills,
        overdueBills: kpis.overdueBills,
      }),
    [commercial, kpis.openBills, kpis.overdueBills],
  );

  const siteRows = useMemo((): SiteRow[] => {
    if (sites.length === 0) return [];
    const byOrg = new Map((dashKpis?.byOrg ?? []).map((r) => [r.orgId, r]));
    return sites.map((site) => {
      const row = byOrg.get(site.id);
      return {
        id: site.id,
        name: site.name,
        iconKey: site.iconKey ?? null,
        orders: row?.orders ?? 0,
        volume: row?.volumeUsd ?? 0,
        anomalies: row?.anomalies ?? 0,
      };
    });
  }, [sites, dashKpis]);

  const cashierOrgIds = useMemo(
    () => (orgId ? [orgId, ...sites.map((s) => s.id)] : []),
    [orgId, sites],
  );
  const cashierMembers = useCashierMembers(cashierOrgIds);
  const cashierRows = useMemo(
    () => mergeCashierRows(reports?.byCreator ?? [], cashierMembers),
    [reports, cashierMembers],
  );

  const cashierInvoicesHref = (userId: string) => {
    const q = new URLSearchParams({
      status: "all",
      period: "custom",
      from: startDate,
      to: endDate,
      cashier: userId,
    });
    return `${merchantRoute("orders")}?${q.toString()}`;
  };

  const brandName = homeOrg?.name ?? "Merchant";

  return (
    <div className="dash-page plat-dash pg-dash merchant-dash">
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />

      {topbarActionsSlot
        ? createPortal(
            <div
              className="org-agents__actions plat-orders-topbar__actions"
              aria-label="Dashboard actions"
            >
              <Link
                className="btn-ghost btn-inline"
                to={merchantRoute("service-bills")}
              >
                Service Bills
              </Link>
              {sessionCanCharge(session) ? (
                <Link className="btn-primary btn-inline" to={merchantRoute("charge")}>
                  Charge
                </Link>
              ) : null}
            </div>,
            topbarActionsSlot,
          )
        : null}

      <header className="pg-dash__hero">
        <div className="pg-dash__hero-top">
          <div className="pg-dash__hero-brand">
            <OrgBrandMark
              name={brandName}
              iconKey={homeOrg?.iconKey}
              size={104}
              className="merchant-dash__hero-mark"
            />
            <div className="pg-dash__hero-copy">
              <p className="pg-dash__eyebrow">Merchant</p>
              <h1 className="pg-dash__welcome">{brandName}</h1>
              <p className="pg-dash__lede">
                {`Here’s how your payments are doing · ${activePeriodLabel}.`}
              </p>
            </div>
          </div>
          <div className="pg-dash__hero-aside">
            <DashHeroHighlights />
            <div className="pg-dash__hero-toolbar">
              <DashPeriodControls
                options={DASHBOARD_PERIOD_OPTIONS}
                period={period}
                startDate={startDate}
                endDate={endDate}
                onPeriodSelect={onPeriodSelect}
                onStartDateChange={onStartDateChange}
                onEndDateChange={onEndDateChange}
                onRefresh={refreshDashboard}
                refreshing={loading && hasLoaded}
                disabled={loading}
              />
            </div>
          </div>
        </div>
        <DashHeroAura />
      </header>

      <div className="pg-dash__kpi-row merchant-dash__kpi-row" aria-busy={loading && !hasLoaded}>
        <DashKpiCard
          accent="teal"
          icon={<TransactionsReceiptIcon />}
          label="Total Transactions"
          value={<AnimatedMetric value={kpis.completedCount} />}
          trend={kpis.settledTrend}
          hint={`Settled · ${activePeriodLabel}`}
          href={merchantRoute("orders")}
          linkLabel="View Transactions"
        />
        <DashKpiCard
          accent="warn"
          icon={<OpenOrdersIcon />}
          label="Open Orders"
          value={<AnimatedMetric value={kpis.openWork} />}
          hint={
            kpis.expiringSoon > 0
              ? `Pending + verifying · ${kpis.expiringSoon} expiring soon`
              : "Pending + verifying"
          }
          href={merchantRoute("orders")}
          linkLabel="View Orders"
        />
        <DashKpiCard
          accent={kpis.anomalies > 0 ? "danger" : "ok"}
          icon={kpis.anomalies > 0 ? undefined : <AllClearIcon />}
          label="Attention"
          value={<AnimatedMetric value={kpis.anomalies} />}
          hint={
            kpis.anomalies > 0
              ? "Needs review"
              : kpis.openBills > 0
                ? `${kpis.openBills} open service bill${kpis.openBills === 1 ? "" : "s"}`
                : "All clear"
          }
          href={
            kpis.anomalies > 0
              ? merchantRoute("orders")
              : kpis.openBills > 0
                ? merchantRoute("service-bills")
                : undefined
          }
          linkLabel={kpis.anomalies > 0 ? "Review" : "View Bills"}
        />
        <DashKpiCard
          accent="gold"
          label="Platform Fee"
          value={
            <span className="pg-kpi__money">
              $<AnimatedMetric value={kpis.platformFee} decimals={2} />
            </span>
          }
          hint={`Est. ${commercial?.volumeFeePercent ?? "—"}% of volume · ${tierLabel(commercial?.tier)} tier`}
          footer={
            commercial ? (
              <span className="merchant-dash__fee-status">
                <span className={`merchant-dash__fee-badge is-${feeStatus.tone}`}>
                  {feeStatus.label}
                </span>
                <span className="merchant-dash__fee-schedule">{feeStatus.schedule}</span>
              </span>
            ) : null
          }
          href={merchantRoute("service-bills")}
          linkLabel="View Bills"
        />
        <div className="pg-feature" aria-label="Total volume">
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
            <p className="pg-feature__kicker">Total volume</p>
          </div>
          <p className="pg-feature__value">
            <AnimatedMetric value={kpis.volume} decimals={2} prefix="$" />
          </p>
          <p className="pg-feature__label">
            {`Completed · ${kpis.completedCount.toLocaleString()} settled · ${activePeriodLabel}`}
          </p>
          <Link to={merchantRoute("orders")} className="pg-feature__link">
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

      <div className="dash-split pg-dash__split merchant-dash__chart-split">
        <TransactionVolumePanel query={chartQuery} reloadToken={chartReloadToken} />
        <NetworksAssetsPanel reloadToken={pairsReloadToken} />
      </div>

      <div
        className={`merchant-dash__split merchant-dash__lists${
          siteRows.length === 0 || cashierRows.length === 0 ? " merchant-dash__split--single" : ""
        }`}
      >
        <SitesTable rows={siteRows} periodLabel={activePeriodLabel} />
        <CashiersTable
          rows={cashierRows}
          periodLabel={activePeriodLabel}
          invoicesHref={cashierInvoicesHref}
        />
      </div>
    </div>
  );
}

function TransactionsReceiptIcon() {
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

const OUTLINE_ICON = {
  width: 36,
  height: 36,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

/** Pending + verifying orders: waiting on payment. */
function OpenOrdersIcon() {
  return (
    <svg {...OUTLINE_ICON}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function AllClearIcon() {
  return (
    <svg {...OUTLINE_ICON}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.3 2.3 4.7-5" />
    </svg>
  );
}
