import { getAssetNetworkConfig, OrderStatus } from "@paymentgate/domain";
import { readJsonBody, sendError, sendJson } from "../http/json.mjs";
import { requireCaller, assertApiKeyScope } from "../http/require-caller.mjs";
import { callerCanReadPaymentOrder } from "./order-list-routes.mjs";
import {
  findOrderById,
  toPaymentOrder,
  withCreateOrderLock,
} from "./order-store.mjs";
import { getPool } from "../db/pool.mjs";
import { resolveOrderQuote } from "../rates/resolve-order-quote.mjs";

/**
 * POST /v1/orders/:id/quote — refresh FX lock while order is still pending.
 * Body optional: { asset?, network? } to change pay rail when quote expired.
 */
export async function handleRefreshPaymentOrderQuote(req, res, orderId) {
  const caller = await requireCaller(req, res);
  if (!caller) return;
  if (!assertApiKeyScope(caller, res, "orders")) return;

  const existing = await findOrderById(orderId);
  if (!existing) {
    sendError(res, 404, "not_found", "Order not found");
    return;
  }
  if (!(await callerCanReadPaymentOrder(caller, existing))) {
    sendError(res, 403, "forbidden", "Not allowed to quote this order");
    return;
  }
  if (existing.status !== OrderStatus.PendingPayment) {
    sendError(res, 409, "order_not_quotable", "Only pending orders can refresh quotes");
    return;
  }

  let body = {};
  try {
    if (req.headers["content-length"] && req.headers["content-length"] !== "0") {
      body = await readJsonBody(req);
    }
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const asset =
    typeof body.asset === "string" && body.asset.trim()
      ? body.asset.trim()
      : existing.asset;
  const network =
    typeof body.network === "string" && body.network.trim()
      ? body.network.trim()
      : existing.network;
  const config = getAssetNetworkConfig(asset, network);
  if (!config) {
    sendError(res, 422, "asset_network_disabled", "Asset and network are not enabled");
    return;
  }

  const denomination = existing.invoice_denomination === "crypto" ? "crypto" : "fiat";
  const quoted = await resolveOrderQuote({
    orgId: existing.org_id,
    amountUsd: String(existing.invoice_amount_usd ?? existing.payable_amount),
    invoiceAmount: String(existing.invoice_amount ?? existing.invoice_amount_usd ?? existing.payable_amount),
    invoiceCurrency: existing.invoice_currency === "EUR" ? "EUR" : "USD",
    invoiceDenomination: denomination,
    amountCrypto:
      denomination === "crypto"
        ? String(existing.invoice_amount ?? existing.payable_amount)
        : null,
    asset,
    network,
    decimals: config.decimals,
    minAmount: config.minAmount,
  });
  if (!quoted.ok) {
    sendError(res, quoted.status, quoted.code, quoted.message);
    return;
  }
  const quote = quoted.quote;

  // Changing asset/network mid-flight is only allowed when quote expired or same pair.
  const pairChanged = asset !== existing.asset || network !== existing.network;
  if (pairChanged) {
    const qExp = existing.quote_expires_at
      ? new Date(existing.quote_expires_at).getTime()
      : 0;
    if (qExp > Date.now()) {
      sendError(
        res,
        409,
        "quote_still_active",
        "Wait for the current quote to expire before changing asset/network",
      );
      return;
    }
  }

  const row = await withCreateOrderLock(
    existing.org_id,
    asset,
    network,
    async (client) => {
      const { rows } = await client.query(
        `UPDATE payment_orders
         SET payable_amount = $2,
             asset = $3,
             network = $4,
             market_rate = $5,
             pricing_rate = $6,
             pricing_mode = $7,
             rate_source = $8,
             rate_fetched_at = $9::timestamptz,
             quote_expires_at = $10::timestamptz,
             pay_amount_base_units = $11,
             asset_decimals = $12,
             invoice_amount_usd = COALESCE(invoice_amount_usd, $13),
             invoice_currency = COALESCE($18, invoice_currency),
             invoice_amount = COALESCE($19, invoice_amount),
             invoice_denomination = COALESCE($20, invoice_denomination),
             rate_sources = $14::jsonb,
             reference_rate = $15,
             reference_source = $16,
             rate_warning = $17,
             expires_at = LEAST(expires_at, $10::timestamptz),
             updated_at = now()
         WHERE id = $1::uuid
           AND status = 'pending_payment'
         RETURNING *`,
        [
          orderId,
          quote.payAmount,
          asset,
          network,
          quote.marketRate,
          quote.pricingRate,
          quote.pricingMode,
          quote.rateSource,
          quote.rateFetchedAt,
          quote.quoteExpiresAt,
          quote.payAmountBaseUnits,
          quote.assetDecimals,
          quote.invoiceAmountUsd,
          quote.rateSources ? JSON.stringify(quote.rateSources) : null,
          quote.referenceRate ?? null,
          quote.referenceSource ?? null,
          quote.rateWarning ?? null,
          quote.invoiceCurrency ?? null,
          quote.invoiceAmount ?? null,
          quote.invoiceDenomination ?? null,
        ],
      );
      return rows[0] ?? null;
    },
  );

  if (!row) {
    sendError(res, 409, "order_not_quotable", "Order could not be re-quoted");
    return;
  }
  sendJson(res, 200, toPaymentOrder(row));
}

/** @deprecated unused helper kept for tests */
export function _pool() {
  return getPool();
}
