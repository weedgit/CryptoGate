import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { createPortal } from "react-dom";
import { AuthToast } from "../auth/AuthToast";
import {
  ApiError,
  getOrg,
  getServiceBillCheckout,
  listOrgUsers,
  type OrgAccount,
  type ServiceBill,
  type ServiceBillCheckout,
  type Session,
} from "./api";
import {
  getCachedServiceBill,
  peekServiceBill,
  primeServiceBill,
} from "../shared/serviceBillDetailCache";
import {
  formatBillId,
  isActivationServiceBill,
  serviceBillStatusLabel,
  serviceBillStatusTone,
} from "./serviceBillStatus";
import { sessionCanCheckoutServiceBill } from "./org";
import { formatShortTime } from "./orderStatus";
import {
  platformBillingPayToFallback,
  resolveServiceBillInvoiceSeller,
  ServiceBillInvoiceFace,
} from "../billing/ServiceBillInvoiceFace";
import { InvoicePrintButton } from "../billing/InvoicePrintButton";
import { StatusBadge } from "../shared/StatusBadge";

type Props = { session: Session };

import { merchantRoute } from "../shared/portalRouting";

const BACK_TO = merchantRoute("service-bills");

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

  const [bill, setBill] = useState<ServiceBill | null>(() =>
    id ? peekServiceBill(id) : null,
  );
  const [buyerOrg, setBuyerOrg] = useState<OrgAccount | null>(null);
  const [buyerContactEmail, setBuyerContactEmail] = useState<string | null>(null);
  const [buyerPhone, setBuyerPhone] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<ServiceBillCheckout | null>(null);
  const [loading, setLoading] = useState(() => !(id && peekServiceBill(id)));
  const [error, setError] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [topbarSlot, setTopbarSlot] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    setTopbarSlot(document.getElementById("merchant-topbar-center"));
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    if (!peekServiceBill(id)) setLoading(true);
    setError(null);
    try {
      const row = await getCachedServiceBill(id);
      primeServiceBill(id, row);
      setBill(row);
      try {
        const [org, members] = await Promise.all([
          getOrg(row.orgId),
          listOrgUsers(row.orgId).catch(() => []),
        ]);
        setBuyerOrg(org);
        const preferred =
          members.find((m) => /owner/i.test(m.role)) ??
          members.find((m) => /admin/i.test(m.role)) ??
          members[0];
        setBuyerContactEmail(
          org.billingEmail?.trim() || preferred?.email?.trim() || null,
        );
        setBuyerPhone(preferred?.phone?.trim() || null);
      } catch {
        setBuyerOrg(null);
        setBuyerContactEmail(null);
        setBuyerPhone(null);
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
    if (!id) return;
    const seeded = peekServiceBill(id);
    setBill(seeded);
    if (!seeded) setLoading(true);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadCheckout = useCallback(async () => {
    if (!id || !canPay) return;
    setCheckoutError(null);
    try {
      const payload = await getServiceBillCheckout(id);
      setCheckout(payload);
    } catch (err) {
      setCheckoutError(
        err instanceof ApiError ? err.message : "Failed to load checkout",
      );
      setCheckout(null);
    }
  }, [canPay, id]);

  useEffect(() => {
    if (!bill) return;
    if (bill.status !== "issued" && bill.status !== "overdue") return;
    if (canPay) void loadCheckout();
  }, [bill, canPay, loadCheckout, openCheckout]);

  const payTo =
    bill?.rxAddress?.trim() ||
    bill?.remittancePayTo?.trim() ||
    checkout?.payTo ||
    platformBillingPayToFallback() ||
    null;
  const paid = bill?.status === "paid";
  const payable = bill?.status === "issued" || bill?.status === "overdue";
  const isOverdue = bill?.status === "overdue";
  const isActivation = bill ? isActivationServiceBill(bill) : false;
  const timelineIndex = bill ? billTimelineIndex(bill.status) : 0;

  const topbarChrome =
    topbarSlot && bill
      ? createPortal(
          <div className="order-detail-topbar no-print" aria-label="Service bill context">
            <div className="order-detail-topbar__lead">
              <Link className="order-detail-topbar__back" to={BACK_TO}>
                ← Service bills
              </Link>
              <span className="order-detail-topbar__divider" aria-hidden />
              <div className="order-detail-topbar__identity">
                <span className="order-detail-topbar__kicker">
                  {isActivation ? "Activation fee" : "Service bill"}
                </span>
                <span className="order-detail-topbar__title">
                  {formatBillId(bill.id)}
                </span>
              </div>
            </div>
            <div className="order-detail-topbar__meta">
              <span className="order-detail-topbar__amount fund-amount">
                {bill.totalAmount} USDT
              </span>
            </div>
            <div className="order-detail-topbar__status">
              <StatusBadge
                tone={serviceBillStatusTone(bill.status)}
                alarm={isOverdue}
              >
                {serviceBillStatusLabel(bill.status)}
              </StatusBadge>
            </div>
          </div>,
          topbarSlot,
        )
      : topbarSlot
        ? createPortal(
            <div className="order-detail-topbar no-print" aria-label="Service bill context">
              <div className="order-detail-topbar__lead">
                <Link className="order-detail-topbar__back" to={BACK_TO}>
                  ← Service bills
                </Link>
              </div>
            </div>,
            topbarSlot,
          )
        : null;

  if (loading && !bill) {
    return (
      <div className="bills-detail-page plat-settings plat-settings--merchant">
        {topbarChrome}
        <p className="muted">Loading service bill…</p>
      </div>
    );
  }

  if (error && !bill) {
    return (
      <div className="panel">
        {topbarChrome}
        <AuthToast
          message={error}
          tone="error"
          onDismiss={() => setError(null)}
        />
        <p className="muted">Could not load this service bill.</p>
        <Link className="order-detail-topbar__back" to={BACK_TO}>
          ← Back to service bills
        </Link>
      </div>
    );
  }

  if (!bill) {
    return (
      <div className="bills-detail-page plat-settings plat-settings--merchant">
        {topbarChrome}
        <p className="muted">Service bill unavailable.</p>
        <Link className="order-detail-topbar__back" to={BACK_TO}>
          ← Back to service bills
        </Link>
      </div>
    );
  }

  const toastMessage = error || checkoutError;

  return (
    <div className="bills-detail-page">
      {topbarChrome}
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
            platform billing is settled. Remittance details are on the invoice.
          </p>
        </div>
      ) : null}

      <div className="plat-bill-detail__head bills-detail-page__head no-print">
        <div className="plat-bill-detail__identity">
          <h1 className="plat-bill-detail__id">{formatBillId(bill.id)}</h1>
          <span
            className={`plat-bills__badge tone-${serviceBillStatusTone(bill.status)}${
              isOverdue ? " is-pulse" : ""
            }`}
          >
            {serviceBillStatusLabel(bill.status)}
          </span>
        </div>
        <InvoicePrintButton />
      </div>

      <div className="order-detail-page__invoice-row bills-detail-page__row bills-detail-page__row--invoice">
        <div className="order-detail-page__invoice">
          <ServiceBillInvoiceFace
            bill={bill}
            buyer={{
              name: buyerOrg?.name ?? bill.orgId,
              legalName: buyerOrg?.legalName,
              contactEmail: buyerContactEmail,
              phone: buyerPhone,
              country: buyerOrg?.country,
            }}
            seller={resolveServiceBillInvoiceSeller({ bill })}
            remittance={{
              payTo,
              instructions: checkout?.instructions ?? null,
            }}
            qrPayload={checkout?.qrPayload}
            invoiceRef={invoiceRef}
          />
        </div>

        <div className="order-detail-page__rail no-print">
          <div className="order-detail-page__rail-body">
            <aside className="order-detail-page__aside">
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
                          <strong>
                            {isActivation ? "Activation issued" : "Issued"}
                          </strong>
                          <span>{formatShortTime(bill.createdAt)}</span>
                        </div>
                        <p>
                          {isActivation
                            ? "One-time account activation — pay to unlock live features and start the billing schedule"
                            : "Platform SaaS invoice opened for this period"}
                        </p>
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
