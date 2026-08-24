import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, listAuditLog, listOrgs, type AuditLogEntry } from "./api";

const ACTION_LABEL: Record<string, string> = {
  login: "Login",
  logout: "Logout",
  org_create: "Org created",
  service_bill_issue: "Service bill issued",
  service_bill_mark_paid: "Bill marked paid",
  service_bill_void: "Bill voided",
  service_bill_adjust: "Bill adjusted",
  api_key_create: "API key created",
  api_key_revoke: "API key revoked",
};

export function AuditLogPage() {
  const [items, setItems] = useState<AuditLogEntry[]>([]);
  const [orgNames, setOrgNames] = useState<Map<string, string>>(new Map());
  const [action, setAction] = useState("");
  const [limit, setLimit] = useState("100");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const n = Number(limit);
      const [rows, orgs] = await Promise.all([
        listAuditLog({
          action: action || undefined,
          limit: Number.isFinite(n) && n > 0 ? n : 100,
        }),
        listOrgs(),
      ]);
      setItems(rows);
      setOrgNames(new Map(orgs.map((o) => [o.id, o.name])));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load audit log");
    } finally {
      setLoading(false);
    }
  }, [action, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Audit log</h2>
        <div className="action-row">
          <select
            className="field-control"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          >
            <option value="">All actions</option>
            <option value="service_bill_issue">Service bill issued</option>
            <option value="service_bill_mark_paid">Bill marked paid</option>
            <option value="service_bill_void">Bill voided</option>
            <option value="service_bill_adjust">Bill adjusted</option>
            <option value="org_create">Org created</option>
            <option value="login">Login</option>
          </select>
          <select
            className="field-control"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
          >
            <option value="50">50 rows</option>
            <option value="100">100 rows</option>
            <option value="200">200 rows</option>
          </select>
          <button type="button" className="btn-secondary" onClick={() => void load()}>
            Refresh
          </button>
        </div>
      </div>
      <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 0 }}>
        Append-only platform audit trail (B14). No delete — read-only.
      </p>
      {loading ? <p style={{ color: "var(--muted)" }}>Loading…</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {!loading && items.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>No audit events match this filter.</p>
      ) : null}
      {!loading && items.length > 0 ? (
        <table className="data-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Action</th>
              <th>Org</th>
              <th>Actor</th>
              <th>Metadata</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id}>
                <td>{new Date(row.createdAt).toLocaleString()}</td>
                <td>{ACTION_LABEL[row.action] ?? row.action}</td>
                <td>
                  {row.orgId
                    ? (orgNames.get(row.orgId) ?? row.orgId.slice(0, 8))
                    : "—"}
                </td>
                <td className="mono">{row.actorUserId?.slice(0, 8) ?? "—"}</td>
                <td className="mono" style={{ fontSize: 11 }}>
                  {Object.keys(row.metadata).length
                    ? JSON.stringify(row.metadata)
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {items.some((r) => r.action.startsWith("service_bill_")) ? (
        <p style={{ marginTop: 16 }}>
          <Link to="/platform/service-bills">View service bills</Link>
        </p>
      ) : null}
    </div>
  );
}
