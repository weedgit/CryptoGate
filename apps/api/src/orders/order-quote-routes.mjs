import { OrderStatus } from "@paymentgate/domain";
import { readJsonBody, sendError, sendJson } from "../http/json.mjs";
import { requireCaller, assertApiKeyScope } from "../http/require-caller.mjs";
import { callerCanReadPaymentOrder } from "./order-list-routes.mjs";
import { assignOnOrderCreate } from "./order-matching.mjs";
import { checkMerchantMayCreateOrders, checkNetworkMaintenance } from "./order-create-guards.mjs";
import {
  applyOrderRequote,
  findOrderById,
  lockQuotableOrder,
  toPaymentOrder,
  withCreateOrderLock,
} from "./order-store.mjs";
import { canCreatePaymentOrder } from "../orgs/role-policy.mjs";
import { findOrgById } from "../orgs/org-store.mjs";
import { findBillingMerchantOrg } from "../orgs/org-ancestry.mjs";
import { insertAuditEvent } from "../audit/audit-store.mjs";
import { getEffectiveMatchingMode } from "../matching-mode/matching-mode-store.mjs";
import { bindHdPoolOrder, cooldownHdPoolAddressOfOrder } from "../mode-s/hd-pool-store.mjs";
import { resolveSiteInherit } from "../sites/site-inherit.mjs";
import { resolveOrderQuote } from "../rates/resolve-order-quote.mjs";
import { resolveEffectiveAssetNetworkConfig } from "../platform-settings/network-rail-resolve.mjs";

const REQUOTE_BODY_KEYS = new Set(["asset", "network"]);

