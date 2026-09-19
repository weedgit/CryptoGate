import { getAssetNetworkConfig } from "@paymentgate/domain";

/**
 * Merchant "for what" reference stored in merchant_metadata.reference.
 * @param {unknown} metadata
 * @returns {string | null}
 */
export function merchantReferenceFromMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const ref = /** @type {{ reference?: unknown }} */ (metadata).reference;
  if (typeof ref !== "string") return null;
  const trimmed = ref.trim();
  return trimmed || null;
}

function expiresAtIso(value) {
  return value instanceof Date ? value.toISOString() : String(value);
}

function paymentPageBaseUrl() {
  const raw = process.env.PAYMENT_PAGE_BASE_URL;
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim().replace(/\/$/, "");
  }
  return "http://localhost:5173";
}

/**
 * Address-hint URI for wallets that parse `network:address?amount&asset`.
 * Not the primary POS QR — see {@link qrPayloadForOrder}.
 * @param {{ receiveAddress: string, amount: string, asset: string, network: string }} p
 */
export function walletUriForOrder(p) {
  const q = new URLSearchParams({
    amount: p.amount,
    asset: p.asset,
    network: p.network,
  });
  return `${p.network}:${p.receiveAddress}?${q.toString()}`;
}

/**
 * Guest/POS QR payload — HTTPS payment page (camera opens amount + asset).
 * Not a chain RPC URL.
 * @param {{ paymentPageUrl: string }} p
 */
export function qrPayloadForOrder(p) {
  return p.paymentPageUrl;
}

/**
 * OpenAPI PaymentDetails. No keys, xPub, fees, or session.
 * @param {object} row — payment_orders row plus org_name
 */
export function toPaymentDetails(row) {
  const config = getAssetNetworkConfig(row.asset, row.network);
  const display = config?.displayNetwork ?? `${row.network} ${row.asset}`;
  const requiredFromRow = Number(row.required_confirmations);
  const requiredConfirmations =
    Number.isFinite(requiredFromRow) && requiredFromRow > 0
      ? requiredFromRow
      : (config?.requiredConfirmations ?? 1);
  const confFromRow = Number(row.confirmations);
  const confirmations =
    Number.isFinite(confFromRow) && confFromRow >= 0 ? confFromRow : 0;
  const paymentPageUrl = `${paymentPageBaseUrl()}/pay/${row.id}`;
  const details = {
    orderNumber: row.order_number,
    status: row.status,
    merchantName: row.org_name,
    matchingMode: row.matching_mode,
    paymentPageUrl,
    qrPayload: qrPayloadForOrder({ paymentPageUrl }),
    walletUri: walletUriForOrder({
      receiveAddress: row.receive_address,
      amount: row.payable_amount,
      asset: row.asset,
      network: row.network,
    }),
    receiveAddress: row.receive_address,
    payableAmount: { amount: row.payable_amount, currency: row.asset },
    copyAmount: row.payable_amount,
    asset: row.asset,
    network: row.network,
    contractAddress: config?.contractAddress ?? null,
    memoOrTag: row.memo_or_tag ?? null,
    expiresAt: expiresAtIso(row.expires_at),
    wrongNetworkWarning: `Send only ${row.asset} on ${display}. Use this network and token exactly. A different chain or token may not be detected, and those funds can be lost.`,
    confirmations,
    requiredConfirmations,
    txHash: row.tx_hash ?? null,
    createdAt: row.created_at ? expiresAtIso(row.created_at) : null,
    confirmedAt: row.confirmed_at ? expiresAtIso(row.confirmed_at) : null,
    anomalyReason: row.anomaly_reason ?? null,
  };
  if (row.matching_mode === "C") {
    details.payExactAmountWarning =
      "Send the exact payable amount. A different amount will not match this order.";
  }
  if (row.matching_mode === "D" && row.memo_or_tag) {
    details.memoWarning = "Include the memo/tag or the payment cannot be matched.";
  }
  if (row.invoice_amount_usd != null) {
    details.invoiceAmountUsd = String(row.invoice_amount_usd);
    details.invoiceCurrency = row.invoice_currency ?? "USD";
  }
  if (row.invoice_amount != null) {
    details.invoiceAmount = String(row.invoice_amount);
  }
  if (row.invoice_denomination != null) {
    details.invoiceDenomination = row.invoice_denomination;
  }
  if (row.pricing_rate != null) {
    details.pricingRate = String(row.pricing_rate);
    details.marketRate =
      row.market_rate != null ? String(row.market_rate) : null;
    details.pricingMode = row.pricing_mode ?? null;
    details.rateSource = row.rate_source ?? null;
    details.rateFetchedAt = row.rate_fetched_at
      ? expiresAtIso(row.rate_fetched_at)
      : null;
    details.quoteExpiresAt = row.quote_expires_at
      ? expiresAtIso(row.quote_expires_at)
      : null;
  }
  if (row.rate_sources != null) {
    details.rateSources = row.rate_sources;
  }
  if (row.reference_rate != null) {
    details.referenceRate = String(row.reference_rate);
    details.referenceSource = row.reference_source ?? null;
  }
  if (row.rate_warning != null) {
    details.rateWarning = String(row.rate_warning);
  }
  return details;
}

