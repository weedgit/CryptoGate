import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { PaymentOrder } from "../api";
import { orderStatusLabel, orderStatusTone } from "../orderStatus";
import { OrderChannelTag } from "../../shared/OrderChannelTag";
import { SharePayLink } from "../../shared/SharePayLink";
import { StatusBadge } from "../../shared/StatusBadge";
import { InvoicePrintButton } from "../../billing/InvoicePrintButton";
import { platformRoute } from "../../shared/portalRouting";
import { ChargeLink } from "../chargeLink";
import type { OrderDetailView } from "./orderDetailView";

type Props = {
  backTo: string;
  backLabel: string;
  isPlatform: boolean;
  order: PaymentOrder | null;
  paymentPageUrl: string | null | undefined;
  view: OrderDetailView;
};

/** What the customer is asked to pay, as shown in the shared message. */
export function orderPayLinkAmount(order: PaymentOrder): string {
  return order.invoiceAmount && order.invoiceDenomination !== "crypto"
    ? `${order.invoiceAmount} ${order.invoiceCurrency ?? "USD"}`
    : `${order.payableAmount.amount} ${order.asset}`;
}

function IconShare() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <path
        fill="currentColor"
        d="M18 2a3 3 0 1 1-2.2 5.04l-6.9 3.99a3 3 0 0 1 0 1.94l6.9 3.99a3 3 0 1 1-.9 1.73l-6.95-4.01a3 3 0 1 1 0-5.36l6.95-4.01A3 3 0 0 1 18 2"
      />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function OrderShareButton({ order, url }: { order: PaymentOrder; url: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="order-detail-share" ref={rootRef}>
      <button
        type="button"
        className={`sb-invoice__print-btn${open ? " is-active" : ""}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        <IconShare />
        <span>Share</span>
      </button>
      {open ? (
        <div className="order-detail-share__pop" role="dialog" aria-label="Send payment link">
          <SharePayLink
            url={url}
            amountLabel={orderPayLinkAmount(order)}
            merchantName={order.orgName}
            expiresAt={order.status === "pending_payment" ? order.expiresAt : null}
            timeZone={order.businessTimezone}
          />
        </div>
      ) : null}
    </div>
  );
}

/** Back link, order id, status, share and print — same header as the service bill detail. */
export function OrderDetailHeader({
  backTo,
  backLabel,
  isPlatform,
  order,
  paymentPageUrl,
  view,
}: Props) {
  const { orderNumber, status } = view;
  const siteName = order?.orgName?.trim();

  return (
    <header className="plat-bill-detail__head no-print">
      <Link className="plat-bill-detail__back-link" to={backTo}>
        {backLabel}
      </Link>
      <div className="plat-bill-detail__identity">
        <h1 className="plat-bill-detail__id">#{orderNumber}</h1>
        <StatusBadge
          tone={orderStatusTone(status, order)}
          live={status === "verifying" || status === "pending_payment"}
          alarm={status === "payment_anomaly"}
        >
          {orderStatusLabel(status, order)}
        </StatusBadge>
        {order ? <OrderChannelTag via={order.createdVia} /> : null}
        {siteName ? (
          isPlatform && order?.orgId ? (
            <Link
              className="plat-bill-detail__merchant"
              to={platformRoute(`accounts/merchants/${order.orgId}`)}
            >
              {siteName}
            </Link>
          ) : (
            <span className="plat-bill-detail__merchant">{siteName}</span>
          )
        ) : null}
      </div>
      <div className="order-detail-head__actions">
        {!isPlatform ? (
          <ChargeLink className="sb-invoice__print-btn order-detail-head__new">
            <IconPlus />
            <span>New</span>
          </ChargeLink>
        ) : null}
        {order && paymentPageUrl ? (
          <OrderShareButton order={order} url={paymentPageUrl} />
        ) : null}
        <InvoicePrintButton />
      </div>
    </header>
  );
}
