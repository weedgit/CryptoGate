import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import {
  ApiError,
  getMerchantCommercial,
  getNetworksStatus,
  listActiveNetworkMaintenance,
  listServiceBills,
  listSettlement,
  listXpub,
  type ActiveNetworkMaintenance,
  type MerchantCommercialSettings,
  type NetworkOrderabilityLamp,
  type OrgAccount,
  type PaymentOrder,
  type ServiceBill,
  type Session,
} from "./api";
import { getMerchantOrgs } from "./merchantOrgList";
import { getMerchantOrders, peekMerchantOrders } from "./merchantOrdersList";
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
import {
  DASHBOARD_PERIOD_OPTIONS,
  inWindow,
  parseDateInput,
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

function formatUsdtAmount(n: number): string {
  return n.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
}

function formatUsdt(n: number): string {
  return `${formatUsdtAmount(n)} USDT`;
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

  const [items, setItems] = useState<PaymentOrder[]>(
    () => peekMerchantOrders() ?? [],
  );
  const [bills, setBills] = useState<ServiceBill[]>([]);
  const [sites, setSites] = useState<OrgAccount[]>([]);
  const [commercial, setCommercial] = useState<MerchantCommercialSettings | null>(
    null,
  );
  const [maintenance, setMaintenance] = useState<ActiveNetworkMaintenance[]>(
    [],
  );
  const [settlementCooldown, setSettlementCooldown] = useState(0);
  const [xpubCooldown, setXpubCooldown] = useState(0);
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
  const [loading, setLoading] = useState(() => peekMerchantOrders() == null);
  const [error, setError] = useState<string | null>(null);
  const [topbarSlot, setTopbarSlot] = useState<HTMLElement | null>(null);
  const [topbarActionsSlot, setTopbarActionsSlot] = useState<HTMLElement | null>(
    null,
  );

  useLayoutEffect(() => {
    setTopbarSlot(document.getElementById("merchant-topbar-center"));
    setTopbarActionsSlot(document.getElementById("merchant-topbar-actions"));
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const ordersPromise = getMerchantOrders();
    const extraPromise =
      orgId && !cashierOnly
        ? Promise.all([
            listServiceBills().catch(() => [] as ServiceBill[]),
            getMerchantCommercial(orgId).catch(() => null),
            getMerchantOrgs().catch(() => [] as OrgAccount[]),
            listSettlement(orgId).catch(() => []),
            listXpub(orgId).catch(() => []),
          ]).then(([billList, commercialSettings, orgs, settlement, xpubs]) => {
            setBills(billList);
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
            setSettlementCooldown(
              settlement.filter((r) => r.status === "pending_cool_down")
                .length,
            );
            setXpubCooldown(
              xpubs.filter((r) => r.status === "pending_cool_down").length,
            );
          })
        : Promise.resolve().then(() => {
            setBills([]);
            setCommercial(null);
            setSites([]);
            setSettlementCooldown(0);
            setXpubCooldown(0);
          });
    const maintPromise = listActiveNetworkMaintenance()
      .then(setMaintenance)
      .catch(() => {
        setMaintenance([]);
      });
    const lampsPromise = getNetworksStatus()
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

    try {
      const [orders] = await Promise.all([
        ordersPromise,
        extraPromise,
        maintPromise,
        lampsPromise,
      ]);
      setItems(orders);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to load dashboard",
      );
    } finally {
      setLoading(false);
    }
  }, [orgId, parentId, cashierOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  const chartWindow = useMemo(() => {
    const from = parseDateInput(startDate, false);
    const to = parseDateInput(endDate, true);
    return { from, to };
  }, [startDate, endDate]);

  const periodOrders = useMemo(
    () =>
      items.filter((o) =>
        inWindow(orderTime(o), chartWindow.from, chartWindow.to),
      ),
    [items, chartWindow],
  );

  const activePeriodLabel = periodLabel(period, startDate, endDate);

  const kpis = useMemo(() => {
    const completed = periodOrders.filter(
      (o) => o.status === "completed" || o.status === "confirmed",
    );
    let volume = 0;
    for (const o of completed) {
      const n = Number(o.payableAmount.amount);
      if (Number.isFinite(n)) volume += n;
    }
    const feePct = Number(commercial?.volumeFeePercent);
    const platformFee =
      Number.isFinite(feePct) && feePct > 0 ? (volume * feePct) / 100 : 0;
    const openWork = items.filter(
      (o) => o.status === "pending_payment" || o.status === "verifying",
    ).length;
    const anomalies = items.filter((o) => o.status === "payment_anomaly").length;
    const now = Date.now();
    const expiringSoon = items.filter((o) => {
      if (o.status !== "pending_payment") return false;
      const exp = Date.parse(o.expiresAt);
      return Number.isFinite(exp) && exp > now && exp - now < 30 * 60 * 1000;
    }).length;
    const openBills = bills.filter(
      (b) => b.status === "issued" || b.status === "overdue",
    ).length;
    const overdueBills = bills.filter((b) => b.status === "overdue").length;
    return {
      volume,
      platformFee,
      openWork,
      anomalies,
      expiringSoon,
      openBills,
      overdueBills,
      completedCount: completed.length,
    };
  }, [periodOrders, items, bills, commercial]);

  const anomalyOrders = useMemo(
    () =>
      items
        .filter((o) => o.status === "payment_anomaly")
        .sort(
          (a, b) =>
            Date.parse(orderTime(b)) - Date.parse(orderTime(a)),
        )
        .slice(0, 8),
    [items],
  );

  const recent = useMemo(
    () =>
      [...items]
        .sort(
          (a, b) =>
            Date.parse(orderTime(b)) - Date.parse(orderTime(a)),
        )
        .slice(0, 8),
    [items],
  );

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
    return sites.map((site) => {
      const siteOrders = items.filter((o) => o.orgId === site.id);
      const inPeriod = siteOrders.filter((o) =>
        inWindow(orderTime(o), chartWindow.from, chartWindow.to),
      );
      let volume = 0;
      for (const o of inPeriod) {
        if (o.status !== "completed" && o.status !== "confirmed") continue;
        const n = Number(o.payableAmount.amount);
        if (Number.isFinite(n)) volume += n;
      }
      return {
        id: site.id,
        name: site.name,
        orders: inPeriod.length,
        volume,
        anomalies: siteOrders.filter((o) => o.status === "payment_anomaly")
          .length,
      };
    });
  }, [sites, items, chartWindow, cashierOnly]);

  const alertItems = useMemo(() => {
    const rows: Array<{ id: string; tone: "warn" | "danger"; body: string; to?: string }> =
      [];
    if (settlementCooldown > 0) {
      rows.push({
        id: "settlement-cooldown",
        tone: "warn",
        body: `Settlement address cool-down pending (${settlementCooldown}).`,
        to: merchantRoute("settlement"),
      });
    }
    if (xpubCooldown > 0) {
      rows.push({
        id: "xpub-cooldown",
        tone: "warn",
        body: `xPub change cool-down pending (${xpubCooldown}).`,
        to: merchantRoute("settlement"),
      });
    }
    for (const m of maintenance) {
      rows.push({
        id: `maint-${m.network}`,
        tone: "warn",
        body: `${networkShortLabel(m.network)}: ${
          m.message?.trim() ||
          "Deposits paused — network maintenance. New orders on this network are blocked."
        }${m.endsAt ? ` Until ${new Date(m.endsAt).toLocaleString()}.` : ""}`,
        to: merchantRoute("networks"),
      });
    }
    if (!cashierOnly && kpis.overdueBills > 0) {
      rows.push({
        id: "overdue-bills",
        tone: "danger",
        body: `${kpis.overdueBills} overdue service bill${kpis.overdueBills === 1 ? "" : "s"} — pay platform fees promptly.`,
        to: merchantRoute("service-bills"),
      });
    }
    if (kpis.anomalies > 0) {
      rows.push({
        id: "anomalies",
        tone: "danger",
        body: `${kpis.anomalies} payment anomal${kpis.anomalies === 1 ? "y" : "ies"} need review — Resolve with a note (no Mark paid).`,
        to: merchantRoute("orders"),
      });
    }
    return rows;
  }, [
    settlementCooldown,
    xpubCooldown,
    maintenance,
    cashierOnly,
    kpis.overdueBills,
    kpis.anomalies,
  ]);

  return (
    <div className="dash-page plat-dash merchant-dash">
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

      {alertItems.length > 0 ? (
        <div className="merchant-dash__alerts" role="region" aria-label="Alerts">
          {alertItems.map((a) => (
            <div
              key={a.id}
              className={`merchant-dash__alert merchant-dash__alert--${a.tone}`}
              role="status"
            >
              <p>{a.body}</p>
              {a.to ? (
                <Link className="merchant-dash__alert-link" to={a.to}>
                  Open
                </Link>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {loading ? (
        <p className="muted">Loading KPIs…</p>
      ) : (
        <div
          className={`merchant-dash__kpis${
            cashierOnly ? " merchant-dash__kpis--cashier" : ""
          }`}
        >
          <article className="merchant-dash__kpi merchant-dash__kpi--volume">
            <div className="merchant-dash__kpi-top">
              <span className="merchant-dash__kpi-icon" aria-hidden>
                <svg viewBox="0 0 20 20" width="28" height="28" fill="none">
                  <path
                    d="M3.5 14.5 8 10l3 3 5.5-6.5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M13.5 6.5H17v3.5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span className="merchant-dash__kpi-label">Completed volume</span>
            </div>
            <p className="merchant-dash__kpi-value merchant-dash__kpi-value--fund">
              <span className="merchant-dash__kpi-amount">
                {formatUsdtAmount(kpis.volume)}
              </span>
              <span className="merchant-dash__kpi-unit">USDT</span>
            </p>
            <p className="merchant-dash__kpi-foot">
              <span className="merchant-dash__kpi-pill">
                {kpis.completedCount} settled
              </span>
              <span>{activePeriodLabel}</span>
            </p>
          </article>

          {!cashierOnly ? (
            <article className="merchant-dash__kpi merchant-dash__kpi--fee">
              <div className="merchant-dash__kpi-top">
                <span className="merchant-dash__kpi-icon" aria-hidden>
                  <svg viewBox="0 0 20 20" width="28" height="28" fill="none">
                    <circle
                      cx="10"
                      cy="10"
                      r="6.5"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                    <path
                      d="M10 6.5v7M8 8.2c.5-.7 1.2-1 2-1 1.2 0 2 .6 2 1.6s-.8 1.5-2 1.5-2 .5-2 1.5.9 1.6 2 1.6c.8 0 1.5-.3 2-1"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <span className="merchant-dash__kpi-label">Platform fee</span>
              </div>
              <p className="merchant-dash__kpi-value merchant-dash__kpi-value--fund">
                <span className="merchant-dash__kpi-amount">
                  {formatUsdtAmount(kpis.platformFee)}
                </span>
                <span className="merchant-dash__kpi-unit">USDT</span>
              </p>
              <p className="merchant-dash__kpi-foot">
                <span className="merchant-dash__kpi-pill">
                  {commercial?.volumeFeePercent ?? "—"}% rate
                </span>
                <span>Est. · {activePeriodLabel}</span>
              </p>
            </article>
          ) : null}

          {!cashierOnly ? (
            <article className="merchant-dash__kpi merchant-dash__kpi--tier">
              <div className="merchant-dash__kpi-top">
                <span className="merchant-dash__kpi-icon" aria-hidden>
                  <svg viewBox="0 0 20 20" width="28" height="28" fill="none">
                    <path
                      d="M4 14.5 10 4.5l6 10H4Z"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M7.2 11.5h5.6"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <span className="merchant-dash__kpi-label">Tier</span>
              </div>
              <p className="merchant-dash__kpi-value">
                {tierLabel(commercial?.tier)}
              </p>
              <p className="merchant-dash__kpi-foot">
                <span className="merchant-dash__kpi-pill">Volume fee</span>
                <span>{commercial?.volumeFeePercent ?? "—"}% effective</span>
              </p>
            </article>
          ) : null}

          <article className="merchant-dash__kpi merchant-dash__kpi--open">
            <div className="merchant-dash__kpi-top">
              <span className="merchant-dash__kpi-icon" aria-hidden>
                <svg viewBox="0 0 20 20" width="28" height="28" fill="none">
                  <circle
                    cx="10"
                    cy="10"
                    r="6.5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  />
                  <path
                    d="M10 6.8V10l2.2 2.2"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span className="merchant-dash__kpi-label">Open orders</span>
            </div>
            <p className="merchant-dash__kpi-value">{kpis.openWork}</p>
            <p className="merchant-dash__kpi-foot">
              <span className="merchant-dash__kpi-pill">Live queue</span>
              <span>Pending + verifying</span>
            </p>
          </article>

          <article
            className={`merchant-dash__kpi merchant-dash__kpi--anomaly${
              kpis.anomalies > 0 ? " is-alert" : ""
            }`}
          >
            <div className="merchant-dash__kpi-top">
              <span className="merchant-dash__kpi-icon" aria-hidden>
                <svg viewBox="0 0 20 20" width="28" height="28" fill="none">
                  <path
                    d="M10 3.8 17.2 16H2.8L10 3.8Z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M10 8.2v3.4M10 13.8h.01"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <span className="merchant-dash__kpi-label">Anomalies</span>
            </div>
            <p className="merchant-dash__kpi-value">{kpis.anomalies}</p>
            <p className="merchant-dash__kpi-foot">
              <span className="merchant-dash__kpi-pill">
                {kpis.anomalies > 0 ? "Needs review" : "Clear"}
              </span>
              <span>
                {cashierOnly
                  ? kpis.expiringSoon > 0
                    ? `${kpis.expiringSoon} expiring soon`
                    : "Resolve with a note"
                  : kpis.openBills > 0
                    ? `${kpis.openBills} open service bill${
                        kpis.openBills === 1 ? "" : "s"
                      }`
                    : "Resolve with a note"}
              </span>
            </p>
          </article>
        </div>
      )}

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
          {loading ? (
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
            <h2>Open anomalies</h2>
            <Link
              className="plat-dash-merchants__all"
              to={merchantRoute("orders")}
            >
              View all
            </Link>
          </div>
          {loading ? (
            <p className="muted plat-dash-merchants__empty">Loading…</p>
          ) : anomalyOrders.length === 0 ? (
            <p className="muted plat-dash-merchants__empty">
              No open payment anomalies.
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
                <span className="mono">{formatUsdt(s.volume)}</span>
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
