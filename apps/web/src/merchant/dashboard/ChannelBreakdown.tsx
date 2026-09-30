import { useNavigate } from "react-router-dom";
import type { DashboardReports } from "../../shared/dashboardApi";
import { OrderChannelTag } from "../../shared/OrderChannelTag";
import { merchantRoute } from "../../shared/portalRouting";
import { channelRows } from "./channelRows";
import { formatUsd } from "./format";
import { ChartHelpButton } from "../../platform/ui/ChartHelpButton";
import { CARD_HELP } from "../cardHelp";

type Props = {
  byChannel: DashboardReports["byChannel"];
  periodLabel: string;
};

export function ChannelBreakdown({ byChannel, periodLabel }: Props) {
  const navigate = useNavigate();
  const rows = channelRows(byChannel);
  if (rows.length === 0) return null;
  return (
    <section className="merchant-dash-sites merchant-dash-channels">
      <div className="plat-dash-merchants__head">
        <h2>
          Orders by channel
          <ChartHelpButton openOnHover label="About orders by channel" text={CARD_HELP.channels} />
        </h2>
        <span className="muted merchant-dash-cashiers__period">{periodLabel}</span>
      </div>
      <div className="merchant-dash-orders__scroll">
        <div className="orders-table merchant-dash-orders__table" role="table">
          <div className="orders-head merchant-dash-channels__head" role="row">
            <span>CHANNEL</span>
            <span>ORDERS</span>
            <span>SHARE</span>
            <span>VOLUME</span>
          </div>
          {rows.map((r) => (
            <button
              key={r.key}
              type="button"
              className="orders-row merchant-dash-channels__row"
              role="row"
              onClick={() => navigate(merchantRoute(`orders?status=all&via=${r.key}`))}
            >
              <span>
                <OrderChannelTag via={r.key === "unknown" ? null : r.key} />
              </span>
              <span className="mono">{r.count}</span>
              <span className="merchant-dash-channels__share">
                <span className="merchant-dash-channels__bar" aria-hidden>
                  <span style={{ width: `${r.sharePct}%` }} />
                </span>
                <span className="mono">{r.sharePct}%</span>
              </span>
              <span className="mono">{formatUsd(r.volumeUsd)}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
