import type {
  OnChainDetails,
  OrgAccount,
  PaymentDetails,
  PaymentOrder,
  Session,
} from "../api";
import { orderFulfillmentHint } from "../fulfillmentLabels";
import {
  anomalyAmountLine,
  anomalyExplain,
  confirmationProgress,
} from "../orderStatus";
import { primaryMerchantOrgId } from "../org";
import { displayNetworkForPair, webChainEnvOverride } from "../../shared/assetNetworks";
import { findAssetNetworkRow } from "@paymentgate/domain";

type Input = {
  id: string;
  order: PaymentOrder | null;
  pay: PaymentDetails | null;
  chain: OnChainDetails | null;
  sellerOrg: OrgAccount | null;
  session: Session;
};

/** Display values merged from the order, its payment details and on-chain data. */
export function deriveOrderDetailView({
  id,
  order,
  pay,
  chain,
  sellerOrg,
  session,
}: Input) {
  const status = order?.status ?? pay?.status ?? "pending_payment";
  const orderNumber = order?.orderNumber ?? pay?.orderNumber ?? id ?? "—";
  const amount = order?.payableAmount.amount ?? pay?.payableAmount.amount ?? "—";
  const invoiceUsd =
    order?.invoiceAmountUsd ?? pay?.invoiceAmountUsd ?? null;
  const pricingRate = order?.pricingRate ?? pay?.pricingRate ?? null;
  const rateSource = order?.rateSource ?? pay?.rateSource ?? null;
  const pricingMode = order?.pricingMode ?? pay?.pricingMode ?? null;
  const quoteExpiresAt =
    order?.quoteExpiresAt ?? pay?.quoteExpiresAt ?? null;
  const referenceRate =
    order?.referenceRate ?? pay?.referenceRate ?? null;
  const referenceSource =
    order?.referenceSource ?? pay?.referenceSource ?? null;
  const rateWarning = order?.rateWarning ?? pay?.rateWarning ?? null;
  const asset = order?.asset ?? pay?.asset ?? "USDT";
  const network = order?.network ?? pay?.network ?? "tron";
  const address = order?.receiveAddress ?? pay?.receiveAddress ?? "";
  const mode = order?.matchingMode ?? pay?.matchingMode ?? "B";
  const expiresAt = order?.expiresAt ?? pay?.expiresAt;
  const hasTx = Boolean(chain?.txHash || pay?.txHash);
  const requiredConfirmations =
    (typeof pay?.requiredConfirmations === "number" &&
    pay.requiredConfirmations > 0
      ? pay.requiredConfirmations
      : null) ??
    findAssetNetworkRow(
      asset as never,
      network as never,
      webChainEnvOverride(),
    )?.requiredConfirmations ??
    1;
  const progress = confirmationProgress({
    status,
    requiredConfirmations,
    confirmations: pay?.confirmations,
    hasTx,
  });
  const isAnomaly = status === "payment_anomaly";
  const received = order?.receivedAmount?.amount ?? chain?.amount?.amount;
  const settled = status === "completed" || status === "confirmed";
  const qrTerminal =
    settled ||
    status === "expired" ||
    status === "payment_anomaly" ||
    status === "failed" ||
    status === "cancelled";
  const paidAt = settled ? chain?.confirmedAt ?? pay?.confirmedAt ?? null : null;
  const createdByLabel =
    order?.createdByName?.trim() ||
    order?.createdByEmail?.trim() ||
    null;
  const sellerOrgId =
    sellerOrg?.id ??
    order?.orgId ??
    primaryMerchantOrgId(session) ??
    "—";
  const networkDisplay = displayNetworkForPair(asset, network);
  const fulfillmentHint = orderFulfillmentHint(order?.fulfillmentPolicy, status);
  const confirmationStatusSuffix = hasTx
    ? " — tx detected on chain"
    : " — awaiting tx";
  const qrPayload = (
    pay?.qrPayload ??
    pay?.paymentPageUrl ??
    address
  ).trim();
  const amountLine = anomalyAmountLine({
    payableAmount: amount,
    receivedAmount: received ?? null,
    asset,
  });
  const explain = anomalyExplain({
    reason: order?.anomalyReason,
    matchingMode: mode,
    payableAmount: amount === "—" ? null : amount,
    receivedAmount: received ?? null,
    hasTx,
  });
  const reasonLabel = explain.title;
  const guidance = explain.guidance;

  return {
    status,
    orderNumber,
    amount,
    invoiceUsd,
    pricingRate,
    rateSource,
    pricingMode,
    quoteExpiresAt,
    referenceRate,
    referenceSource,
    rateWarning,
    asset,
    network,
    address,
    mode,
    expiresAt,
    hasTx,
    progress,
    isAnomaly,
    received,
    settled,
    qrTerminal,
    paidAt,
    createdByLabel,
    sellerOrgId,
    networkDisplay,
    fulfillmentHint,
    confirmationStatusSuffix,
    qrPayload,
    amountLine,
    explain,
    reasonLabel,
    guidance,
  };
}

export type OrderDetailView = ReturnType<typeof deriveOrderDetailView>;
