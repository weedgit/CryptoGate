import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import {
  ApiError,
  listActiveNetworkMaintenance,
  listOrders,
  listServiceBills,
  type ActiveNetworkMaintenance,
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
import { AuthToast } from "../auth/AuthToast";
import { networkShortLabel } from "../shared/assetNetworks";
import { StatusBadge } from "../shared/StatusBadge";
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
  const [maintenance, setMaintenance] = useState<ActiveNetworkMaintenance[]>(
    [],
  );
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

      try {
        setMaintenance(await listActiveNetworkMaintenance());
      } catch {
        setMaintenance([]);
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
    return { from, to };
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

  const recent = periodOrders.slice(0, 8);

  return (
    <div className="dash-page plat-dash">
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />

      {maintenance.length > 0 ? (
        <div className="banner banner-warn" role="status" style={{ marginBottom: 16 }}>
          {maintenance.map((m) => (
            <p key={m.network} style={{ margin: "0 0 4px" }}>
              <strong>{networkShortLabel(m.network)}</strong>
              {": "}
              {m.message?.trim() ||
                "Deposits paused — network maintenance. New payment orders on this network are blocked."}
              {m.endsAt
                ? ` Until ${new Date(m.endsAt).toLocaleString()}.`
                : ""}
            </p>
          ))}
        </div>
      ) : null}

      {topbarActionsSlot
        ? createPortal(
            <div
              className="org-agents__actions plat-orders-topbar__actions"
              aria-label="Dashboard actions"
            >
              {!cashierOnly ? (
                <Link
                  className="btn-ghost btn-inline"
                  to="/merchant/service-bills"
                >
                  Service Bills
                </Link>
              ) : (
                <Link className="btn-ghost btn-inline" to="/merchant/orders">
                  My orders
                </Link>
              )}
              <Link className="btn-primary btn-inline" to="/merchant/orders/new">
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
        )}
      </section>
    </div>
  );
}
