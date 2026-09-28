import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useViewerTimeZone } from "../shared/useViewerTimeZone";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  ApiError,
  listOrders,
  type ActiveNetworkMaintenance,
  type NetworkOrderabilityLamp,
  type OrgAccount,
  type PaymentOrder,
  type Session,
} from "./api";
import {
  MERCHANT_ORGS_UPDATED_EVENT,
  getMerchantOrgs,
  peekMerchantOrgs,
} from "./merchantOrgList";
import { primaryMerchantOrgId, sitesInMerchantSubtree } from "./org";
import { AttentionQueue } from "./dashboard/AttentionQueue";
import { ChannelBreakdown } from "./dashboard/ChannelBreakdown";
import { CashiersTable } from "./dashboard/CashiersTable";
import { mergeCashierRows } from "./dashboard/cashierRows";
import { useCashierMembers } from "./dashboard/useCashierMembers";
import { useWorkspaceScopeOrgId, workspaceOrderScope } from "./workspace";
import { NetworkStatusStrip } from "./dashboard/NetworkStatusStrip";
import { RecentOrdersTable } from "./dashboard/RecentOrdersTable";
import { SitesTable, type SiteRow } from "./dashboard/SitesTable";
import { loadNetworkLamps, loadNetworkMaintenance } from "./dashboard/networkLamps";
import {
  getDashboardKpis,
  getDashboardReports,
  peekDashboardKpis,
  peekDashboardReports,
  type DashboardKpis,
  type DashboardReports,
} from "../shared/dashboardApi";
import { AuthToast } from "../auth/AuthToast";
import { merchantRoute } from "../shared/portalRouting";
import { AnimatedMetric } from "../shared/AnimatedMetric";
import { OrgBrandMark } from "../shared/OrgBrandMark";
import { DashKpiCard } from "../platform/ui/DashKpiCard";
import { DashHeroAura, DashPeriodControls } from "../platform/ui/DashHero";
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

/**
 * Site home — "is my location running well today?": live queue, cashiers,
 * and the settlement wallet inherited from the parent merchant (read-only).
 */
