import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, listOrders, type PaymentOrder, type Session } from "../api";
import { formatShortTime, orderStatusLabel, orderStatusTone } from "../orderStatus";
import { AuthToast } from "../../auth/AuthToast";
import { OrderChannelTag } from "../../shared/OrderChannelTag";
import { StatusBadge } from "../../shared/StatusBadge";
import { displayNetworkForPair } from "../../shared/assetNetworks";
import { periodWindow } from "../../shared/dashboardPeriod";
import { zoneAbbrev } from "../../shared/dateTime";
import { useViewerTimeZone } from "../../shared/useViewerTimeZone";
import { merchantRoute } from "../../shared/portalRouting";
import { useDashboardLiveEvents } from "../../shared/useDashboardLiveEvents";
import { NetworkIcon } from "../../platform/cryptoIcons";
import { OPEN_ORDER_STATUSES, shiftTotals } from "./cashierLogic";
import { AlertIcon, CheckIcon, ChevronRightIcon, ClockIcon } from "./cashierIcons";

type Props = { session: Session; notice?: string };

const SHIFT_LIMIT = 100;

function formatShiftUsd(value: number): string {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} USD`;
}

/** Cashier "My shift" — today's own orders; open ones reopen the live QR. */
export function ShiftPage({ session, notice }: Props) {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<PaymentOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tz = useViewerTimeZone();

  const load = useCallback(async () => {
    const { from, to } = periodWindow("today");
    try {
      setOrders(
        await listOrders({
          createdBy: session.userId,
          createdFrom: from.toISOString(),
          createdTo: to.toISOString(),
          limit: SHIFT_LIMIT,
        }),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load today’s orders");
      setOrders((prev) => prev ?? []);
    }
  }, [session.userId, tz]);

  useEffect(() => {
    void load();
  }, [load]);

  useDashboardLiveEvents({
    enabled: orders != null,
    debounceMs: 3_000,
    onSlices: (slices) => {
      if (slices.includes("volume") || slices.includes("anomalies")) void load();
    },
  });

  const totals = useMemo(() => shiftTotals(orders ?? []), [orders]);

  const open = (o: PaymentOrder) => {
    const live = OPEN_ORDER_STATUSES.has(o.status);
    navigate(merchantRoute(live ? `pay/${o.id}` : `orders/${o.id}`));
  };

  return (
    <div className="cashier-shift">
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />
      <header className="cashier-shift__head">
        <h1>My shift</h1>
        <span className="muted" title={`"Today" in your profile time zone (${tz})`}>
          Today ({zoneAbbrev(tz)}) · your orders only
        </span>
      </header>

      {notice ? (
        <p className="cashier-shift__notice" role="status">
          {notice}
        </p>
      ) : null}

      <div className="cashier-shift__totals">
        <div className="cashier-shift__total is-completed">
          <div className="cashier-shift__total-copy">
            <span>Completed</span>
            <strong className="fund-amount">{formatShiftUsd(totals.completedUsd)}</strong>
            <small>{totals.completed} paid</small>
          </div>
          <span className="cashier-shift__total-icon" aria-hidden>
            <CheckIcon />
          </span>
        </div>
        <div className="cashier-shift__total is-open">
          <div className="cashier-shift__total-copy">
            <span>Open</span>
            <strong>{totals.open}</strong>
            <small>waiting or confirming</small>
          </div>
          <span className="cashier-shift__total-icon" aria-hidden>
            <ClockIcon />
          </span>
        </div>
        <div
          className={`cashier-shift__total${totals.attention > 0 ? " is-attention" : " is-clear"}`}
        >
          <div className="cashier-shift__total-copy">
            <span>Attention</span>
            <strong>{totals.attention}</strong>
            <small>{totals.attention > 0 ? "ask a manager" : "all clear"}</small>
          </div>
          <span className="cashier-shift__total-icon" aria-hidden>
            <AlertIcon />
          </span>
        </div>
      </div>

      {orders == null ? (
        <p className="muted">Loading today’s orders…</p>
      ) : orders.length === 0 ? (
        <p className="muted cashier-shift__empty">
          No orders yet today. Charges you take will appear here.
        </p>
      ) : (
        <ul className="cashier-shift__list">
          {orders.map((o) => (
            <li key={o.id}>
              <button type="button" className="cashier-shift__row" onClick={() => open(o)}>
                <span className="cashier-shift__row-main">
                  <span className="cashier-shift__row-number mono">#{o.orderNumber}</span>
                  <span className="cashier-shift__row-meta">
                    <OrderChannelTag via={o.createdVia} />
                    <span className="muted">{formatShortTime(o.createdAt || o.expiresAt)}</span>
                  </span>
                </span>
                <span className="cashier-shift__row-amount">
                  <strong>
                    {o.invoiceAmount
                      ? `${o.invoiceAmount} ${o.invoiceCurrency ?? "USD"}`
                      : `${o.payableAmount.amount} ${o.asset}`}
                  </strong>
                  <span className="cashier-shift__row-rail">
                    <NetworkIcon network={o.network} /> {o.asset} ·{" "}
                    {displayNetworkForPair(o.asset, o.network)}
                  </span>
                </span>
                <span className="cashier-shift__row-status">
                  <StatusBadge
                    tone={orderStatusTone(o.status, o)}
                    live={o.status === "verifying"}
                    alarm={o.status === "payment_anomaly"}
                  >
                    {orderStatusLabel(o.status, o)}
                  </StatusBadge>
                  <ChevronRightIcon className="cashier-shift__row-chevron" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
