import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError, listOrgs, listServiceBills, type ServiceBill } from "./api";
import { formatShortDate, formatUsd } from "./org";

const STATUS_LABEL: Record<string, string> = {
  issued: "Issued",
  paid: "Paid",
  overdue: "Overdue",
  voided: "Voided",
};

export function ServiceBillsListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get("status") ?? "";
  const [items, setItems] = useState<ServiceBill[]>([]);
  const [orgNames, setOrgNames] = useState<Map<string, string>>(new Map());
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

  const title = useMemo(() => {
    if (status === "overdue") return "Overdue service bills";
    return "Service bills (subtree)";
  }, [status]);

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        <select
          className="field-control"
          value={status}
          onChange={(e) => {
            const next = e.target.value;
            if (next) setSearchParams({ status: next });
            else setSearchParams({});
          }}
        >
          <option value="">All statuses</option>
          <option value="issued">Issued</option>
          <option value="overdue">Overdue</option>
          <option value="paid">Paid</option>
          <option value="voided">Voided</option>
        </select>
      </div>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>
        Read-only — platform issues and adjusts bills. Use for collections
        follow-up.
      </p>
      {loading ? <p style={{ color: "var(--muted)" }}>Loading…</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {!loading && !error && items.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>No service bills in subtree.</p>
      ) : null}
      {!loading && items.length > 0 ? (
        <table className="data-table">
          <thead>
            <tr>
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
                <td>{orgNames.get(bill.orgId) ?? bill.orgId}</td>
                <td>
                  {bill.periodStart} → {bill.periodEnd}
                </td>
                <td>{formatUsd(bill.totalAmount)}</td>
                <td>{STATUS_LABEL[bill.status] ?? bill.status}</td>
                <td>{formatShortDate(bill.dueAt)}</td>
                <td>
                  <Link to={`/agent/service-bills/${bill.id}`}>View</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
