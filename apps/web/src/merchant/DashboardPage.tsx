import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import {
  VolumeChart,
  type VolumeChartZoomApi,
} from "../platform/DashboardPage";
import { ChartHelpButton } from "../platform/ui/ChartHelpButton";
import {
  ChartMaximizeButton,
  ChartMaximizeOverlay,
} from "../platform/ui/ChartMaximize";
import {
  ApiError,
  listOrders,
  listServiceBills,
  type PaymentOrder,
  type ServiceBill,
  type Session,
} from "./api";
import { matchingModeLabel } from "./matchingLabels";
import {
  formatShortTime,
  orderStatusLabel,
  orderStatusTone,
} from "./orderStatus";
import {
  networkLabel,
  primaryMerchantOrgId,
  sessionIsCashierOnly,
  truncateAddress,
} from "./org";
import { StatusBadge } from "../shared/StatusBadge";
import {
  buildDayKeys,
  DASHBOARD_PERIOD_OPTIONS,
  dayKeyFromIso,
  inWindow,
  parseDateInput,
  periodLabel,
  periodWindow,
  toDateInputValue,
  type DashboardPeriodId,
} from "../shared/dashboardPeriod";

type Props = { session: Session };

function formatUsd(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function volumeChartData(
  orders: PaymentOrder[],
  keys: string[],
  from: Date,
  to: Date,
): {
  series: number[];
  dayLabels: string[];
  chartPeriodTotal: number;
} {
  const map = new Map(keys.map((day) => [day, 0]));
  let chartPeriodTotal = 0;
  for (const o of orders) {
    if (o.status !== "completed" && o.status !== "confirmed") continue;
    if (!inWindow(o.expiresAt, from, to)) continue;
    const key = dayKeyFromIso(o.expiresAt);
    if (!key || !map.has(key)) continue;
    const n = Number(o.payableAmount.amount);
    if (Number.isFinite(n)) {
      map.set(key, (map.get(key) ?? 0) + n);
      chartPeriodTotal += n;
    }
  }
  return {
    series: keys.map((day) => map.get(day) ?? 0),
    dayLabels: keys,
    chartPeriodTotal,
  };
}

export function DashboardPage({ session }: Props) {
  const navigate = useNavigate();
  const orgId = useMemo(() => primaryMerchantOrgId(session), [session]);
  const cashierOnly = useMemo(() => sessionIsCashierOnly(session), [session]);
  const [items, setItems] = useState<PaymentOrder[]>([]);
  const [bills, setBills] = useState<ServiceBill[]>([]);
  const [period, setPeriod] = useState<DashboardPeriodId | "custom">("7d");
  const [startDate, setStartDate] = useState(() =>
    toDateInputValue(periodWindow("7d").from),
  );
  const [endDate, setEndDate] = useState(() =>
    toDateInputValue(periodWindow("7d").to),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topbarSlot, setTopbarSlot] = useState<HTMLElement | null>(null);
  const [volumeZoomed, setVolumeZoomed] = useState(false);
  const [volumeMaximized, setVolumeMaximized] = useState(false);
  const [volumeFsZoomed, setVolumeFsZoomed] = useState(false);
  const volumeZoomApiRef = useRef<VolumeChartZoomApi | null>(null);
  const volumeFsZoomApiRef = useRef<VolumeChartZoomApi | null>(null);

  useLayoutEffect(() => {
    setTopbarSlot(document.getElementById("merchant-topbar-center"));
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

  const overdueBill = useMemo(
    () => bills.find((b) => b.status === "overdue") ?? null,
    [bills],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const orders = await listOrders({ limit: 500 });
      setItems(orders);

      if (orgId && !cashierOnly) {
        try {
          const billList = await listServiceBills();
          setBills(billList);
        } catch {
          setBills([]);
        }
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [orgId, cashierOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  const chartWindow = useMemo(() => {
    const from = parseDateInput(startDate, false);
    const to = parseDateInput(endDate, true);
    const keys = buildDayKeys(from, to);
    return { from, to, keys };
  }, [startDate, endDate]);

  const periodOrders = useMemo(
    () =>
      items.filter((o) =>
        inWindow(o.expiresAt, chartWindow.from, chartWindow.to),
      ),
    [items, chartWindow],
  );

  const activePeriodLabel = periodLabel(period, startDate, endDate);

  const kpis = useMemo(() => {
    const ordersInPeriod = periodOrders.length;
    const completed = periodOrders.filter(
      (o) => o.status === "completed" || o.status === "confirmed",
    );
    let volume = 0;
    for (const o of completed) {
      const n = Number(o.payableAmount.amount);
      if (Number.isFinite(n)) volume += n;
    }
    const pending = periodOrders.filter(
      (o) => o.status === "pending_payment" || o.status === "verifying",
    ).length;
    const openBills = bills.filter(
      (b) => b.status === "issued" || b.status === "overdue",
    ).length;
    return {
      ordersInPeriod,
      volume,
      pending,
      openBills,
    };
  }, [periodOrders, bills]);

  const { series, dayLabels, chartPeriodTotal } = useMemo(
    () =>
      volumeChartData(
        items,
        chartWindow.keys,
        chartWindow.from,
        chartWindow.to,
      ),
    [items, chartWindow],
  );
  const recent = periodOrders.slice(0, 8);
  const chartTitle = "Volume (USDT)";

  return (
    <div className="dash-page plat-dash">
      <div className="orders-toolbar orders-toolbar--end">
        <div className="orders-actions">
          <Link className="btn-primary btn-inline" to="/merchant/orders/new">
            <span
              className="btn-icon"
              style={{
                WebkitMaskImage: "url(/icons/nav/plus.svg)",
                maskImage: "url(/icons/nav/plus.svg)",
              }}
              aria-hidden
            />
            {cashierOnly ? "Create Order" : "Create Payment Order"}
          </Link>
          {!cashierOnly ? (
            <Link className="btn-ghost btn-inline" to="/merchant/service-bills">
              Service Bills
            </Link>
          ) : (
            <Link className="btn-ghost btn-inline" to="/merchant/orders">
              My orders
            </Link>
          )}
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}

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

      {!cashierOnly && overdueBill ? (
        <div className="cg-banner cg-banner--warn merchant-dash-overdue" role="status">
          <span>
            Service bill overdue — {overdueBill.totalAmount} {overdueBill.currency}. Pay
            promptly to avoid account restriction.
          </span>
          <Link className="alerts-drawer__link" to={`/merchant/service-bills/${overdueBill.id}`}>
            Pay bill
          </Link>
        </div>
      ) : null}

      {loading ? (
        <p className="muted">Loading KPIs…</p>
      ) : (
        <div className="plat-overview-grid">
          <div className="panel plat-overview-card glass-tone-blue">
            <p className="kpi-label">ORDERS</p>
            <p className="kpi-value">{kpis.ordersInPeriod}</p>
            <p className="muted">{activePeriodLabel}</p>
          </div>
          <div className="panel plat-overview-card glass-tone-emerald">
            <p className="kpi-label">VOLUME</p>
            <p className="kpi-value">{kpis.volume.toLocaleString()} USDT</p>
            <p className="muted">Confirmed / completed · {activePeriodLabel}</p>
          </div>
          <div className="panel plat-overview-card glass-tone-amber">
            <p className="kpi-label">PENDING</p>
            <p className="kpi-value">{kpis.pending}</p>
            <p className="muted">In period · awaiting payment / chain</p>
          </div>
          <div className="panel plat-overview-card glass-tone-violet">
            <p className="kpi-label">
              {cashierOnly ? "ANOMALIES" : "OPEN SERVICE BILLS"}
            </p>
            <p className="kpi-value">
              {cashierOnly
                ? periodOrders.filter((o) => o.status === "payment_anomaly")
                    .length
                : kpis.openBills}
            </p>
            <p className="muted">
              {cashierOnly ? activePeriodLabel : "Amber system"}
            </p>
          </div>
        </div>
      )}

      <div className="panel dash-chart-panel glass-tone-slate">
        <div className="dash-chart-panel__head">
          <div className="dash-chart-panel__title-row">
            <div className="dash-chart-panel__filters">
              <div className="dash-chart-panel__title-row-inner">
                <h2>{chartTitle}</h2>
              </div>
            </div>
            <div className="dash-chart-panel__title-main">
              <p
                className="dash-chart-panel__period-total"
                aria-label="Period total volume"
              >
                <span className="dash-chart-panel__period-value">
                  {loading ? "—" : formatUsd(chartPeriodTotal)}
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
                label="Maximize volume chart"
                onClick={() => setVolumeMaximized(true)}
              />
            </div>
          </div>
        </div>
        {loading ? (
          <p className="muted plat-chart-note">Loading chart…</p>
        ) : (
          <VolumeChart
            values={series}
            labels={dayLabels}
            showZoomBar={false}
            onZoomedChange={setVolumeZoomed}
            zoomApiRef={volumeZoomApiRef}
          />
        )}
      </div>

      <ChartMaximizeOverlay
        open={volumeMaximized}
        title={chartTitle}
        onClose={() => setVolumeMaximized(false)}
        header={
          <div className="dash-chart-panel__title-row chart-maximize-overlay__title-row">
            <div className="dash-chart-panel__filters">
              <div className="dash-chart-panel__title-row-inner">
                <h2>{chartTitle}</h2>
              </div>
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

      <section className="merchant-dash-orders">
        <div className="plat-dash-merchants__head">
          <h2>Recent payment orders</h2>
          <Link className="plat-dash-merchants__all" to="/merchant/orders">
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
          <div className="orders-table merchant-dash-orders__table" role="table">
            <div className="orders-head" role="row">
              <span>ORDER</span>
              <span>EXPIRES</span>
              <span>AMOUNT</span>
              <span>NETWORK</span>
              <span>ADDRESS</span>
              <span>MODE</span>
              <span>STATUS</span>
            </div>
            {recent.map((o) => (
              <button
                key={o.id}
                type="button"
                className="orders-row"
                role="row"
                onClick={() => navigate(`/merchant/orders/${o.id}`)}
              >
                <span className="mono">{o.orderNumber}</span>
                <span className="muted">exp {formatShortTime(o.expiresAt)}</span>
                <span>
                  {o.payableAmount.amount} {o.asset}
                </span>
                <span>{networkLabel(o.network)}</span>
                <span className="mono muted">{truncateAddress(o.receiveAddress)}</span>
                <span className="muted">{matchingModeLabel(o.matchingMode)}</span>
                <span>
                  <StatusBadge
                    tone={orderStatusTone(o.status)}
                    live={o.status === "verifying"}
                    alarm={o.status === "payment_anomaly"}
                  >
                    {orderStatusLabel(o.status)}
                  </StatusBadge>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
