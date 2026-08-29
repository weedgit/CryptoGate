import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { AuthToast } from "../auth/AuthToast";
import {
  ApiError,
  getOrg,
  getServiceBill,
  getServiceBillCheckout,
  type OrgAccount,
  type ServiceBill,
  type ServiceBillCheckout,
  type Session,
} from "./api";
import {
  formatBillId,
  serviceBillStatusLabel,
  serviceBillStatusTone,
} from "./serviceBillStatus";
import { sessionCanCheckoutServiceBill } from "./org";
import { formatShortTime } from "./orderStatus";
import {
  platformBillingPayToFallback,
  platformInvoiceSeller,
  ServiceBillInvoiceFace,
} from "../billing/ServiceBillInvoiceFace";
import { PaymentQrCanvas } from "../shared/PaymentQrCanvas";
import { displayNetworkForPair } from "../shared/assetNetworks";
import {
  AssetIcon,
  NetworkIcon,
  QrCenterNetworkMark,
} from "../platform/cryptoIcons";

type Props = { session: Session };

const BILL_ASSET = "USDT";
const BILL_NETWORK = "tron";

function serviceBillQrPayload(payTo: string, totalAmount: string): string | null {
  if (!payTo.startsWith("T") || payTo.length < 30) return null;
  const q = new URLSearchParams({
    amount: totalAmount,
    asset: BILL_ASSET,
    network: BILL_NETWORK,
  });
  return `tron:${payTo}?${q.toString()}`;
}

/** 0 = Issued, 1 = Awaiting / Overdue, 2 = Paid. */
function billTimelineIndex(status: string): number {
  if (status === "paid") return 2;
  if (status === "issued" || status === "overdue") return 1;
  if (status === "voided") return 0;
  return 0;
}

function timelineStepClass(stepIndex: number, currentIndex: number): string {
  if (stepIndex < currentIndex) return "is-reached";
  if (stepIndex === currentIndex) return "is-reached is-current";
  return "";
}

