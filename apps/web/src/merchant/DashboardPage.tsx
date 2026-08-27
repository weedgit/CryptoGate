import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ApiError,
  getOrg,
  listOrders,
  listServiceBills,
  listSettlement,
  type PaymentOrder,
  type ServiceBill,
  type Session,
} from "./api";
import {
  formatShortTime,
  orderStatusLabel,
  orderStatusTone,
} from "./orderStatus";
import { networkLabel, primaryMerchantOrgId, sessionIsCashierOnly } from "./org";

type Props = { session: Session };

type AlertItem = {
  key: string;
  tone: "teal" | "anomaly" | "warn" | "info" | "ok";
  title: string;
  body: string;
};

function dayKey(iso: string): string | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

function volumeSeries(orders: PaymentOrder[]): number[] {
  const days: string[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  const map = new Map(days.map((d) => [d, 0]));
  for (const o of orders) {
    if (o.status !== "completed" && o.status !== "confirmed") continue;
    const key = dayKey(o.expiresAt);
    if (!key || !map.has(key)) continue;
    const n = Number(o.payableAmount.amount);
    if (Number.isFinite(n)) map.set(key, (map.get(key) ?? 0) + n);
  }
  return days.map((d) => map.get(d) ?? 0);
}

function VolumeChart({ values }: { values: number[] }) {
  const w = 680;
  const h = 140;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => {
    const x = values.length === 1 ? 0 : (i / (values.length - 1)) * (w - 12) + 6;
    const y = h - 20 - (v / max) * (h - 40);
    return { x, y, v };
  });
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  return (
    <svg
      className="volume-chart"
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label="7-day volume chart"
    >
      {[10, 65, 120].map((y) => (
        <line
          key={y}
          x1="0"
          x2={w}
          y1={y}
          y2={y}
          stroke="var(--border)"
          strokeDasharray="4 6"
        />
      ))}
      <path d={d} fill="none" stroke="var(--teal)" strokeWidth="2.5" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="4" fill="var(--teal)" />
      ))}
    </svg>
  );
}

export function DashboardPage({ session }: Props) {
  const orgId = useMemo(() => primaryMerchantOrgId(session), [session]);
  const cashierOnly = useMemo(() => sessionIsCashierOnly(session), [session]);
  const [items, setItems] = useState<PaymentOrder[]>([]);
  const [bills, setBills] = useState<ServiceBill[]>([]);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const orders = await listOrders({ limit: 100 });
      setItems(orders);

      const nextAlerts: AlertItem[] = [];
      if (orgId && !cashierOnly) {
        try {
          const org = await getOrg(orgId);
          setOrgName(org.name);
        } catch {
          setOrgName(null);
        }
        try {
          const settlement = await listSettlement(orgId);
          const pending = settlement.find((s) => s.status === "pending_cool_down");
          if (pending?.pendingActivatesAt) {
            nextAlerts.push({
              key: "cooldown",
              tone: "teal",
              title: "COOL-DOWN",
              body: `Settlement address cool-down active until ${formatShortTime(pending.pendingActivatesAt)}`,
            });
          }
        } catch {
          /* ignore */
        }
        try {
          const billList = await listServiceBills();
          setBills(billList);
          const overdue = billList.find(
            (b) => b.status === "overdue" || b.status === "issued",
          );
          if (overdue) {
            nextAlerts.push({
              key: "bill",
              tone: "warn",
              title: "BILL",
              body: `${overdue.status === "overdue" ? "Overdue" : "Open"} service bill · ${overdue.totalAmount} ${overdue.currency}`,
            });
          }
        } catch {
          setBills([]);
        }
      }

      const anomaly = orders.find((o) => o.status === "payment_anomaly");
      if (anomaly) {
        nextAlerts.push({
          key: "anomaly",
          tone: "anomaly",
          title: "ANOMALY",
          body: `Payment anomaly on Order #${anomaly.orderNumber}`,
        });
      }

      nextAlerts.push({
        key: "network",
        tone: "info",
        title: "NETWORK",
        body: "USDT / TRC-20 live · Ethereum staging enable pending",
      });

      if (nextAlerts.length === 1 && nextAlerts[0].key === "network" && !anomaly) {
        nextAlerts.unshift({
          key: "orders-ok",
          tone: "ok",
          title: "ORDERS",
          body: "No open payment anomalies in the latest list.",
        });
      }

      setAlerts(nextAlerts.slice(0, 4));
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
    const startMs = start.getTime();
    const today = items.filter((o) => {
      const t = Date.parse(o.expiresAt);
      return Number.isFinite(t) && t >= startMs;
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
    const openBills = bills.filter(
      (b) => b.status === "issued" || b.status === "overdue",
    ).length;
    return {
      ordersToday: today || items.length,
      volumeMtd: volume,
      pending,
      openBills,
    };
  }, [items, bills]);

  const series = useMemo(() => volumeSeries(items), [items]);
  const recent = items.slice(0, 8);

  return (
    <div className="dash-page">
      <div className="orders-toolbar">
        <div>
          <p className="dash-welcome">
            {cashierOnly
              ? "Your open and recent payment orders"
              : orgName
                ? `Welcome, ${orgName}`
                : "Live order health from merchant scope"}
          </p>
        </div>
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

      {alerts.length > 0 ? (
        <div className="alert-strip">
          {alerts.map((a) => (
            <div key={a.key} className={`alert-card tone-${a.tone}`}>
              <strong>{a.title}</strong>
              <p>{a.body}</p>
            </div>
          ))}
        </div>
      ) : null}

      {loading ? (
        <p className="muted">Loading KPIs…</p>
      ) : (
        <div className="kpi-row">
          <div className="kpi-card">
            <p className="kpi-label">ORDERS TODAY</p>
            <p className="kpi-value">{kpis.ordersToday}</p>
            <p className="muted">Stable throughput</p>
          </div>
          <div className="kpi-card">
            <p className="kpi-label">VOLUME (MTD)</p>
            <p className="kpi-value">{kpis.volumeMtd.toLocaleString()} USDT</p>
            <p className="muted">Confirmed / completed in list</p>
          </div>
          <div className="kpi-card">
            <p className="kpi-label">PENDING</p>
            <p className="kpi-value">{kpis.pending}</p>
            <p className="muted">Pending payment + verifying</p>
          </div>
          <div className="kpi-card">
            <p className="kpi-label">
              {cashierOnly ? "ANOMALIES" : "OPEN SERVICE BILLS"}
            </p>
            <p className="kpi-value">
              {cashierOnly
                ? items.filter((o) => o.status === "payment_anomaly").length
                : kpis.openBills}
            </p>
            <p className="muted">
              {cashierOnly ? "Needs manual reconcile" : "Amber system"}
            </p>
          </div>
        </div>
      )}

      <div className="dash-split">
        <div className="panel dash-chart-panel">
          <h2>7-Day Volume (USDT)</h2>
          {loading ? (
            <p className="muted">Loading chart…</p>
          ) : (
            <VolumeChart values={series} />
          )}
        </div>
        <div className="panel dash-feed-panel">
          <div className="detail-header">
            <h2>Live feed</h2>
            <Link to="/merchant/orders" style={{ color: "var(--teal)", fontSize: 13 }}>
              All orders →
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="muted">
              {cashierOnly
                ? "No orders yet. Create one to issue a QR."
                : "No payment orders yet."}
            </p>
          ) : (
            <div className="feed-list">
              {recent.map((o) => (
                <Link
                  key={o.id}
                  className="feed-item"
                  to={`/merchant/orders/${o.id}`}
                >
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
    </div>
  );
}
