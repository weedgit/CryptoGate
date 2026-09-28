import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import type { PaymentDetails, PaymentOrder } from "../api";
import {
  formatExpiryRemaining,
  orderStatusLabel,
  orderStatusTone,
} from "../orderStatus";
import { OrderChannelTag } from "../../shared/OrderChannelTag";
import { StatusBadge } from "../../shared/StatusBadge";
import { AssetIcon, NetworkIcon } from "../../platform/cryptoIcons";
import type { OrderDetailView } from "./orderDetailView";

type Props = {
  slot: HTMLElement;
  backTo: string;
  isPlatform: boolean;
  order: PaymentOrder | null;
  pay: PaymentDetails | null;
  view: OrderDetailView;
};

export function OrderDetailTopbar({
  slot,
  backTo,
  isPlatform,
  order,
  pay,
  view,
}: Props) {
  const {
    orderNumber,
    asset,
    amount,
    invoiceUsd,
    pricingRate,
    rateSource,
    pricingMode,
    referenceRate,
    referenceSource,
    rateWarning,
    quoteExpiresAt,
    status,
    network,
    networkDisplay,
  } = view;

  return createPortal(
    <div className="order-detail-topbar no-print" aria-label="Order context">
      <div className="order-detail-topbar__lead">
        <Link className="order-detail-topbar__back" to={backTo}>
          {isPlatform ? "← Invoice" : "← Invoice"}
        </Link>
        <span className="order-detail-topbar__divider" aria-hidden />
        <div className="order-detail-topbar__identity">
          <span className="order-detail-topbar__kicker">Payment order</span>
          <span className="order-detail-topbar__title">
            {orderNumber}
            {order ? (
              <OrderChannelTag via={order.createdVia} className="order-detail-topbar__channel" />
            ) : null}
          </span>
        </div>
      </div>
      <div className="order-detail-topbar__meta">
        <span className="order-detail-topbar__amount fund-amount">
          <AssetIcon asset={asset} />
          <span>
            {amount} {asset}
          </span>
        </span>
        {invoiceUsd ? (
          <>
            <span className="order-detail-topbar__sep" aria-hidden>
              ·
            </span>
            <span className="order-detail-topbar__net" title="Invoice">
              {order?.invoiceDenomination === "crypto" ||
              pay?.invoiceDenomination === "crypto"
                ? `${invoiceUsd ? `~$${invoiceUsd} USD · ` : ""}${amount} ${asset} (exact)`
                : `$${invoiceUsd} ${order?.invoiceCurrency === "EUR" || pay?.invoiceCurrency === "EUR" ? "USD equiv" : "USD"}${
                    (order?.invoiceCurrency === "EUR" ||
                      pay?.invoiceCurrency === "EUR") &&
                    (order?.invoiceAmount || pay?.invoiceAmount)
                      ? ` · ${order?.invoiceAmount ?? pay?.invoiceAmount} EUR`
                      : ""
                  }`}
              {pricingRate
                ? ` · 1 ${asset} = $${pricingRate}${rateSource ? ` (${rateSource})` : ""}${pricingMode ? ` · ${pricingMode}` : ""}${
                    referenceRate
                      ? ` · ref $${referenceRate}${referenceSource ? ` (${referenceSource})` : ""}`
                      : ""
                  }${rateWarning ? ` · ${rateWarning}` : ""}`
                : ""}
              {quoteExpiresAt && status === "pending_payment"
                ? ` · quote ${formatExpiryRemaining(quoteExpiresAt) ?? ""}`
                : ""}
            </span>
          </>
        ) : null}
        <span className="order-detail-topbar__sep" aria-hidden>
          ·
        </span>
        <span className="order-detail-topbar__net">
          <NetworkIcon network={network} />
          <span>{networkDisplay}</span>
        </span>
      </div>
      <div className="order-detail-topbar__status">
        <StatusBadge
          tone={orderStatusTone(status, order)}
          live={status === "verifying" || status === "pending_payment"}
          alarm={status === "payment_anomaly"}
        >
          {orderStatusLabel(status, order)}
        </StatusBadge>
      </div>
    </div>,
    slot,
  );
}