/** Aborts the locked transaction (rolls back any HD claim) and carries the HTTP error. */
class RequoteAbort extends Error {
  /**
   * @param {number} status
   * @param {string} code
   * @param {string} message
   * @param {unknown} [details]
   */
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * New payment window: the order's requested validity from now, never past the new quote lock.
 * Orders created before validity_seconds existed get the quote lock.
 * @param {number | null | undefined} validitySeconds
 * @param {string} quoteExpiresAt
 * @param {Date} [now]
 */
export function requoteExpiresAt(validitySeconds, quoteExpiresAt, now = new Date()) {
  const quoteExp = new Date(quoteExpiresAt);
  if (!Number.isInteger(validitySeconds) || validitySeconds <= 0) return quoteExp;
  const window = new Date(now.getTime() + validitySeconds * 1000);
  return window < quoteExp ? window : quoteExp;
}

/**
 * Rules that don't need the database: which re-quotes are allowed at all.
 * @param {{ invoice_denomination?: string | null, asset: string, network: string }} order
 * @param {string} asset
 * @param {string} network
 * @returns {{ status: number, code: string, message: string } | null}
 */
export function requotePairBlock(order, asset, network) {
  const pairChanged = asset !== order.asset || network !== order.network;
  if (pairChanged && order.invoice_denomination === "crypto") {
    return {
      status: 409,
      code: "crypto_invoice_pair_locked",
      message:
        "This invoice is an exact crypto amount; its asset and network cannot change",
    };
  }
  return null;
}

/**
 * POST /v1/orders/:id/quote — re-price a pending, unexpired order.
 * Body optional: { asset?, network? } to move payment to another enabled rail.
 * Re-runs matching (receive address, payable amount, memo) exactly like create.
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
  if (
    !(await callerCanReadPaymentOrder(caller, {
      orgId: existing.org_id,
      createdBy: existing.created_by,
    }))
  ) {
    sendError(res, 403, "forbidden", "Not allowed to quote this order");
    return;
  }
  if (!canCreatePaymentOrder(caller.memberships, existing.org_id)) {
    sendError(res, 403, "forbidden", "Only users who can create payment orders for this account may re-quote");
    return;
  }
  if (existing.status !== OrderStatus.PendingPayment) {
    sendError(res, 409, "order_not_quotable", "Only pending orders can refresh quotes");
    return;
  }
  if (new Date(existing.expires_at).getTime() <= Date.now()) {
    sendError(res, 409, "order_expired", "This order has expired; create a new order");
    return;
  }

  let body = {};
  try {
    if (req.headers["content-length"] && req.headers["content-length"] !== "0") {
      body = (await readJsonBody(req)) ?? {};
    }
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }
  if (typeof body !== "object" || Array.isArray(body)) {
    sendError(res, 400, "invalid_request", "Request body must be an object");
    return;
  }
  if (Object.keys(body).some((k) => !REQUOTE_BODY_KEYS.has(k))) {
    sendError(res, 400, "invalid_request", "Only asset and network may be sent");
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

  const pairBlock = requotePairBlock(existing, asset, network);
  if (pairBlock) {
    sendError(res, pairBlock.status, pairBlock.code, pairBlock.message);
    return;
  }

  const orderOrg = await findOrgById(existing.org_id);
  if (!orderOrg) {
    sendError(res, 404, "not_found", "Merchant org not found");
    return;
  }
  const orgBlock = await checkMerchantMayCreateOrders(orderOrg);
  if (orgBlock) {
    sendError(res, orgBlock.status, orgBlock.code, orgBlock.message);
    return;
  }
  const maintBlock = await checkNetworkMaintenance(network);
  if (maintBlock) {
    sendError(res, maintBlock.status, maintBlock.code, maintBlock.message);
    return;
  }

  const billingMerchant =
    orderOrg.type === "merchant_site"
      ? await findBillingMerchantOrg(orderOrg)
      : orderOrg.type === "merchant"
        ? orderOrg
        : null;
  const config = await resolveEffectiveAssetNetworkConfig(asset, network, {
    orgId: billingMerchant?.id ?? existing.org_id,
    siteId: orderOrg.type === "merchant_site" ? orderOrg.id : null,
  });
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

  /** @type {Record<string, unknown> | null} */
  let row = null;
  try {
    const inherit = await resolveSiteInherit(orderOrg);
    row = await withCreateOrderLock(
      inherit.settlementOrgId,
      asset,
      network,
      async (client) => {
        const locked = await lockQuotableOrder(client, orderId);
        if (!locked) {
          throw new RequoteAbort(409, "order_not_quotable", "Order is no longer pending or has expired");
        }
        const lockedBlock = requotePairBlock(locked, asset, network);
        if (lockedBlock) {
          throw new RequoteAbort(lockedBlock.status, lockedBlock.code, lockedBlock.message);
        }

        const matchingMode = await getEffectiveMatchingMode(inherit.matchingOrgId, client);
        const assigned = await assignOnOrderCreate({
          client,
          orgId: existing.org_id,
          settlementOrgId: inherit.settlementOrgId,
          xpubOrgId: inherit.xpubOrgId,
          walletGroupOrgIds: inherit.walletGroupOrgIds,
          matchingMode,
          asset,
          network,
          amount: quote.payAmount,
          idempotencyKey: locked.idempotency_key,
          requiredConfirmations: config.requiredConfirmations,
          excludeOrderId: orderId,
        });
        if (!assigned.ok) {
          throw new RequoteAbort(assigned.status, assigned.code, assigned.message, assigned.details);
        }

        await cooldownHdPoolAddressOfOrder(client, orderId);

        const updated = await applyOrderRequote(client, orderId, {
          asset,
          network,
          matchingMode: assigned.assign.matchingMode,
          payableAmount: assigned.assign.payableAmount.amount,
          receiveAddress: assigned.assign.receiveAddress,
          addressSource: assigned.assign.addressSource,
          hdIndex: assigned.assign.hdIndex,
          memoOrTag: assigned.assign.memoOrTag,
          requiredConfirmations: config.requiredConfirmations,
          expiresAt: requoteExpiresAt(locked.validity_seconds, quote.quoteExpiresAt),
          quote,
        });
        if (!updated) {
          throw new RequoteAbort(409, "order_not_quotable", "Order could not be re-quoted");
        }

        if (assigned.assign.addressSource === "hd_pool" && assigned.assign.hdIndex != null) {
          await bindHdPoolOrder(client, {
            orgId: inherit.xpubOrgId,
            asset,
            network,
            hdIndex: assigned.assign.hdIndex,
            receiveAddress: assigned.assign.receiveAddress,
            orderId,
          });
        }
        return updated;
      },
    );
  } catch (err) {
    if (err instanceof RequoteAbort) {
      sendError(res, err.status, err.code, err.message, err.details);
      return;
    }
    if (process.env.NODE_ENV !== "test") {
      console.error("re-quote payment order failed", err);
    }
    sendError(res, 500, "internal_error", "Could not re-quote payment order");
    return;
  }

  await insertAuditEvent({
    actorUserId: caller.userId ?? null,
    orgId: existing.org_id,
    action: "payment_order.requoted",
    metadata: {
      orderId,
      from: {
        asset: existing.asset,
        network: existing.network,
        payableAmount: String(existing.payable_amount),
        receiveAddress: existing.receive_address,
      },
      to: {
        asset: row.asset,
        network: row.network,
        payableAmount: String(row.payable_amount),
        receiveAddress: row.receive_address,
      },
      pricingMode: row.pricing_mode,
      pricingRate: row.pricing_rate,
    },
  }).catch(() => {});

  sendJson(res, 200, toPaymentOrder(row));
}
