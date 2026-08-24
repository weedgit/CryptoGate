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
    expiresAt:
      row.expires_at instanceof Date
        ? row.expires_at.toISOString()
        : String(row.expires_at),
  };
  if (row.created_by) {
    order.createdBy = row.created_by;
  }
  return order;
}
