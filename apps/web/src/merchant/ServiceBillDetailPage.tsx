import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  ApiError,
  getServiceBill,
  getServiceBillCheckout,
  type ServiceBill,
  type ServiceBillCheckout,
  type Session,
} from "./api";
import { formatShortTime } from "./orderStatus";
import {
  formatBillId,
  formatBillPeriod,
  serviceBillStatusLabel,
  serviceBillStatusTone,
} from "./serviceBillStatus";
import { sessionCanCheckoutServiceBill } from "./org";

type Props = { session: Session };

export function ServiceBillDetailPage({ session }: Props) {
  const { id } = useParams();
  const location = useLocation();
  const openCheckout = (location.state as { openCheckout?: boolean } | null)?.openCheckout;
  const canPay = useMemo(() => sessionCanCheckoutServiceBill(session), [session]);

  const [bill, setBill] = useState<ServiceBill | null>(null);
  const [checkout, setCheckout] = useState<ServiceBillCheckout | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const row = await getServiceBill(id);
      setBill(row);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load service bill");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadCheckout = useCallback(async () => {
    if (!id || !canPay) return;
    setCheckoutLoading(true);
    setCheckoutError(null);
    try {
      const payload = await getServiceBillCheckout(id);
      setCheckout(payload);
    } catch (err) {
      setCheckoutError(
        err instanceof ApiError ? err.message : "Failed to load checkout",
      );
      setCheckout(null);
    } finally {
      setCheckoutLoading(false);
    }
  }, [canPay, id]);

  useEffect(() => {
    if (openCheckout && bill && (bill.status === "issued" || bill.status === "overdue")) {
      void loadCheckout();
    }
  }, [openCheckout, bill, loadCheckout]);

  async function copyPayTo() {
    if (!checkout?.payTo) return;
    try {
      await navigator.clipboard.writeText(checkout.payTo);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  if (loading && !bill) {
    return <p className="muted">Loading service bill…</p>;
  }

  if (error && !bill) {
    return (
      <div className="panel">
        <p className="error">{error}</p>
        <Link to="/merchant/service-bills" style={{ color: "var(--teal)" }}>
          ← Back to service bills
        </Link>
      </div>
    );
  }

  if (!bill) return null;

  const isOverdue = bill.status === "overdue";
  const payable = bill.status === "issued" || bill.status === "overdue";

  return (
    <div className="bills-detail-page">
      <div className="detail-crumb">
        <Link to="/merchant/service-bills">Service Bills</Link>
        <span> / </span>
        <span className="here">{formatBillId(bill.id)}</span>
      </div>

      <div className="bills-banner" role="note">
        Service bill — platform SaaS invoice. Not a merchant payment order.
      </div>

      {isOverdue ? (
        <div className="anomaly-panel" role="alert">
          <p className="anomaly-title">Overdue service bill</p>
          <p>
            This bill is past due. Account features may be restricted until platform
            billing is settled. Pay to the platform billing destination below.
          </p>
        </div>
      ) : null}

      <div className="panel bills-detail-card">
        <div className="detail-header">
          <div>
            <h2>Service Bill</h2>
            <p className="mono muted">{formatBillId(bill.id)}</p>
          </div>
          <span className={`status-badge tone-${serviceBillStatusTone(bill.status)}`}>
            {serviceBillStatusLabel(bill.status)}
          </span>
        </div>

        <div className="detail-amount-row">
          <div>
            <p className="label">PERIOD</p>
            <p>{formatBillPeriod(bill.periodStart, bill.periodEnd)}</p>
          </div>
          <div>
            <p className="label">DUE</p>
            <p>{formatShortTime(bill.dueAt)}</p>
          </div>
          <div>
            <p className="label">TOTAL</p>
            <p className="detail-amount">
              ${bill.totalAmount} {bill.currency}
            </p>
          </div>
        </div>

        <div className="bills-line-items">
          <div className="bills-line">
            <span>Subscription</span>
            <span className="mono">${bill.subscriptionAmount}</span>
          </div>
          <div className="bills-line">
            <span>Volume fee</span>
            <span className="mono">${bill.volumeFeeAmount}</span>
          </div>
          <div className="bills-line bills-line-total">
            <strong>Total due</strong>
            <strong className="mono">
              ${bill.totalAmount} {bill.currency}
            </strong>
          </div>
        </div>

        {canPay && payable ? (
          <div className="bills-checkout">
            <h3>Pay service bill</h3>
            {!checkout && !checkoutLoading ? (
              <button type="button" className="btn-primary" onClick={() => void loadCheckout()}>
                Open checkout instructions
              </button>
            ) : null}
            {checkoutLoading ? <p className="muted">Loading checkout…</p> : null}
            {checkoutError ? <p className="error">{checkoutError}</p> : null}
            {checkout ? (
              <div className="bills-checkout-box">
                <p className="muted">{checkout.instructions}</p>
                <p className="label">PAY TO (PLATFORM)</p>
                <div className="addr-box addr-copy-row">
                  <span>{checkout.payTo}</span>
                  <button type="button" className="btn-ghost btn-tiny" onClick={copyPayTo}>
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="muted" style={{ fontSize: 12 }}>
                  Do not use the guest payment page or merchant receive address for service
                  bills.
                </p>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="muted">View-only access — checkout requires Owner or Administrator.</p>
        )}
      </div>
    </div>
  );
}
