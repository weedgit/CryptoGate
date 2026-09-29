import { Link } from "react-router-dom";
import type { PaymentOrder } from "../api";
import { platformRoute } from "../../shared/portalRouting";

function ActionIcon({ d }: { d: string }) {
  return (
    <svg
      className="order-detail-page__action-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

const ICON_CANCEL = "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M9 9l6 6M15 9l-6 6";
const ICON_STORE = "M4 10v10h16V10M3 10l2-6h14l2 6M3 10h18M10 20v-5h4v5";

type Props = {
  order: PaymentOrder | null;
  isPlatform: boolean;
  showCancel: boolean;
  cancelling: boolean;
  onCancel: () => void;
};

export function OrderRailActions({
  order,
  isPlatform,
  showCancel,
  cancelling,
  onCancel,
}: Props) {
  const openMerchant = isPlatform && order?.orgId;
  if (!showCancel && !openMerchant) return null;
  return (
    <div className="order-detail-page__rail-actions">
      <div className="order-detail-page__rail-action order-detail-page__foot">
        {showCancel ? (
          <button
            type="button"
            className="order-detail-page__cancel"
            disabled={cancelling}
            onClick={onCancel}
          >
            <ActionIcon d={ICON_CANCEL} />
            {cancelling ? "Cancelling…" : "Cancel pending order"}
          </button>
        ) : null}
        {openMerchant ? (
          <Link
            className="order-detail-page__cta"
            to={platformRoute(`accounts/merchants/${order.orgId}`)}
          >
            <ActionIcon d={ICON_STORE} />
            Open merchant
          </Link>
        ) : null}
      </div>
    </div>
  );
}
