import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ApiError,
  listOrders,
  listSettlement,
  type PaymentOrder,
  type Session,
} from "./api";
import {
  formatShortTime,
  orderStatusLabel,
  orderStatusTone,
} from "./orderStatus";
import { networkLabel, primaryMerchantOrgId, sessionIsCashierOnly } from "./org";

type Props = { session: Session };

export function DashboardPage({ session }: Props) {
  const orgId = useMemo(() => primaryMerchantOrgId(session), [session]);
  const cashierOnly = useMemo(() => sessionIsCashierOnly(session), [session]);
  const [items, setItems] = useState<PaymentOrder[]>([]);
  const [coolDownNote, setCoolDownNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const orders = await listOrders({ limit: 100 });
      setItems(orders);
      if (orgId && !cashierOnly) {
        try {
          const settlement = await listSettlement(orgId);
          const pending = settlement.find((s) => s.status === "pending_cool_down");
          if (pending?.pendingActivatesAt) {
            setCoolDownNote(
              `Settlement address cool-down active until ${formatShortTime(pending.pendingActivatesAt)}`,
            );
          } else {
            setCoolDownNote(null);
          }
        } catch {
          setCoolDownNote(null);
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

  const kpis = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const today = items.filter((o) => {
      const t = Date.parse(o.expiresAt);
      return Number.isFinite(t); // list has no createdAt; count all as proxy for "open set"
    }).length;
    const completed = items.filter(
      (o) => o.status === "completed" || o.status === "confirmed",
    );
    let volume = 0;
    for (const o of completed) {
      const n = Number(o.payableAmount.amount);
      if (Number.isFinite(n)) volume += n;
    }
    const pending = items.filter(
      (o) => o.status === "pending_payment" || o.status === "verifying",
    ).length;
    const anomalies = items.filter((o) => o.status === "payment_anomaly").length;
    return {
      ordersToday: today,
      volumeMtd: volume,
      pending,
      anomalies,
    };
  }, [items]);

  const recent = items.slice(0, 8);
  const anomalySample = items.find((o) => o.status === "payment_anomaly");

  return (
    <div className="dash-page">
      <div className="orders-toolbar">
        <p className="muted" style={{ margin: 0 }}>
          {cashierOnly
            ? "Your open and recent payment orders"
            : "Live order health from merchant scope"}
        </p>
        <div className="orders-actions">
          <Link className="btn-primary btn-inline" to="/merchant/orders/new">
            + {cashierOnly ? "Create Order" : "Create Payment Order"}
          </Link>
          <Link className="btn-ghost btn-inline" to="/merchant/orders">
            {cashierOnly ? "My orders" : "View orders"}
          </Link>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <div className="alert-strip">
        {coolDownNote ? (
          <div className="alert-card tone-teal">
            <strong>COOL-DOWN</strong>
            <p>{coolDownNote}</p>
          </div>
        ) : null}
        {anomalySample ? (
          <div className="alert-card tone-anomaly">
            <strong>ANOMALY</strong>
            <p>
              Payment anomaly on Order #{anomalySample.orderNumber}
            </p>
          </div>
        ) : (
          <div className="alert-card tone-ok">
            <strong>ORDERS</strong>
            <p>No open payment anomalies in the latest list.</p>
          </div>
        )}
      </div>

      {loading ? (
        <p className="muted">Loading KPIs…</p>
      ) : (
        <div className="kpi-row">
          <div className="kpi-card">
            <p className="kpi-label">ORDERS (LIST)</p>
            <p className="kpi-value">{kpis.ordersToday}</p>
            <p className="muted">In latest fetch</p>
          </div>
          <div className="kpi-card">
            <p className="kpi-label">COMPLETED VOLUME</p>
            <p className="kpi-value">{kpis.volumeMtd.toLocaleString()} USDT</p>
            <p className="muted">Confirmed / completed in list</p>
          </div>
          <div className="kpi-card">
            <p className="kpi-label">PENDING</p>
            <p className="kpi-value">{kpis.pending}</p>
            <p className="muted">Pending payment + verifying</p>
          </div>
          <div className="kpi-card">
            <p className="kpi-label">ANOMALIES</p>
            <p className="kpi-value">{kpis.anomalies}</p>
            <p className="muted">Needs manual reconcile</p>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="detail-header">
          <h2>{cashierOnly ? "My recent orders" : "Recent payment orders"}</h2>
          <Link to="/merchant/orders" style={{ color: "var(--teal)", fontSize: 13 }}>
            {cashierOnly ? "All my orders →" : "All orders →"}
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="muted">
            {cashierOnly ? "No orders yet. Create one to issue a QR." : "No payment orders yet."}
          </p>
        ) : (
          <div className="feed-list">
            {recent.map((o) => (
              <Link key={o.id} className="feed-item" to={`/merchant/orders/${o.id}`}>
                <strong className={`feed-title tone-${orderStatusTone(o.status)}`}>
                  #{o.orderNumber} · {orderStatusLabel(o.status)}
                </strong>
                <span className="muted">
                  {o.payableAmount.amount} {o.asset} · {networkLabel(o.network)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
