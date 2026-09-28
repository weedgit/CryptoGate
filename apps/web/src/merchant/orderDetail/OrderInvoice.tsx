import type { Ref } from "react";
import type {
  OnChainDetails,
  OrgAccount,
  PaymentDetails,
  PaymentOrder,
} from "../api";
import { matchingModeLabel } from "../matchingLabels";
import { orderStatusLabel, orderStatusTone } from "../orderStatus";
import { networkLabel } from "../org";
import { StatusBadge } from "../../shared/StatusBadge";
import { PaymentOrderInvoiceFace } from "../../billing/PaymentOrderInvoiceFace";
import { InvoicePrintButton } from "../../billing/InvoicePrintButton";
import type { OrderDetailView } from "./orderDetailView";

type Props = {
  id: string;
  order: PaymentOrder | null;
  pay: PaymentDetails | null;
  chain: OnChainDetails | null;
  sellerOrg: OrgAccount | null;
  sellerContactEmail: string | null;
  view: OrderDetailView;
  invoiceRef: Ref<HTMLElement>;
};

export function OrderInvoice({
  id,
  order,
  pay,
  chain,
  sellerOrg,
  sellerContactEmail,
  view,
  invoiceRef,
}: Props) {
  const {
    orderNumber,
    status,
    mode,
    amount,
    received,
    invoiceUsd,
    pricingRate,
    pricingMode,
    rateSource,
    referenceRate,
    referenceSource,
    rateWarning,
    quoteExpiresAt,
    asset,
    network,
    address,
    expiresAt,
    paidAt,
    createdByLabel,
    reasonLabel,
    guidance,
    amountLine,
    sellerOrgId,
  } = view;

  return (
    <div className="order-detail-page__invoice-row">
      <div className="order-detail-page__invoice">
        <PaymentOrderInvoiceFace
          order={{
            id: order?.id ?? id ?? orderNumber,
            orderNumber,
            status,
            matchingMode: mode,
            matchingModeLabel: matchingModeLabel(mode),
            payableAmount: amount,
            receivedAmount: received ?? null,
            invoiceAmountUsd: invoiceUsd,
            pricingRate,
            pricingMode,
            rateSource,
            referenceRate,
            referenceSource,
            rateWarning,
            quoteExpiresAt,
            asset,
            network,
            networkLabel: networkLabel(network),
            receiveAddress: address,
            addressSource: order?.addressSource,
            hdIndex: order?.hdIndex,
            memoOrTag: order?.memoOrTag,
            expiresAt,
            createdAt: order?.createdAt,
            paidAt,
            siteName: order?.orgName ?? null,
            createdByLabel,
            merchantReference: order?.merchantReference ?? null,
            anomalyReason: order?.anomalyReason,
            anomalyReasonLabel: reasonLabel,
            anomalyGuidance: guidance,
            anomalyAmountLine: amountLine,
            anomalyResolutionNote: order?.anomalyResolutionNote,
            anomalyResolvedAt: order?.anomalyResolvedAt,
          }}
          seller={{
            name: sellerOrg?.name ?? "Merchant",
            legalName: sellerOrg?.legalName,
            contactEmail: sellerContactEmail,
            orgId: sellerOrgId,
          }}
          onChain={
            chain || pay?.txHash
              ? {
                  txHash: chain?.txHash ?? pay?.txHash ?? null,
                  fromAddress: chain?.fromAddress ?? null,
                  amount: chain?.amount?.amount ?? received ?? null,
                  confirmedAt:
                    chain?.confirmedAt ?? pay?.confirmedAt ?? null,
                }
              : null
          }
          remittance={{ paymentPageUrl: pay?.paymentPageUrl }}
          statusBadge={
            <StatusBadge
              tone={orderStatusTone(status, order)}
              live={status === "verifying"}
              alarm={status === "payment_anomaly"}
            >
              {orderStatusLabel(status, order)}
            </StatusBadge>
          }
          toolbar={
            <InvoicePrintButton label="Print invoice" />
          }
          invoiceRef={invoiceRef}
        />
      </div>
    </div>
  );
}
