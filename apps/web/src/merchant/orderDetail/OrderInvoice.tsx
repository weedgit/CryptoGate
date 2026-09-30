import type { Ref } from "react";
import type {
  OnChainDetails,
  OrgAccount,
  PaymentDetails,
  PaymentOrder,
} from "../api";
import { matchingModeLabel } from "../matchingLabels";
import { networkLabel } from "../org";
import { PaymentOrderInvoiceFace } from "../../billing/PaymentOrderInvoiceFace";
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
    qrPayload,
  } = view;

  return (
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
        invoiceDenomination: order?.invoiceDenomination ?? null,
        invoiceCurrency: order?.invoiceCurrency ?? pay?.invoiceCurrency ?? null,
        invoiceAmount: order?.invoiceAmount ?? null,
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
        createdAt: order?.createdAt ?? pay?.createdAt,
        paidAt,
        siteName: order?.orgName ?? null,
        businessTimezone: order?.businessTimezone ?? pay?.businessTimezone ?? null,
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
        iconKey: sellerOrg?.iconKey ?? null,
        orgId: sellerOrgId,
      }}
      onChain={
        chain || pay?.txHash
          ? {
              txHash: chain?.txHash ?? pay?.txHash ?? null,
              fromAddress: chain?.fromAddress ?? null,
              amount: chain?.amount?.amount ?? received ?? null,
              confirmedAt: chain?.confirmedAt ?? pay?.confirmedAt ?? null,
            }
          : null
      }
      remittance={{ paymentPageUrl: pay?.paymentPageUrl, qrPayload }}
      invoiceRef={invoiceRef}
    />
  );
}
