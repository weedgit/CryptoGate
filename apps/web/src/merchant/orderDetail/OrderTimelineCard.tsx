import type { OnChainDetails, PaymentDetails, PaymentOrder } from "../api";
import { formatShortTime } from "../orderStatus";
import { networkLabel } from "../org";
import type { OrderDetailView } from "./orderDetailView";

/** Latest reached step in the order payment timeline (0 = Created … 3 = Confirmed). */
function orderTimelineStepIndex(status: string, hasTx: boolean): number {
  if (status === "completed" || status === "confirmed") return 3;
  if (status === "verifying") return 2;
  if (hasTx) return 1;
  return 0;
}

function timelineStepClass(stepIndex: number, currentIndex: number): string {
  if (stepIndex < currentIndex) return "is-reached";
  if (stepIndex === currentIndex) return "is-reached is-current";
  return "";
}

type Props = {
  order: PaymentOrder | null;
  pay: PaymentDetails | null;
  chain: OnChainDetails | null;
  view: OrderDetailView;
};

export function OrderTimelineCard({ order, pay, chain, view }: Props) {
  const { status, hasTx, expiresAt, asset, network, progress, paidAt, settled } =
    view;
  const timelineIndex = orderTimelineStepIndex(status, hasTx);

  return (
    <section className="plat-settings__card order-detail-aside-card order-detail-timeline-card">
      <div className="plat-settings__card-head">
        <h2 className="plat-settings__card-title">Order timeline</h2>
      </div>
      <div className="plat-settings__card-body">
        <ul
          className={`order-detail-timeline${
            status === "verifying" ? " is-flowing" : ""
          }${
            status === "completed" || status === "confirmed"
              ? " is-done"
              : ""
          }`}
        >
          <li
            className={timelineStepClass(0, timelineIndex)}
            style={{ ["--i" as string]: 0 }}
          >
            <div className="order-detail-timeline__mark" aria-hidden>
              <span className="order-detail-timeline__dot" />
            </div>
            <div className="order-detail-timeline__body">
              <div className="order-detail-timeline__row">
                <strong>Created</strong>
                <span>{formatShortTime(order?.createdAt ?? expiresAt)}</span>
              </div>
              <p>{asset} payment order initialized</p>
            </div>
          </li>
          <li
            className={timelineStepClass(1, timelineIndex)}
            style={{ ["--i" as string]: 1 }}
          >
            <div className="order-detail-timeline__mark" aria-hidden>
              <span className="order-detail-timeline__dot" />
            </div>
            <div className="order-detail-timeline__body">
              <div className="order-detail-timeline__row">
                <strong>Detected</strong>
                <span>{hasTx ? "Seen on chain" : "—"}</span>
              </div>
              <p>Incoming tx on {networkLabel(network)}</p>
            </div>
          </li>
          <li
            className={timelineStepClass(2, timelineIndex)}
            style={{ ["--i" as string]: 2 }}
          >
            <div className="order-detail-timeline__mark" aria-hidden>
              <span className="order-detail-timeline__dot" />
            </div>
            <div className="order-detail-timeline__body">
              <div className="order-detail-timeline__row">
                <strong>Verifying</strong>
                <span>
                  {status === "verifying"
                    ? `${progress.filled}/${progress.total}`
                    : timelineIndex > 2
                      ? "Done"
                      : "—"}
                </span>
              </div>
              <p>Awaiting required confirmations</p>
            </div>
          </li>
          <li
            className={timelineStepClass(3, timelineIndex)}
            style={{ ["--i" as string]: 3 }}
          >
            <div className="order-detail-timeline__mark" aria-hidden>
              <span className="order-detail-timeline__dot" />
            </div>
            <div className="order-detail-timeline__body">
              <div className="order-detail-timeline__row">
                <strong>Confirmed</strong>
                <span>
                  {paidAt
                    ? formatShortTime(paidAt)
                    : chain?.confirmedAt || pay?.confirmedAt
                      ? formatShortTime(
                          chain?.confirmedAt ?? pay?.confirmedAt,
                        )
                      : settled
                        ? "Done"
                        : "—"}
                </span>
              </div>
              <p>Settlement validation success</p>
            </div>
          </li>
        </ul>
      </div>
    </section>
  );
}