/**
 * Map a DB row to OpenAPI PaymentOrder.
 * @param {object} row
 */
export function toPaymentOrder(row) {
  /** @type {{
   *   id: string,
   *   orgId: string,
   *   orderNumber: string,
   *   status: string,
   *   matchingMode: string,
   *   payableAmount: { amount: string, currency: string },
   *   receivedAmount: { amount: string, currency: string } | null,
   *   receiveAddress: string,
   *   addressSource: string,
   *   hdIndex: number | null,
   *   memoOrTag: string | null,
   *   asset: string,
   *   network: string,
   *   expiresAt: string,
   *   createdAt: string,
   *   createdBy?: string,
   *   anomalyReason?: string | null,
   * }} */
  const order = {
    id: row.id,
    orgId: row.org_id,
    orderNumber: row.order_number,
    status: row.status,
    matchingMode: row.matching_mode,
    payableAmount: { amount: row.payable_amount, currency: row.asset },
    receivedAmount:
      row.received_amount == null
        ? null
        : { amount: row.received_amount, currency: row.asset },
    receiveAddress: row.receive_address,
    addressSource: row.address_source,
    hdIndex: row.hd_index ?? null,
    memoOrTag: row.memo_or_tag ?? null,
    asset: row.asset,
    network: row.network,
    expiresAt: expiresAtIso(row.expires_at),
    createdAt: expiresAtIso(row.created_at),
    anomalyReason: row.anomaly_reason ?? null,
    anomalyResolutionNote: row.anomaly_resolution_note ?? null,
    anomalyResolvedAt: row.anomaly_resolved_at
      ? expiresAtIso(row.anomaly_resolved_at)
      : null,
    fulfillmentPolicy: row.fulfillment_policy ?? "on_completed",
  };
  if (row.created_by) {
    order.createdBy = row.created_by;
  }
  if (row.org_name) {
    order.orgName = row.org_name;
  }
  if (row.creator_email) {
    order.createdByEmail = row.creator_email;
  }
  const merchantReference = merchantReferenceFromMetadata(row.merchant_metadata);
  if (merchantReference) {
    order.merchantReference = merchantReference;
  }
  if (row.invoice_amount_usd != null) {
    order.invoiceAmountUsd = String(row.invoice_amount_usd);
    order.invoiceCurrency = row.invoice_currency ?? "USD";
  }
  if (row.invoice_amount != null) {
    order.invoiceAmount = String(row.invoice_amount);
  }
  if (row.invoice_denomination != null) {
    order.invoiceDenomination = row.invoice_denomination;
  }
  if (row.market_rate != null) order.marketRate = String(row.market_rate);
  if (row.pricing_rate != null) order.pricingRate = String(row.pricing_rate);
  if (row.pricing_mode != null) order.pricingMode = row.pricing_mode;
  if (row.rate_source != null) order.rateSource = row.rate_source;
  if (row.rate_fetched_at != null) {
    order.rateFetchedAt = expiresAtIso(row.rate_fetched_at);
  }
  if (row.quote_expires_at != null) {
    order.quoteExpiresAt = expiresAtIso(row.quote_expires_at);
  }
  if (row.pay_amount_base_units != null) {
    order.payAmountBaseUnits = String(row.pay_amount_base_units);
  }
  if (row.asset_decimals != null) {
    order.assetDecimals = Number(row.asset_decimals);
  }
  if (row.rate_sources != null) {
    order.rateSources = row.rate_sources;
  }
  if (row.reference_rate != null) {
    order.referenceRate = String(row.reference_rate);
    order.referenceSource = row.reference_source ?? null;
  }
  if (row.rate_warning != null) {
    order.rateWarning = String(row.rate_warning);
  }
  return order;
}

/**
 * OpenAPI OnChainDetails. Watcher-owned facts only — never invent height,
 * payer address, or confirmedAt from updated_at. Missing columns stay null.
 * @param {object} row
 */
export function toOnChainDetails(row) {
  return {
    txHash: row.tx_hash ?? null,
    blockHeight: row.block_height ?? null,
    fromAddress: row.from_address ?? null,
    toAddress: row.receive_address ?? null,
    amount:
      row.received_amount == null
        ? null
        : { amount: row.received_amount, currency: row.asset },
    confirmedAt: row.confirmed_at
      ? new Date(row.confirmed_at).toISOString()
      : null,
  };
}
