import type { OnChainDetails, PaymentDetails, PaymentOrder } from "../api";
import { formatExpiryRemaining, formatShortTime } from "../orderStatus";
import { networkLabel } from "../org";
import {
  StateTimelineCard,
  type StateTimelineStep,
} from "../../billing/StateTimelineCard";
import type { OrderDetailView } from "./orderDetailView";
import { CARD_HELP } from "../cardHelp";

type Props = {
  order: PaymentOrder | null;
  pay: PaymentDetails | null;
  chain: OnChainDetails | null;
  view: OrderDetailView;
};

function buildOrderTimeline({ order, pay, chain, view }: Props): StateTimelineStep[] {
  const { status, hasTx, expiresAt, asset, network, progress, paidAt, reasonLabel } = view;
  const created: StateTimelineStep = {
    id: "created",
    label: "Created",
    detail: `${formatShortTime(order?.createdAt ?? pay?.createdAt)} · ${asset} on ${networkLabel(network)}`,
    tone: "done",
  };
  const detected: StateTimelineStep = {
    id: "detected",
    label: "Detected",
    detail: "Incoming tx seen on chain",
    tone: "done",
  };
  const confirmations = `${progress.total} confirmation${progress.total === 1 ? "" : "s"}`;

  switch (status) {
    case "pending_payment":
      return [
        created,
        {
          id: "awaiting",
          label: "Awaiting payment",
          detail: `Expires ${formatShortTime(expiresAt)} · ${formatExpiryRemaining(expiresAt)}`,
          tone: "current",
        },
        { id: "verifying", label: "Verifying", detail: `${confirmations} required`, tone: "muted" },
        { id: "confirmed", label: "Confirmed", detail: "Settlement validation", tone: "muted" },
      ];
    case "verifying":
      return [
        created,
        detected,
        {
          id: "verifying",
          label: "Verifying",
          detail: `${progress.filled}/${progress.total} confirmations`,
          tone: "current",
        },
        { id: "confirmed", label: "Confirmed", detail: "Settlement validation", tone: "muted" },
      ];
    case "confirmed":
    case "completed":
      return [
        created,
        detected,
        { id: "verifying", label: "Verified", detail: confirmations, tone: "done" },
        {
          id: "confirmed",
          label: status === "completed" ? "Completed" : "Confirmed",
          detail: formatShortTime(paidAt ?? chain?.confirmedAt ?? pay?.confirmedAt),
          tone: "done",
        },
      ];
    case "payment_anomaly":
      return [
        created,
        ...(hasTx ? [detected] : []),
        { id: "attention", label: "Needs attention", detail: reasonLabel, tone: "current" },
      ];
    case "expired":
      return [
        created,
        {
          id: "expired",
          label: "Expired",
          detail: `${formatShortTime(expiresAt)} · no matching payment`,
          tone: "current",
        },
      ];
    case "failed":
      return [created, { id: "failed", label: "Failed", detail: reasonLabel, tone: "current" }];
    case "cancelled":
      if (order?.anomalyResolutionNote) {
        return [
          created,
          ...(hasTx ? [detected] : []),
          { id: "attention", label: "Needs attention", detail: reasonLabel, tone: "done" },
          {
            id: "resolved",
            label: "Resolved",
            detail: `${formatShortTime(order.anomalyResolvedAt)} · ${order.anomalyResolutionNote}`,
            tone: "current",
          },
        ];
      }
      return [
        created,
        { id: "cancelled", label: "Cancelled", detail: "Closed before payment", tone: "current" },
      ];
    default:
      return [created];
  }
}

export function OrderTimelineCard(props: Props) {
  return <StateTimelineCard
      title="Order state timeline"
      steps={buildOrderTimeline(props)}
      help={CARD_HELP.orderTimeline}
    />;
}
