import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ApiError,
  listOrders,
  listOrgs,
  listServiceBills,
  type Session,
} from "./api";
import { sessionCanIssueServiceBill } from "./org";

type Props = { session: Session };

export function DashboardPage({ session }: Props) {
  const canIssue = useMemo(() => sessionCanIssueServiceBill(session), [session]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    agents: 0,
    merchants: 0,
    openOrders: 0,
    overdueBills: 0,
    issuedBills: 0,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [orgs, orders, overdue, issued] = await Promise.all([
        listOrgs(),
        listOrders({ limit: 200 }),
        listServiceBills({ status: "overdue" }),
        listServiceBills({ status: "issued" }),
      ]);
      const agents = orgs.filter(
        (o) => o.type === "agent" || o.type === "agent_sub",
      ).length;
      const merchants = orgs.filter(
        (o) => o.type === "merchant" || o.type === "merchant_site",
      ).length;
      const openOrders = orders.filter((o) =>
        ["pending", "verifying", "payment_anomaly"].includes(o.status),
      ).length;
      setStats({
        agents,
        merchants,
        openOrders,
        overdueBills: overdue.length,
        issuedBills: issued.length,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p style={{ color: "var(--muted)" }}>Loading platform metrics…</p>;
  }

  if (error) {
    return (
      <div className="panel">
        <p className="error">{error}</p>
        <button type="button" className="btn-secondary" onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="kpi-grid">
        <div className="kpi-card">
          <p className="kpi-label">Agent accounts</p>
          <p className="kpi-value">{stats.agents}</p>
        </div>
        <div className="kpi-card">
          <p className="kpi-label">Merchant accounts</p>
          <p className="kpi-value">{stats.merchants}</p>
        </div>
        <div className="kpi-card">
          <p className="kpi-label">Open payment orders</p>
          <p className="kpi-value">{stats.openOrders}</p>
        </div>
        <div className="kpi-card">
          <p className="kpi-label">Overdue service bills</p>
          <p className="kpi-value">{stats.overdueBills}</p>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 24 }}>
        <h2>Quick actions</h2>
        <div className="action-row">
          <Link className="btn-secondary" to="/platform/agents">
            View agents
          </Link>
          <Link className="btn-secondary" to="/platform/merchants">
            View merchants
          </Link>
          <Link className="btn-secondary" to="/platform/service-bills">
            Service bills ({stats.issuedBills} issued)
          </Link>
          {canIssue ? (
            <Link className="btn-primary" to="/platform/service-bills/new">
              Issue service bill
            </Link>
          ) : null}
        </div>
        <p style={{ color: "var(--muted)", marginTop: 16 }}>
          Charts, watcher health, and audit review (B1/B14) ship in follow-up
          platform tasks. Volume totals use live org and order lists.
        </p>
      </div>
    </>
  );
}
