import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, listOrgs, listServiceBills } from "./api";

export function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    merchants: 0,
    subAgents: 0,
    openBills: 0,
    overdueBills: 0,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [orgs, issued, overdue] = await Promise.all([
        listOrgs(),
        listServiceBills({ status: "issued" }),
        listServiceBills({ status: "overdue" }),
      ]);
      setStats({
        merchants: orgs.filter(
          (o) => o.type === "merchant" || o.type === "merchant_site",
        ).length,
        subAgents: orgs.filter((o) => o.type === "agent_sub").length,
        openBills: issued.length,
        overdueBills: overdue.length,
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
    return <p style={{ color: "var(--muted)" }}>Loading subtree metrics…</p>;
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
          <p className="kpi-label">Merchants in subtree</p>
          <p className="kpi-value">{stats.merchants}</p>
        </div>
        <div className="kpi-card">
          <p className="kpi-label">Sub-agent accounts</p>
          <p className="kpi-value">{stats.subAgents}</p>
        </div>
        <div className="kpi-card">
          <p className="kpi-label">Open service bills</p>
          <p className="kpi-value">{stats.openBills}</p>
        </div>
        <div className="kpi-card">
          <p className="kpi-label">Overdue bills</p>
          <p className="kpi-value">{stats.overdueBills}</p>
        </div>
      </div>
      <div className="panel" style={{ marginTop: 24 }}>
        <h2>Quick actions</h2>
        <div className="action-row">
          <Link className="btn-secondary" to="/agent/merchants">
            View merchants
          </Link>
          <Link className="btn-secondary" to="/agent/service-bills?status=overdue">
            Overdue bills
          </Link>
        </div>
        <p style={{ color: "var(--muted)", marginTop: 16 }}>
          Onboard merchant (C6) and commission statements (C10) ship in follow-up
          agent tasks. Agents do not create payment orders.
        </p>
      </div>
    </>
  );
}
