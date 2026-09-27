import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import {
  ApiError,
  getMerchantCommercial,
  getNetworksStatus,
  listActiveNetworkMaintenance,
  listOrders,
  type ActiveNetworkMaintenance,
  type MerchantCommercialSettings,
  type NetworkOrderabilityLamp,
  type OrgAccount,
  type PaymentOrder,
  type Session,
} from "./api";
import { getMerchantOrgs, peekMerchantOrgs } from "./merchantOrgList";
import {
  getDashboardKpis,
  peekDashboardKpis,
  type DashboardKpis,
} from "../shared/dashboardApi";
import { matchingModeLabel } from "./matchingLabels";
import {
  anomalyExplain,
  formatShortTime,
  orderStatusLabel,
  orderStatusTone,
} from "./orderStatus";
import {
  parentMerchantOrgId,
  primaryMerchantOrgId,
  sessionIsCashierOnly,
  truncateAddress,
} from "./org";
import { AuthToast } from "../auth/AuthToast";
import { AssetIcon, NetworkIcon } from "../platform/cryptoIcons";
import { networkShortLabel, visibleRegistry } from "../shared/assetNetworks";
import { NetworkStatusLamp } from "../shared/NetworkStatusLamp";
import { computeOrderabilityLamp, pendingOrderabilityLamp, type NetworkLamp } from "../shared/networkLamp";
import { StatusBadge } from "../shared/StatusBadge";
import { merchantRoute } from "../shared/portalRouting";
import { AnimatedMetric } from "../shared/AnimatedMetric";
import { OrgBrandMark } from "../shared/OrgBrandMark";
import { DashKpiCard } from "../platform/ui/DashKpiCard";
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

type SiteRow = {
  id: string;
  name: string;
  orders: number;
  volume: number;
  anomalies: number;
};

function orderTime(o: PaymentOrder): string {
  return o.createdAt || o.expiresAt;
}

function formatUsdAmount(n: number): string {
  return n.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
}

function formatUsd(n: number): string {
  return `${formatUsdAmount(n)} USD`;
}

function tierLabel(tier: string | undefined): string {
  if (!tier) return "—";
  if (tier === "small") return "Small";
  if (tier === "mid") return "Mid";
  if (tier === "enterprise") return "Enterprise";
  return tier;
}

