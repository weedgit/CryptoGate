import { sendCsv, sendError, sendJson } from "../http/json.mjs";
import { requireCaller, assertApiKeyScope } from "../http/require-caller.mjs";
import {
  canExportPaymentOrders,
  canReadPaymentOrder,
  paymentOrderListScope,
} from "../orgs/role-policy.mjs";
import { paymentOrdersToCsv } from "./order-csv.mjs";
import { parseListOrdersQuery } from "./order-list-query.mjs";
import { resolvePaymentOrderListQuery } from "./order-list-resolve.mjs";
import { expandPaymentOrderReadFilter } from "./order-list-scope.mjs";
import { listPaymentOrders, toPaymentOrder } from "./order-store.mjs";

const EMPTY_SUMMARY = {
  count: 0,
  invoiceAmountUsd: null,
  byAsset: [],
};

/**
 * @param {{
 *   rows: object[],
 *   total: number,
 *   limit: number,
 *   offset: number,
 *   summary?: typeof EMPTY_SUMMARY,
 * }} result
 * @param {boolean} csv
 * @param {import("node:http").ServerResponse} res
 */
function sendListResult(result, csv, res) {
  if (csv) {
    if (result.total > 5000) {
      sendError(
        res,
        400,
        "invalid_request",
        "Too many rows to export (max 5000). Narrow period or merchant/site, or request an async export.",
      );
      return;
    }
    sendCsv(res, 200, "payment-orders.csv", paymentOrdersToCsv(result.rows));
    return;
  }
  sendJson(res, 200, {
    items: result.rows.map(toPaymentOrder),
    total: result.total,
    limit: result.limit,
    offset: result.offset,
    summary: result.summary ?? {
      count: result.total,
      invoiceAmountUsd: null,
      byAsset: [],
    },
  });
}

/**
 * GET /v1/orders — list (JSON) or export (format=csv) in merchant scope.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
export async function handleListPaymentOrders(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return;
  if (!assertApiKeyScope(caller, res, "orders")) return;

  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const parsed = parseListOrdersQuery(url.searchParams, req.headers.accept);
  if (!parsed.ok) {
    sendError(res, parsed.status, parsed.code, parsed.message);
    return;
  }

  if (parsed.csv && !canExportPaymentOrders(caller)) {
    sendError(res, 403, "forbidden", "Cashiers cannot export payment orders");
    return;
  }

  const resolved = await resolvePaymentOrderListQuery(caller, parsed);
  if (!resolved.ok) {
    sendError(res, resolved.status, resolved.code, resolved.message);
    return;
  }

  const treeEmpty =
    resolved.query.kind === "filter" &&
    Array.isArray(resolved.query.treeOrgIds) &&
    resolved.query.treeOrgIds.length === 0 &&
    !resolved.query.orgId;

  const result = treeEmpty
    ? {
        rows: [],
        total: 0,
        limit: parsed.limit,
        offset: parsed.offset,
        summary: EMPTY_SUMMARY,
      }
    : await listPaymentOrders(resolved.query);

  sendListResult(result, parsed.csv, res);
}

/**
 * Parent merchant O/A/V may read descendant site orders (org tree).
 * @param {{
 *   userId: string,
 *   platformOperator: boolean,
 *   memberships: { orgId: string, role: string, orgType: string }[],
 * }} caller
 * @param {{ orgId: string, createdBy: string }} order
 */
export async function callerCanReadPaymentOrder(caller, order) {
  if (canReadPaymentOrder(caller, order)) return true;
  const scope = paymentOrderListScope(caller);
  if (scope.kind !== "scoped" || scope.treeRoots.length === 0) return false;
  const filter = await expandPaymentOrderReadFilter(scope);
  return filter.kind === "filter" && filter.treeOrgIds.includes(order.orgId);
}
