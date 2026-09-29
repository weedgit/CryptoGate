import { Link } from "react-router-dom";
import type { PaymentOrder } from "../api";
import { merchantRoute, platformRoute } from "../../shared/portalRouting";
import { SharePayLink } from "../../shared/SharePayLink";

type Props = {
  order: PaymentOrder | null;
  paymentPageUrl: string | null | undefined;
  isPlatform: boolean;
  showCancel: boolean;
  cancelling: boolean;
  onCancel: () => void;
};

export function OrderRailActions({
  order,
  paymentPageUrl,
  isPlatform,
  showCancel,
  cancelling,
  onCancel,
}: Props) {
  const canShare =
    !isPlatform && Boolean(paymentPageUrl) && order?.status === "pending_payment";
  return (
    <div className="order-detail-page__rail-actions">
      {canShare && order && paymentPageUrl ? (
        <SharePayLink
          className="order-detail-page__share"
          url={paymentPageUrl}
          amountLabel={
            order.invoiceAmount && order.invoiceDenomination !== "crypto"
              ? `${order.invoiceAmount} ${order.invoiceCurrency ?? "USD"}`
              : `${order.payableAmount.amount} ${order.asset}`
          }
          merchantName={order.orgName}
          expiresAt={order.expiresAt}
          timeZone={order.businessTimezone}
        />
      ) : null}
      <div className="order-detail-page__rail-action">
        {paymentPageUrl ? (
          <a
            href={paymentPageUrl}
            target="_blank"
            rel="noreferrer"
            className="order-detail-gateway__guest-btn"
          >
            Open guest payment page
          </a>
        ) : (
          <span className="order-detail-page__rail-action-spacer" aria-hidden />
        )}
      </div>
      <div className="order-detail-page__rail-action order-detail-page__foot">
        {showCancel ? (
          <button
            type="button"
            className="order-detail-page__cancel"
            disabled={cancelling}
            onClick={onCancel}
          >
            {cancelling ? "Cancelling…" : "Cancel pending order"}
          </button>
        ) : null}
        {!isPlatform ? (
          <Link className="order-detail-page__cta" to={merchantRoute("charge")}>
            New charge
          </Link>
        ) : order?.orgId ? (
          <Link
            className="order-detail-page__cta"
            to={platformRoute(`accounts/merchants/${order.orgId}`)}
          >
            Open merchant
          </Link>
        ) : (
          <Link className="order-detail-page__cta" to={platformRoute("invoices")}>
            Back to support
          </Link>
        )}
      </div>
    </div>
  );
}
