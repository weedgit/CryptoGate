import { Link } from "react-router-dom";
import type { PaymentOrder } from "../api";
import { orderStatusLabel, orderStatusTone } from "../orderStatus";
import { OrderChannelTag } from "../../shared/OrderChannelTag";
import { StatusBadge } from "../../shared/StatusBadge";
import { InvoicePrintButton } from "../../billing/InvoicePrintButton";
import { platformRoute } from "../../shared/portalRouting";
import type { OrderDetailView } from "./orderDetailView";

type Props = {
  backTo: string;
  backLabel: string;
  isPlatform: boolean;
  order: PaymentOrder | null;
  view: OrderDetailView;
};

/** Back link, order id, status and print — same header as the service bill detail. */
export function OrderDetailHeader({ backTo, backLabel, isPlatform, order, view }: Props) {
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
        {order ? (
          <OrderChannelTag via={order.createdVia} />
        ) : null}
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
      <InvoicePrintButton />
    </header>
  );
}
