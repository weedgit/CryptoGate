import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, getServiceBill, listOrgs, type ServiceBill } from "./api";
import { formatShortDate, formatUsd } from "./org";

export function ServiceBillDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [bill, setBill] = useState<ServiceBill | null>(null);
  const [merchantName, setMerchantName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [row, orgs] = await Promise.all([getServiceBill(id), listOrgs()]);
      setBill(row);
      setMerchantName(orgs.find((o) => o.id === row.orgId)?.name ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load bill");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p style={{ color: "var(--muted)" }}>Loading bill…</p>;
  }

  if (error || !bill) {
    return (
      <div className="panel">
        <p className="error">{error ?? "Bill not found"}</p>
        <Link to="/agent/service-bills">Back to list</Link>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Service bill (read-only)</h2>
        <Link className="btn-secondary" to="/agent/service-bills">
          Back
        </Link>
      </div>
      <dl className="detail-grid">
        <dt>Bill ID</dt>
        <dd className="mono">{bill.id}</dd>
        <dt>Merchant</dt>
        <dd>{merchantName ?? bill.orgId}</dd>
        <dt>Period</dt>
        <dd>
          {bill.periodStart} → {bill.periodEnd}
        </dd>
        <dt>Total</dt>
        <dd>{formatUsd(bill.totalAmount)}</dd>
        <dt>Status</dt>
        <dd>{bill.status}</dd>
        <dt>Due</dt>
        <dd>{formatShortDate(bill.dueAt)}</dd>
      </dl>
    </div>
  );
}