/** D1 — Merchant dashboard (ops board). Cashier sees scoped KPIs + own orders. */
export function DashboardPage({ session }: Props) {
  const navigate = useNavigate();
  const orgId = useMemo(() => primaryMerchantOrgId(session), [session]);
  const parentId = useMemo(() => parentMerchantOrgId(session), [session]);
  const cashierOnly = useMemo(() => sessionIsCashierOnly(session), [session]);

  const [recent, setRecent] = useState<PaymentOrder[]>([]);
  const [anomalyOrders, setAnomalyOrders] = useState<PaymentOrder[]>([]);
  const [sites, setSites] = useState<OrgAccount[]>([]);
  const [homeOrg, setHomeOrg] = useState<OrgAccount | null>(
    () => peekMerchantOrgs()?.find((o) => o.id === orgId) ?? null,
  );
  const [commercial, setCommercial] = useState<MerchantCommercialSettings | null>(
    null,
  );
  const [maintenance, setMaintenance] = useState<ActiveNetworkMaintenance[]>(
    [],
  );
  const [lampByPair, setLampByPair] = useState<Map<
    string,
    NetworkOrderabilityLamp
  > | null>(null);

  const [period, setPeriod] = useState<DashboardPeriodId | "custom">("mtd");
  const [startDate, setStartDate] = useState(() =>
    toDateInputValue(periodWindow("mtd").from),
  );
  const [endDate, setEndDate] = useState(() =>
    toDateInputValue(periodWindow("mtd").to),
  );
  const [dashKpis, setDashKpis] = useState<DashboardKpis | null>(() =>
    peekDashboardKpis({ from: startDate, to: endDate }),
  );
  const [loading, setLoading] = useState(() => dashKpis == null);
  const [hasLoaded, setHasLoaded] = useState(() => dashKpis != null);
  const [error, setError] = useState<string | null>(null);
  const [topbarSlot, setTopbarSlot] = useState<HTMLElement | null>(null);
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
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  useLayoutEffect(() => {
    setTopbarSlot(document.getElementById("platform-topbar-center"));
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
      const cached = fresh ? null : peekDashboardKpis({ from: startDate, to: endDate });
      if (cached) {
        setDashKpis(cached);
        setHasLoaded(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        setDashKpis(await getDashboardKpis({ from: startDate, to: endDate, fresh }));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load dashboard");
      } finally {
        setLoading(false);
        setHasLoaded(true);
      }
    },
    [startDate, endDate],
  );

  useEffect(() => {
    void loadKpis();
  }, [loadKpis]);

  /** Latest rows only — the lists show 8 each. */
  const loadRecentOrders = useCallback(async () => {
    const [latest, attention] = await Promise.all([
      listOrders({ limit: 8 }).catch(() => null),
      listOrders({ status: "payment_anomaly", limit: 8 }).catch(() => null),
    ]);
    if (latest) setRecent(latest);
    if (attention) setAnomalyOrders(attention);
  }, []);

  const load = useCallback(async () => {
    void loadRecentOrders();

    if (orgId && !cashierOnly) {
      void Promise.all([
        getMerchantCommercial(orgId).catch(() => null),
        getMerchantOrgs().catch(() => [] as OrgAccount[]),
      ])
        .then(([commercialSettings, orgs]) => {
          setCommercial(commercialSettings);
          const root = parentId ?? orgId;
          setSites(
            orgs.filter(
              (o) =>
                o.type === "merchant" &&
                o.parentId === root &&
                o.id !== root,
            ),
          );
        })
        .catch(() => undefined);
    } else {
      setCommercial(null);
      setSites([]);
    }

    void listActiveNetworkMaintenance()
      .then(setMaintenance)
      .catch(() => {
        setMaintenance([]);
      });

    void getNetworksStatus()
      .then((status) => {
        const byPair = new Map<string, NetworkOrderabilityLamp>();
        for (const net of status.items) {
          for (const pair of net.pairs) {
            byPair.set(`${pair.asset}:${net.network}`, pair.lamp);
          }
        }
        setLampByPair(byPair);
      })
      .catch(() => {
        setLampByPair(new Map());
      });
  }, [orgId, parentId, cashierOnly, loadRecentOrders]);

  useEffect(() => {
    void load();
  }, [load]);

  const softRevalidateLiveSlices = useCallback(
    async (slices: DashboardLiveSlice[]) => {
      try {
        if (
          slices.includes("volume") ||
          slices.includes("anomalies") ||
          slices.includes("serviceBills")
        ) {
          await Promise.all([loadKpis(true), loadRecentOrders()]);
        }
        if (slices.includes("networks")) {
          await Promise.all([
            listActiveNetworkMaintenance()
              .then(setMaintenance)
              .catch(() => undefined),
            getNetworksStatus()
              .then((status) => {
                const byPair = new Map<string, NetworkOrderabilityLamp>();
                for (const net of status.items) {
                  for (const pair of net.pairs) {
                    byPair.set(`${pair.asset}:${net.network}`, pair.lamp);
                  }
                }
                setLampByPair(byPair);
              })
              .catch(() => undefined),
          ]);
        }
      } catch {
        // Keep last good SWR snapshot.
      }
    },
    [loadKpis, loadRecentOrders],
  );

  useDashboardLiveEvents({
    enabled: hasLoaded,
    debounceMs: 5_000,
    onSlices: (slices) => {
      void softRevalidateLiveSlices(slices);
    },
  });

  const activePeriodLabel = periodLabel(period, startDate, endDate);

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
    };
  }, [dashKpis, commercial]);

  const networkPairs = useMemo(() => {
    return [...visibleRegistry()]
      .filter((p) => p.enabled)
      .sort((a, b) =>
        networkShortLabel(a.network).localeCompare(networkShortLabel(b.network)),
      );
  }, []);

  const siteNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sites) map.set(s.id, s.name);
    return map;
  }, [sites]);

  const orderWhere = useCallback(
    (o: PaymentOrder): string => {
      const named = o.orgName?.trim();
      if (named) return named;
      if (o.orgId && siteNameById.has(o.orgId)) {
        return siteNameById.get(o.orgId)!;
      }
      return "Merchant";
    },
    [siteNameById],
  );

  const siteRows = useMemo((): SiteRow[] => {
    if (cashierOnly || sites.length === 0) return [];
    const byOrg = new Map((dashKpis?.byOrg ?? []).map((r) => [r.orgId, r]));
    return sites.map((site) => {
      const row = byOrg.get(site.id);
      return {
        id: site.id,
        name: site.name,
        orders: row?.orders ?? 0,
        volume: row?.volumeUsd ?? 0,
        anomalies: row?.anomalies ?? 0,
      };
    });
  }, [sites, dashKpis, cashierOnly]);

  const brandName = homeOrg?.name ?? (cashierOnly ? "Cashier" : "Merchant");

  return (
    <div className="dash-page plat-dash pg-dash merchant-dash">
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />

      {topbarActionsSlot
        ? createPortal(
            <div
              className="org-agents__actions plat-orders-topbar__actions"
              aria-label="Dashboard actions"
            >
              {!cashierOnly ? (
                <Link
                  className="btn-ghost btn-inline"
                  to={merchantRoute("service-bills")}
                >
                  Service Bills
                </Link>
              ) : (
                <Link className="btn-ghost btn-inline" to={merchantRoute("orders")}>
                  My orders
                </Link>
              )}
              <Link className="btn-primary btn-inline" to={merchantRoute("orders/new")}>
                + {cashierOnly ? "Create Order" : "Create Payment Order"}
              </Link>
            </div>,
            topbarActionsSlot,
          )
        : null}

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
                {DASHBOARD_PERIOD_OPTIONS.map((opt) => (
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

      <header className="pg-dash__hero">
        <div className="pg-dash__hero-top">
          <div className="pg-dash__hero-brand">
            <OrgBrandMark
              name={brandName}
              iconKey={homeOrg?.iconKey}
              size={88}
              className="merchant-dash__hero-mark"
            />
            <div className="pg-dash__hero-copy">
              <p className="pg-dash__eyebrow">
                {cashierOnly ? "Cashier terminal" : "Merchant"}
              </p>
              <h1 className="pg-dash__welcome">{brandName}</h1>
              <p className="pg-dash__lede">
                {cashierOnly
                  ? "Your orders and anything that needs attention right now."
                  : `Here’s how your payments are doing · ${activePeriodLabel}.`}
              </p>
            </div>
          </div>
        </div>
      </header>

      <div
        className={`pg-dash__status-row${
          cashierOnly ? " merchant-dash__status-row--cashier" : ""
        }`}
        aria-busy={loading && !hasLoaded}
      >
        <DashKpiCard
          accent="violet"
          label="Completed volume"
          value={
            <span className="pg-kpi__money">
              $<AnimatedMetric value={kpis.volume} decimals={2} />
            </span>
          }
          hint={`${kpis.completedCount.toLocaleString()} settled · ${activePeriodLabel}`}
          href={merchantRoute("orders")}
          linkLabel="View"
          linkWithTitle
        />
        {!cashierOnly ? (
          <DashKpiCard
            accent="gold"
            label="Platform fee"
            value={
              <span className="pg-kpi__money">
                $<AnimatedMetric value={kpis.platformFee} decimals={2} />
              </span>
            }
            hint={`Est. · ${commercial?.volumeFeePercent ?? "—"}% rate`}
            href={merchantRoute("service-bills")}
            linkLabel="Bills"
            linkWithTitle
          />
        ) : null}
        {!cashierOnly ? (
          <DashKpiCard
            accent="slate"
            label="Tier"
            value={tierLabel(commercial?.tier)}
            hint={`${commercial?.volumeFeePercent ?? "—"}% effective volume fee`}
          />
        ) : null}
        <DashKpiCard
          accent="warn"
          label="Open orders"
          value={<AnimatedMetric value={kpis.openWork} />}
          hint="Pending + verifying"
        />
        <DashKpiCard
          accent={kpis.anomalies > 0 ? "danger" : "ok"}
          label="Attention"
          value={<AnimatedMetric value={kpis.anomalies} />}
          hint={
            kpis.anomalies > 0
              ? "Needs review"
              : cashierOnly
                ? kpis.expiringSoon > 0
                  ? `${kpis.expiringSoon} expiring soon`
                  : "All clear"
                : kpis.openBills > 0
                  ? `${kpis.openBills} open service bill${
                      kpis.openBills === 1 ? "" : "s"
                    }`
                  : "All clear"
          }
          href={kpis.anomalies > 0 ? merchantRoute("orders") : undefined}
          linkLabel="Review"
          linkWithTitle
        />
      </div>

      {!cashierOnly && networkPairs.length > 0 ? (
        <section className="merchant-dash__networks" aria-label="Network status">
          <div className="plat-dash-merchants__head">
            <h2>Network status</h2>
            <Link className="plat-dash-merchants__all" to={merchantRoute("networks")}>
              View networks
            </Link>
          </div>
          <div className="merchant-dash__net-strip">
            {networkPairs.map((pair) => {
              const lamp: NetworkLamp = lampByPair
                ? ((lampByPair.get(`${pair.asset}:${pair.network}`) ??
                    computeOrderabilityLamp({
                      enabled: pair.enabled,
                      maintenanceActive: maintenance.some(
                        (m) => m.network === pair.network,
                      ),
                      ingestStatus: "unknown",
                    })) as NetworkLamp)
                : pendingOrderabilityLamp(pair.enabled);
              return (
                <div
                  key={`${pair.asset}:${pair.network}`}
                  className="merchant-dash__net-chip"
                >
                  <span className="merchant-dash__net-chip-icons">
                    <AssetIcon asset={pair.asset} />
                    <NetworkIcon network={pair.network} />
                  </span>
                  <span className="merchant-dash__net-chip-text">
                    <span className="merchant-dash__net-chip-title">
                      {pair.asset} · {networkShortLabel(pair.network)}
                    </span>
                    <NetworkStatusLamp lamp={lamp} />
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="merchant-dash__split">
        <section className="merchant-dash-orders">
          <div className="plat-dash-merchants__head">
            <h2>Recent payment orders</h2>
            <Link className="plat-dash-merchants__all" to={merchantRoute("orders")}>
              View all
            </Link>
          </div>
          {loading && !hasLoaded ? (
            <p className="muted plat-dash-merchants__empty">Loading orders…</p>
          ) : recent.length === 0 ? (
            <p className="muted plat-dash-merchants__empty">
              {cashierOnly
                ? "No orders yet. Create one to issue a QR."
                : "No payment orders yet."}
            </p>
          ) : (
            <div className="merchant-dash-orders__scroll">
              <div className="orders-table merchant-dash-orders__table" role="table">
              <div className="orders-head" role="row">
                <span>ORDER</span>
                <span>DATE</span>
                <span>WHERE</span>
                <span>AMOUNT</span>
                <span>NETWORK</span>
                <span>MODE</span>
                <span>STATUS</span>
              </div>
              {recent.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className="orders-row"
                  role="row"
                  onClick={() => navigate(merchantRoute(`orders/${o.id}`))}
                >
                  <span className="mono">{o.orderNumber}</span>
                  <span className="muted">
                    {formatShortTime(orderTime(o))}
                  </span>
                  <span className="merchant-dash__where" title={orderWhere(o)}>
                    {orderWhere(o)}
                  </span>
                  <span>
                    {o.payableAmount.amount} {o.asset}
                  </span>
                  <span className="merchant-dash__order-net">
                    <NetworkIcon network={o.network} />
                    <span>{networkShortLabel(o.network)}</span>
                  </span>
                  <span className="muted">{matchingModeLabel(o.matchingMode)}</span>
                  <span>
                    <StatusBadge
                      tone={orderStatusTone(o.status, o)}
                      live={o.status === "verifying"}
                      alarm={o.status === "payment_anomaly"}
                    >
                      {orderStatusLabel(o.status, o)}
                    </StatusBadge>
                  </span>
                </button>
              ))}
              </div>
            </div>
          )}
        </section>

        <section className="merchant-dash-anomalies">
          <div className="plat-dash-merchants__head">
            <h2>Open Attention</h2>
            <Link
              className="plat-dash-merchants__all"
              to={merchantRoute("orders")}
            >
              View all
            </Link>
          </div>
          {loading && !hasLoaded ? (
            <p className="muted plat-dash-merchants__empty">Loading…</p>
          ) : anomalyOrders.length === 0 ? (
            <p className="muted plat-dash-merchants__empty">
              No open invoices need Attention.
            </p>
          ) : (
            <ul className="merchant-dash-anomalies__list">
              {anomalyOrders.map((o) => {
                const explain = anomalyExplain({
                  reason: o.anomalyReason,
                  matchingMode: o.matchingMode,
                  payableAmount: o.payableAmount?.amount,
                  receivedAmount: o.receivedAmount?.amount,
                  hasTx: Boolean(o.receivedAmount?.amount),
                });
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      className="merchant-dash-anomalies__row"
                      onClick={() => navigate(merchantRoute(`orders/${o.id}`))}
                    >
                      <div className="merchant-dash-anomalies__top">
                        <span className="mono">#{o.orderNumber}</span>
                        <span className="muted">
                          {formatShortTime(orderTime(o))}
                        </span>
                      </div>
                      <p className="merchant-dash-anomalies__title">
                        {explain.title}
                      </p>
                      <p className="merchant-dash-anomalies__meta muted">
                        {o.payableAmount.amount} {o.asset} ·{" "}
                        {networkShortLabel(o.network)}
                        {o.receiveAddress
                          ? ` · ${truncateAddress(o.receiveAddress)}`
                          : ""}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {!cashierOnly && siteRows.length > 0 ? (
        <section className="merchant-dash-sites">
          <div className="plat-dash-merchants__head">
            <h2>Sites</h2>
            <Link className="plat-dash-merchants__all" to={merchantRoute("sites")}>
              View sites
            </Link>
          </div>
          <div className="merchant-dash-orders__scroll">
            <div className="orders-table merchant-dash-orders__table" role="table">
            <div className="orders-head merchant-dash-sites__head" role="row">
              <span>SITE</span>
              <span>ORDERS</span>
              <span>VOLUME</span>
              <span>ANOMALIES</span>
            </div>
            {siteRows.map((s) => (
              <button
                key={s.id}
                type="button"
                className="orders-row merchant-dash-sites__row"
                role="row"
                onClick={() => navigate(merchantRoute(`sites/${s.id}`))}
              >
                <span>{s.name}</span>
                <span className="mono">{s.orders}</span>
                <span className="mono">{formatUsd(s.volume)}</span>
                <span className="mono">{s.anomalies}</span>
              </button>
            ))}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
