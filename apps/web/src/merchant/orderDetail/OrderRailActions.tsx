import { Link } from "react-router-dom";
import type { PaymentOrder } from "../api";
import { merchantRoute, platformRoute } from "../../shared/portalRouting";

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
  return (
    <div className="order-detail-page__rail-actions">
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
          <Link className="order-detail-page__cta" to={merchantRoute("orders/new")}>
            Create another payment order
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
