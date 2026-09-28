import { Link, useNavigate } from "react-router-dom";
import type { PaymentOrder } from "../api";
import { matchingModeLabel } from "../matchingLabels";
import { formatShortTime, orderStatusLabel, orderStatusTone } from "../orderStatus";
import { NetworkIcon } from "../../platform/cryptoIcons";
import { networkShortLabel } from "../../shared/assetNetworks";
import { StatusBadge } from "../../shared/StatusBadge";
import { merchantRoute } from "../../shared/portalRouting";
import { orderTime } from "./format";

type Props = {
  orders: PaymentOrder[];
  loading: boolean;
  emptyText: string;
  whereLabel: (order: PaymentOrder) => string;
  title?: string;
};

export function RecentOrdersTable({
  orders,
  loading,
  emptyText,
  whereLabel,
  title = "Recent payment orders",
}: Props) {
  const navigate = useNavigate();
  return (
    <section className="merchant-dash-orders">
      <div className="plat-dash-merchants__head">
        <h2>{title}</h2>
        <Link className="plat-dash-merchants__all" to={merchantRoute("orders")}>
          View all
        </Link>
      </div>
      {loading ? (
        <p className="muted plat-dash-merchants__empty">Loading orders…</p>
      ) : orders.length === 0 ? (
        <p className="muted plat-dash-merchants__empty">{emptyText}</p>
      ) : (
        <div className="merchant-dash-orders__scroll">
          <div className="orders-table merchant-dash-orders__table" role="table">
            <div className="orders-head" role="row">
              <span>ORDER</span>
              <span>DATE</span>
              <span>WHERE</span>
              <span>AMOUNT</span>
              <span>NETWORK</span>
              <span>MODE</span>
              <span>STATUS</span>
            </div>
            {orders.map((o) => (
              <button
                key={o.id}
                type="button"
                className="orders-row"
                role="row"
                onClick={() => navigate(merchantRoute(`orders/${o.id}`))}
              >
                <span className="mono">{o.orderNumber}</span>
                <span className="muted">{formatShortTime(orderTime(o))}</span>
                <span className="merchant-dash__where" title={whereLabel(o)}>
                  {whereLabel(o)}
                </span>
                <span>
                  {o.payableAmount.amount} {o.asset}
                </span>
                <span className="merchant-dash__order-net">
                  <NetworkIcon network={o.network} />
                  <span>{networkShortLabel(o.network)}</span>
                </span>
                <span className="muted">{matchingModeLabel(o.matchingMode)}</span>
                <span>
                  <StatusBadge
                    tone={orderStatusTone(o.status, o)}
                    live={o.status === "verifying"}
                    alarm={o.status === "payment_anomaly"}
                  >
                    {orderStatusLabel(o.status, o)}
                  </StatusBadge>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