export function SiteHomePage({ session }: Props) {
  const siteId = useMemo(() => primaryMerchantOrgId(session), [session]);
  const scopeOrgId = useWorkspaceScopeOrgId(siteId);

  const [orgs, setOrgs] = useState<OrgAccount[]>(() => peekMerchantOrgs() ?? []);
  const [liveOrders, setLiveOrders] = useState<PaymentOrder[]>([]);
  const [anomalyOrders, setAnomalyOrders] = useState<PaymentOrder[]>([]);
  const [maintenance, setMaintenance] = useState<ActiveNetworkMaintenance[]>([]);
  const [lampByPair, setLampByPair] = useState<Map<
    string,
    NetworkOrderabilityLamp
  > | null>(null);

  const tz = useViewerTimeZone();
  const [period, setPeriod] = useState<DashboardPeriodId | "custom">("today");
  const [startDate, setStartDate] = useState(() =>
    toDateInputValue(periodWindow("today").from),
  );
  const [endDate, setEndDate] = useState(() =>
    toDateInputValue(periodWindow("today").to),
  );
  const [dashKpis, setDashKpis] = useState<DashboardKpis | null>(() =>
    peekDashboardKpis({ from: startDate, to: endDate, orgId: scopeOrgId, tz }),
  );
  const [reports, setReports] = useState<DashboardReports | null>(() =>
    peekDashboardReports({ from: startDate, to: endDate, orgId: scopeOrgId, tz }),
  );
  const [loading, setLoading] = useState(() => dashKpis == null);
  const [hasLoaded, setHasLoaded] = useState(() => dashKpis != null);
  const [error, setError] = useState<string | null>(null);
  const [topbarActionsSlot, setTopbarActionsSlot] = useState<HTMLElement | null>(
    null,
  );

  useLayoutEffect(() => {
    setTopbarActionsSlot(document.getElementById("platform-topbar-actions"));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getMerchantOrgs()
      .then((rows) => {
        if (!cancelled) setOrgs(rows);
      })
      .catch(() => {});
    const onUpdated = (e: Event) => {
      const rows = (e as CustomEvent<OrgAccount[]>).detail;
      if (!cancelled && Array.isArray(rows)) setOrgs(rows);
    };
    window.addEventListener(MERCHANT_ORGS_UPDATED_EVENT, onUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener(MERCHANT_ORGS_UPDATED_EVENT, onUpdated);
    };
  }, []);

  const site = useMemo(
    () => (siteId ? orgs.find((o) => o.id === siteId) ?? null : null),
    [orgs, siteId],
  );
  const parentName = useMemo(() => {
    const parent = site?.parentId ? orgs.find((o) => o.id === site.parentId) : null;
    return parent?.name ?? null;
  }, [orgs, site]);
  const childSites = useMemo(
    () => (siteId ? sitesInMerchantSubtree(orgs, siteId) : []),
    [orgs, siteId],
  );

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

  const loadPeriod = useCallback(
    async (fresh = false) => {
      const q = { from: startDate, to: endDate, orgId: scopeOrgId, tz };
      const cached = fresh ? null : peekDashboardKpis(q);
      if (cached) {
        setDashKpis(cached);
        setHasLoaded(true);
      } else {
        setLoading(true);
      }
      setError(null);
      void getDashboardReports({ ...q, fresh })
        .then(setReports)
        .catch(() => undefined);
      try {
        setDashKpis(await getDashboardKpis({ ...q, fresh }));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load site dashboard");
      } finally {
        setLoading(false);
        setHasLoaded(true);
      }
    },
    [startDate, endDate, scopeOrgId, tz],
  );

  /** Live queue ignores the period — open orders matter whenever they were created. */
  const loadQueues = useCallback(async () => {
    const scope = workspaceOrderScope(scopeOrgId);
    const [open, attention] = await Promise.all([
      listOrders({ status: "open", limit: 8, ...scope }).catch(() => null),
      listOrders({ status: "payment_anomaly", limit: 8, ...scope }).catch(() => null),
    ]);
    if (open) setLiveOrders(open);
    if (attention) setAnomalyOrders(attention);
  }, [scopeOrgId]);

  const loadNetworks = useCallback(async () => {
    const [nextMaintenance, lamps] = await Promise.all([
      loadNetworkMaintenance(),
      loadNetworkLamps(),
    ]);
    setMaintenance(nextMaintenance);
    setLampByPair(lamps);
  }, []);

  useEffect(() => {
    void loadPeriod();
  }, [loadPeriod]);

  useEffect(() => {
    void loadQueues();
    void loadNetworks();
  }, [loadQueues, loadNetworks]);

  const refresh = useCallback(() => {
    void loadPeriod(true);
    void loadQueues();
    void loadNetworks();
  }, [loadPeriod, loadQueues, loadNetworks]);

  useDashboardLiveEvents({
    enabled: hasLoaded,
    debounceMs: 5_000,
    onSlices: (slices: DashboardLiveSlice[]) => {
      if (slices.includes("volume") || slices.includes("anomalies")) {
        void loadPeriod(true);
        void loadQueues();
      }
      if (slices.includes("networks")) void loadNetworks();
    },
  });

  const activePeriodLabel = periodLabel(period, startDate, endDate);
  const siteName = site?.name ?? "Site";
  const initialLoading = loading && !hasLoaded;

  const volume = dashKpis?.orders.volumeUsd ?? 0;
  const settled = dashKpis?.orders.settled ?? 0;
  const open = dashKpis?.orders.open ?? 0;
  const expiringSoon = dashKpis?.orders.expiringSoon ?? 0;
  const anomalies = dashKpis?.orders.anomalies ?? 0;

  const siteRows = useMemo((): SiteRow[] => {
    const byOrg = new Map((dashKpis?.byOrg ?? []).map((r) => [r.orgId, r]));
    return childSites.map((s) => {
      const row = byOrg.get(s.id);
      return {
        id: s.id,
        name: s.name,
        orders: row?.orders ?? 0,
        volume: row?.volumeUsd ?? 0,
        anomalies: row?.anomalies ?? 0,
      };
    });
  }, [childSites, dashKpis]);

  const cashierOrgIds = useMemo(
    () => (siteId ? [siteId, ...childSites.map((s) => s.id)] : []),
    [siteId, childSites],
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

  const orderWhere = (o: PaymentOrder) => o.orgName?.trim() || siteName;

  return (
    <div className="dash-page plat-dash pg-dash merchant-dash site-dash">
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />

      {topbarActionsSlot
        ? createPortal(
            <div
              className="org-agents__actions plat-orders-topbar__actions"
              aria-label="Dashboard actions"
            >
              <Link className="btn-ghost btn-inline" to={merchantRoute("orders")}>
                Invoices
              </Link>
              <Link className="btn-primary btn-inline" to={merchantRoute("orders/new")}>
                + Create Payment Order
              </Link>
            </div>,
            topbarActionsSlot,
          )
        : null}

      <header className="pg-dash__hero">
        <div className="pg-dash__hero-top">
          <div className="pg-dash__hero-brand">
            <OrgBrandMark
              name={siteName}
              iconKey={site?.iconKey}
              size={104}
              className="merchant-dash__hero-mark"
            />
            <div className="pg-dash__hero-copy">
              <p className="pg-dash__eyebrow">Site</p>
              <h1 className="pg-dash__welcome">{siteName}</h1>
              <p className="pg-dash__lede">
                {period === "today"
                  ? "Today at this location — live orders, cashiers, and anything that needs you."
                  : `How this location is doing · ${activePeriodLabel}.`}
              </p>
            </div>
          </div>
          <div className="pg-dash__hero-aside">
            <div className="pg-dash__hero-toolbar">
              <DashPeriodControls
                options={DASHBOARD_PERIOD_OPTIONS}
                period={period}
                startDate={startDate}
                endDate={endDate}
                onPeriodSelect={onPeriodSelect}
                onStartDateChange={onStartDateChange}
                onEndDateChange={onEndDateChange}
                onRefresh={refresh}
                refreshing={loading && hasLoaded}
                disabled={loading}
              />
            </div>
          </div>
        </div>
        <DashHeroAura />
      </header>

      <p className="site-dash__settlement" role="note">
        <span className="site-dash__settlement-dot" aria-hidden />
        <span>
          Payments settle directly to{" "}
          <strong>{parentName ? `${parentName}’s` : "the parent merchant’s"}</strong>{" "}
          wallet. Sites inherit the wallet, xPub, and matching mode — only the merchant
          can change them.
        </span>
        <Link className="site-dash__settlement-link" to={merchantRoute("settings/settlement")}>
          View settlement
        </Link>
      </p>

      <div
        className="pg-dash__status-row merchant-dash__status-row--site"
        aria-busy={initialLoading}
      >
        <DashKpiCard
          accent="violet"
          label={period === "today" ? "Today’s volume" : "Completed volume"}
          value={
            <span className="pg-kpi__money">
              $<AnimatedMetric value={volume} decimals={2} />
            </span>
          }
          hint={`${settled.toLocaleString()} settled · ${activePeriodLabel}`}
          href={merchantRoute("orders")}
          linkLabel="View"
          linkWithTitle
        />
        <DashKpiCard
          accent="warn"
          label="Open orders"
          value={<AnimatedMetric value={open} />}
          hint="Waiting for payment or confirmations"
        />
        <DashKpiCard
          accent={expiringSoon > 0 ? "gold" : "slate"}
          label="Expiring soon"
          value={<AnimatedMetric value={expiringSoon} />}
          hint={expiringSoon > 0 ? "Customer may need a new QR" : "Nothing about to expire"}
        />
        <DashKpiCard
          accent={anomalies > 0 ? "danger" : "ok"}
          label="Attention"
          value={<AnimatedMetric value={anomalies} />}
          hint={anomalies > 0 ? "Under/overpaid or late — review" : "All clear"}
          href={anomalies > 0 ? merchantRoute("orders") : undefined}
          linkLabel="Review"
          linkWithTitle
        />
      </div>

      <div className="merchant-dash__split">
        <RecentOrdersTable
          title="Live orders"
          orders={liveOrders}
          loading={initialLoading}
          emptyText="No open orders right now."
          whereLabel={orderWhere}
        />
        <AttentionQueue orders={anomalyOrders} loading={initialLoading} />
      </div>

      <ChannelBreakdown byChannel={reports?.byChannel} periodLabel={activePeriodLabel} />

      <CashiersTable
        rows={cashierRows}
        periodLabel={activePeriodLabel}
        invoicesHref={cashierInvoicesHref}
      />

      <NetworkStatusStrip lampByPair={lampByPair} maintenance={maintenance} />

      <SitesTable rows={siteRows} />
    </div>
  );
}
