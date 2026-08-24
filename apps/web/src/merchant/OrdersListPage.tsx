import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ApiError,
  listOrders,
  ordersCsvUrl,
  type PaymentOrder,
  type Session,
} from "./api";
import { matchingModeLabel } from "./matchingLabels";
import {
  formatShortTime,
  orderStatusLabel,
  orderStatusTone,
} from "./orderStatus";
import { networkLabel, sessionCanExportOrders, sessionIsCashierOnly, truncateAddress } from "./org";

type Filter = "all" | "anomalies";

type Props = { session: Session };

export function OrdersListPage({ session }: Props) {
  const navigate = useNavigate();
  const canExport = useMemo(() => sessionCanExportOrders(session), [session]);
  const cashierOnly = useMemo(() => sessionIsCashierOnly(session), [session]);
  const [filter, setFilter] = useState<Filter>("all");
  const [items, setItems] = useState<PaymentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listOrders({
        status: filter === "anomalies" ? "payment_anomaly" : undefined,
        limit: 100,
      });
      setItems(rows);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load orders");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  function onExport() {
    window.open(
      ordersCsvUrl(
        filter === "anomalies" ? { status: "payment_anomaly" } : undefined,
      ),
      "_blank",
    );
  }

  return (
    <div className="orders-page">
      <div className="orders-toolbar">
        <div className="filter-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className={`filter-tab${filter === "all" ? " active" : ""}`}
            aria-selected={filter === "all"}
            onClick={() => setFilter("all")}
          >
            All
          </button>
          <button
            type="button"
            role="tab"
            className={`filter-tab${filter === "anomalies" ? " active" : ""}`}
            aria-selected={filter === "anomalies"}
            onClick={() => setFilter("anomalies")}
          >
            Anomalies
          </button>
        </div>
        <div className="orders-actions">
          {canExport ? (
            <button type="button" className="btn-ghost" onClick={onExport}>
              Export CSV
            </button>
          ) : null}
          <Link className="btn-primary btn-inline" to="/merchant/orders/new">
            + {cashierOnly ? "Create Order" : "New Payment Request"}
          </Link>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}

      {loading ? (
        <p className="muted">Loading orders…</p>
      ) : items.length === 0 ? (
        <div className="panel empty-orders">
          <h2>{cashierOnly ? "No orders yet" : "No payment orders yet"}</h2>
          <p className="muted">
            {cashierOnly
              ? "Create a payment order to show a QR at the terminal."
              : "Create a payment order to show a QR and watch the chain."}
          </p>
          <Link className="btn-primary btn-inline" to="/merchant/orders/new">
            {cashierOnly ? "Create order" : "Create payment order"}
          </Link>
        </div>
      ) : (
        <div className="orders-table" role="table">
          <div className="orders-head" role="row">
            <span>ORDER</span>
            <span>EXPIRES</span>
            <span>AMOUNT</span>
            <span>NETWORK</span>
            <span>ADDRESS</span>
            <span>MODE</span>
            <span>STATUS</span>
          </div>
          {items.map((o) => (
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
                <span className={`status-badge tone-${orderStatusTone(o.status)}`}>
                  {orderStatusLabel(o.status)}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
