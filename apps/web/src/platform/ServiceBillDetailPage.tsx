import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ApiError,
  getServiceBill,
  listOrgs,
  type ServiceBill,
  type Session,
} from "./api";
import { ServiceBillActionsPanel } from "./ServiceBillActionsPanel";
import { formatShortDate, formatUsd } from "./org";
import {
  formatBillId,
  serviceBillStatusLabel,
  serviceBillStatusTone,
} from "./serviceBillStatus";

type Props = { session: Session };

export function ServiceBillDetailPage({ session }: Props) {
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

  const title = useMemo(
    () => (bill ? formatBillId(bill.id) : "Service bill"),
    [bill],
  );

  if (loading) {
    return <p style={{ color: "var(--muted)" }}>Loading bill…</p>;
  }

  if (error || !bill) {
    return (
      <div className="panel">
        <p className="error">{error ?? "Bill not found"}</p>
        <Link to="/platform/service-bills">Back to list</Link>
      </div>
    );
  }

  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <h2>{title}</h2>
          <Link className="btn-secondary" to="/platform/service-bills">
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
          <dt>Subscription</dt>
          <dd>{formatUsd(bill.subscriptionAmount)}</dd>
          <dt>Volume fee</dt>
          <dd>{formatUsd(bill.volumeFeeAmount)}</dd>
          <dt>Total</dt>
          <dd>{formatUsd(bill.totalAmount)}</dd>
          <dt>Status</dt>
          <dd>
            <span className={`status-badge tone-${serviceBillStatusTone(bill.status)}`}>
              {serviceBillStatusLabel(bill.status)}
            </span>
          </dd>
          <dt>Due</dt>
          <dd>{formatShortDate(bill.dueAt)}</dd>
          {bill.paidAt ? (
            <>
              <dt>Paid at</dt>
              <dd>{formatShortDate(bill.paidAt)}</dd>
            </>
          ) : null}
          {bill.voidedAt ? (
            <>
              <dt>Voided at</dt>
              <dd>{formatShortDate(bill.voidedAt)}</dd>
            </>
          ) : null}
          {bill.lastAdjustmentReason ? (
            <>
              <dt>Last adjustment</dt>
              <dd>{bill.lastAdjustmentReason}</dd>
            </>
          ) : null}
        </dl>
        <p style={{ color: "var(--muted)", marginTop: 16, marginBottom: 0 }}>
          Merchants pay via service-bill checkout — not the guest payment page.
        </p>
      </div>

      <ServiceBillActionsPanel
        session={session}
        bill={bill}
        onUpdated={(updated) => setBill(updated)}
      />
    </>
  );
}
