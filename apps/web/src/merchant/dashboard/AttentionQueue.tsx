import { Link, useNavigate } from "react-router-dom";
import type { PaymentOrder } from "../api";
import { anomalyExplain, formatShortTime } from "../orderStatus";
import { truncateAddress } from "../org";
import { networkShortLabel } from "../../shared/assetNetworks";
import { merchantRoute } from "../../shared/portalRouting";
import { orderTime } from "./format";
import { ChartHelpButton } from "../../platform/ui/ChartHelpButton";
import { CARD_HELP } from "../cardHelp";

type Props = {
  orders: PaymentOrder[];
  loading: boolean;
};

export function AttentionQueue({ orders, loading }: Props) {
  const navigate = useNavigate();
  return (
    <section className="merchant-dash-anomalies">
      <div className="plat-dash-merchants__head">
        <h2>
          Open Attention
          <ChartHelpButton openOnHover label="About open attention" text={CARD_HELP.openAttention} />
        </h2>
        <Link className="plat-dash-merchants__all" to={merchantRoute("orders")}>
          View all
        </Link>
      </div>
      {loading ? (
        <p className="muted plat-dash-merchants__empty">Loading…</p>
      ) : orders.length === 0 ? (
        <p className="muted plat-dash-merchants__empty">
          No open invoices need Attention.
        </p>
      ) : (
        <ul className="merchant-dash-anomalies__list">
          {orders.map((o) => {
            const explain = anomalyExplain({
              reason: o.anomalyReason,
              matchingMode: o.matchingMode,
              payableAmount: o.payableAmount?.amount,
              receivedAmount: o.receivedAmount?.amount,
              hasTx: Boolean(o.receivedAmount?.amount),
            });
            return (
              <li key={o.id}>
                <button
                  type="button"
                  className="merchant-dash-anomalies__row"
                  onClick={() => navigate(merchantRoute(`orders/${o.id}`))}
                >
                  <div className="merchant-dash-anomalies__top">
                    <span className="mono">#{o.orderNumber}</span>
                    <span className="muted">{formatShortTime(orderTime(o))}</span>
                  </div>
                  <p className="merchant-dash-anomalies__title">{explain.title}</p>
                  <p className="merchant-dash-anomalies__meta muted">
                    {o.payableAmount.amount} {o.asset} ·{" "}
                    {networkShortLabel(o.network)}
                    {o.receiveAddress ? ` · ${truncateAddress(o.receiveAddress)}` : ""}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