export function ServiceBillDetailPage({ session }: Props) {
  const { id } = useParams();
  const location = useLocation();
  const openCheckout = (location.state as { openCheckout?: boolean } | null)
    ?.openCheckout;
  const canPay = useMemo(
    () => sessionCanCheckoutServiceBill(session),
    [session],
  );
  const invoiceRef = useRef<HTMLElement | null>(null);

  const [bill, setBill] = useState<ServiceBill | null>(null);
  const [buyerOrg, setBuyerOrg] = useState<OrgAccount | null>(null);
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
      try {
        const org = await getOrg(row.orgId);
        setBuyerOrg(org);
      } catch {
        setBuyerOrg(null);
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to load service bill",
      );
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
    if (!bill) return;
    if (bill.status !== "issued" && bill.status !== "overdue") return;
    if (canPay) void loadCheckout();
  }, [bill, canPay, loadCheckout, openCheckout]);

  const payTo =
    checkout?.payTo ?? platformBillingPayToFallback() ?? null;
  const qrPayload =
    checkout?.qrPayload ??
    (payTo && bill ? serviceBillQrPayload(payTo, bill.totalAmount) : null);
  const networkDisplay = displayNetworkForPair(BILL_ASSET, BILL_NETWORK);
  const paid = bill?.status === "paid";
  const voided = bill?.status === "voided";
  const payable = bill?.status === "issued" || bill?.status === "overdue";
  const isOverdue = bill?.status === "overdue";
  const timelineIndex = bill ? billTimelineIndex(bill.status) : 0;

  async function copyPayTo() {
    if (!payTo) return;
    try {
      await navigator.clipboard.writeText(payTo);
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
        <AuthToast
          message={error}
          tone="error"
          onDismiss={() => setError(null)}
        />
        <p className="muted">Could not load this service bill.</p>
        <Link to="/merchant/service-bills" style={{ color: "var(--teal)" }}>
          ← Back to service bills
        </Link>
      </div>
    );
  }

  if (!bill) return null;

  const toastMessage = error || checkoutError;

  return (
    <div className="bills-detail-page">
      <AuthToast
        message={toastMessage}
        tone="error"
        onDismiss={() => {
          setError(null);
          setCheckoutError(null);
        }}
      />

      {isOverdue ? (
        <div className="anomaly-panel no-print" role="alert">
          <p className="anomaly-title">Overdue service bill</p>
          <p>
            This bill is past due. Account features may be restricted until
            platform billing is settled. Pay to the platform billing destination
            on the right.
          </p>
        </div>
      ) : null}

      <div className="order-detail-page__invoice-row bills-detail-page__row">
        <div className="order-detail-page__invoice">
          <ServiceBillInvoiceFace
            bill={bill}
            buyer={{
              name: buyerOrg?.name ?? bill.orgId,
              legalName: buyerOrg?.legalName,
              billingEmail: buyerOrg?.billingEmail,
              country: buyerOrg?.country,
              orgId: bill.orgId,
            }}
            seller={platformInvoiceSeller()}
            remittance={{
              payTo,
              instructions: checkout?.instructions ?? null,
            }}
            statusBadge={
              <span
                className={`plat-bills__badge tone-${serviceBillStatusTone(
                  bill.status,
                )}`}
              >
                {serviceBillStatusLabel(bill.status)}
              </span>
            }
            toolbar={
              <button
                type="button"
                className="sb-invoice__print-btn"
                onClick={() => window.print()}
              >
                Print invoice
              </button>
            }
            invoiceRef={invoiceRef}
          />
        </div>

        <div className="order-detail-page__rail no-print">
          <div className="order-detail-page__rail-body">
            <section className="plat-settings__card order-detail-gateway">
              <div className="plat-settings__card-body order-detail-gateway__body">
                <div className="order-detail-gateway__pay-panel">
                  <div className="order-detail-gateway__amount">
                    <div className="order-detail-gateway__chain-icons" aria-hidden>
                      <AssetIcon asset={BILL_ASSET} />
                      <NetworkIcon network={BILL_NETWORK} />
                    </div>
                    <span className="order-detail-gateway__amount-label">
                      Amount due
                    </span>
                    <p className="order-detail-gateway__amount-value fund-amount">
                      {bill.totalAmount} {BILL_ASSET}
                    </p>
                    <p className="order-detail-gateway__amount-net">
                      <NetworkIcon network={BILL_NETWORK} />
                      <span>{networkDisplay}</span>
                    </p>
                  </div>

                  <div className="order-detail-gateway__qr-wrap">
                    <div className="order-detail-gateway__qr">
                      {checkoutLoading ? (
                        <span className="muted">Loading QR…</span>
                      ) : qrPayload && payable ? (
                        <>
                          <PaymentQrCanvas
                            payload={qrPayload}
                            size={204}
                            alt="Service bill payment QR"
                          />
                          <span
                            className="order-detail-gateway__qr-mark"
                            aria-hidden
                          >
                            <QrCenterNetworkMark network={BILL_NETWORK} />
                          </span>
                        </>
                      ) : (
                        <span className="muted">
                          {paid
                            ? "Paid — QR closed"
                            : voided
                              ? "Voided"
                              : "QR unavailable"}
                        </span>
                      )}
                    </div>
                    <p
                      className={`order-detail-gateway__timer${
                        paid || voided || !payable ? " is-terminal" : ""
                      }`}
                    >
                      {paid
                        ? "Payment completed — QR no longer needed"
                        : voided
                          ? "Bill voided"
                          : isOverdue
                            ? "Overdue — settle remittance promptly"
                            : payable
                              ? `Due ${formatShortTime(bill.dueAt)}`
                              : serviceBillStatusLabel(bill.status)}
                    </p>
                  </div>

                  <div className="order-detail-gateway__address-block">
                    <span className="order-detail-gateway__field-label">
                      Payment address
                    </span>
                    <div className="order-detail-gateway__address-row">
                      <div
                        className="order-detail-gateway__address-icons"
                        aria-hidden
                      >
                        <AssetIcon asset={BILL_ASSET} />
                        <NetworkIcon network={BILL_NETWORK} />
                      </div>
                      <p
                        className="order-detail-gateway__address mono"
                        title={payTo || undefined}
                      >
                        {payTo || "—"}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="order-detail-gateway__copy-btn"
                      onClick={() => void copyPayTo()}
                      disabled={!payTo}
                    >
                      {copied ? "Copied" : "Copy address"}
                    </button>
                  </div>

                  <p className="order-detail-gateway__hint muted">
                    Platform remittance — not a guest payment order address.
                  </p>
                </div>
              </div>
            </section>

            <aside className="order-detail-page__aside">
              <section className="plat-settings__card order-detail-aside-card order-detail-chain">
                <div className="plat-settings__card-head order-detail-chain__head">
                  <h2 className="plat-settings__card-title">Payment status</h2>
                  <div className="order-detail-chain__head-meta">
                    <span
                      className={`plat-bills__badge tone-${serviceBillStatusTone(
                        bill.status,
                      )}${isOverdue ? " is-pulse" : ""}`}
                    >
                      {serviceBillStatusLabel(bill.status)}
                    </span>
                  </div>
                </div>
                <div className="plat-settings__card-body">
                  <p className="order-detail-chain__status">
                    <span className="order-detail-chain__status-count">
                      {formatBillId(bill.id)}
                    </span>
                    <span className="order-detail-chain__status-note">
                      {paid
                        ? "Platform marked this service bill paid."
                        : voided
                          ? "This bill was voided — no remittance due."
                          : isOverdue
                            ? "Past due — send USDT remittance to the address on the left."
                            : "Send USDT remittance to the platform billing address."}
                    </span>
                  </p>
                  {bill.paymentReference ? (
                    <label className="order-detail-chain__tx plat-settings__field">
                      <span>Payment reference</span>
                      <div className="field-shell">
                        <input
                          className="plat-settings__input mono"
                          readOnly
                          value={bill.paymentReference}
                          aria-label="Payment reference"
                        />
                      </div>
                    </label>
                  ) : null}
                </div>
              </section>

              <section className="plat-settings__card order-detail-aside-card order-detail-timeline-card">
                <div className="plat-settings__card-head">
                  <h2 className="plat-settings__card-title">Bill timeline</h2>
                </div>
                <div className="plat-settings__card-body">
                  <ol
                    className={`order-detail-timeline${
                      paid ? " is-done" : ""
                    }`}
                  >
                    <li className={timelineStepClass(0, timelineIndex)}>
                      <div className="order-detail-timeline__mark" aria-hidden>
                        <span className="order-detail-timeline__dot" />
                      </div>
                      <div className="order-detail-timeline__body">
                        <div className="order-detail-timeline__row">
                          <strong>Issued</strong>
                          <span>{formatShortTime(bill.createdAt)}</span>
                        </div>
                        <p>Platform SaaS invoice opened for this period</p>
                      </div>
                    </li>
                    <li className={timelineStepClass(1, timelineIndex)}>
                      <div className="order-detail-timeline__mark" aria-hidden>
                        <span className="order-detail-timeline__dot" />
                      </div>
                      <div className="order-detail-timeline__body">
                        <div className="order-detail-timeline__row">
                          <strong>
                            {isOverdue ? "Overdue" : "Awaiting remittance"}
                          </strong>
                          <span>{formatShortTime(bill.dueAt)}</span>
                        </div>
                        <p>
                          {isOverdue
                            ? "Past due date — settle to avoid restriction"
                            : "Pay USDT to the platform billing address"}
                        </p>
                      </div>
                    </li>
                    <li className={timelineStepClass(2, timelineIndex)}>
                      <div className="order-detail-timeline__mark" aria-hidden>
                        <span className="order-detail-timeline__dot" />
                      </div>
                      <div className="order-detail-timeline__body">
                        <div className="order-detail-timeline__row">
                          <strong>Paid</strong>
                          <span>
                            {paid ? formatShortTime(bill.paidAt) : "—"}
                          </span>
                        </div>
                        <p>Platform confirms remittance received</p>
                      </div>
                    </li>
                  </ol>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </div>

      {!canPay ? (
        <p className="muted no-print" style={{ marginTop: 12 }}>
          View-only access — remittance checkout actions require Owner or
          Administrator.
        </p>
      ) : null}
    </div>
  );
}
