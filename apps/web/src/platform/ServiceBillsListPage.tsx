import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, listOrgs, listServiceBills, type ServiceBill } from "./api";
import { formatShortDate, formatUsd, sessionCanIssueServiceBill } from "./org";
import type { Session } from "./api";
import {
  formatBillId,
  serviceBillStatusLabel,
  serviceBillStatusTone,
} from "./serviceBillStatus";

type Props = { session: Session };

export function ServiceBillsListPage({ session }: Props) {
  const canIssue = useMemo(() => sessionCanIssueServiceBill(session), [session]);
  const [items, setItems] = useState<ServiceBill[]>([]);
  const [orgNames, setOrgNames] = useState<Map<string, string>>(new Map());
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [bills, orgs] = await Promise.all([
        listServiceBills(status ? { status } : undefined),
        listOrgs(),
      ]);
      setItems(bills);
      setOrgNames(new Map(orgs.map((o) => [o.id, o.name])));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load service bills");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Service bills</h2>
        <div className="action-row">
          <select
            className="field-control"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="issued">Issued</option>
            <option value="overdue">Overdue</option>
            <option value="paid">Paid</option>
            <option value="voided">Voided</option>
          </select>
          {canIssue ? (
            <Link className="btn-primary" to="/platform/service-bills/new">
              Issue bill
            </Link>
          ) : null}
        </div>
      </div>
      {loading ? <p style={{ color: "var(--muted)" }}>Loading…</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {!loading && !error && items.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>No service bills match this filter.</p>
      ) : null}
      {!loading && items.length > 0 ? (
        <table className="data-table">
          <thead>
            <tr>
              <th>Bill</th>
              <th>Merchant</th>
              <th>Period</th>
              <th>Total</th>
              <th>Status</th>
              <th>Due</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((bill) => (
              <tr key={bill.id}>
                <td className="mono">{formatBillId(bill.id)}</td>
                <td>{orgNames.get(bill.orgId) ?? bill.orgId}</td>
                <td>
                  {bill.periodStart} → {bill.periodEnd}
                </td>
                <td>{formatUsd(bill.totalAmount)}</td>
                <td>
                  <span
                    className={`status-badge tone-${serviceBillStatusTone(bill.status)}`}
                  >
                    {serviceBillStatusLabel(bill.status)}
                  </span>
                </td>
                <td>{formatShortDate(bill.dueAt)}</td>
                <td>
                  <Link to={`/platform/service-bills/${bill.id}`}>View</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
