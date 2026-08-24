import { getAssetNetworkConfig } from "@cryptogate/domain";

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
 * Guest QR URI — not a chain RPC URL.
 * @param {{ receiveAddress: string, amount: string, asset: string, network: string }} p
 */
export function qrPayloadForOrder(p) {
  const q = new URLSearchParams({
    amount: p.amount,
    asset: p.asset,
    network: p.network,
  });
  return `${p.network}:${p.receiveAddress}?${q.toString()}`;
}

/**
 * OpenAPI PaymentDetails. No keys, xPub, fees, or session.
 * @param {object} row — payment_orders row plus org_name
 */
export function toPaymentDetails(row) {
  const config = getAssetNetworkConfig(row.asset, row.network);
  const display = config?.displayNetwork ?? `${row.network} ${row.asset}`;
  const details = {
    orderNumber: row.order_number,
    status: row.status,
    merchantName: row.org_name,
    matchingMode: row.matching_mode,
    paymentPageUrl: `${paymentPageBaseUrl()}/pay/${row.id}`,
    qrPayload: qrPayloadForOrder({
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
    wrongNetworkWarning: `Send only ${row.asset} on ${display}. Wrong network may result in lost funds.`,
  };
  if (row.matching_mode === "C") {
    details.payExactAmountWarning =
      "Send the exact payable amount. A different amount will not match this order.";
  }
  if (row.matching_mode === "D" && row.memo_or_tag) {
    details.memoWarning = "Include the memo/tag or the payment cannot be matched.";
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
   *   createdBy?: string,
   * }} */
  const order = {
    id: row.id,
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
  };
  if (row.created_by) {
    order.createdBy = row.created_by;
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
