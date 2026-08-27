import { sendCsv, sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { isVisibleOrg, listVisibleOrgs } from "../orgs/org-access.mjs";
import { listOrgsInSubtree } from "../orgs/org-scope.mjs";
import { findOrgById } from "../orgs/org-store.mjs";
import {
  canExportPaymentOrders,
  canReadPaymentOrder,
  isMerchantOrgType,
  paymentOrderListScope,
} from "../orgs/role-policy.mjs";
import { paymentOrdersToCsv } from "./order-csv.mjs";
import { parseListOrdersQuery } from "./order-list-query.mjs";
import {
  expandPaymentOrderReadFilter,
  orgIdInPaymentOrderFilter,
} from "./order-list-scope.mjs";
import { listPaymentOrders, toPaymentOrder } from "./order-store.mjs";

/**
 * @param {string} agentOrgId
 * @param {object[]} visible
 */
async function merchantOrgIdsInAgentSubtree(agentOrgId, visible) {
  const org = await findOrgById(agentOrgId);
  if (!org || (org.type !== "agent" && org.type !== "agent_sub")) {
    return { ok: false, status: 400, code: "invalid_request", message: "agentOrgId must be an agent org" };
  }
  if (!isVisibleOrg(visible, agentOrgId)) {
    return { ok: false, status: 403, code: "forbidden", message: "Outside merchant scope" };
  }
  const subtree = await listOrgsInSubtree([agentOrgId]);
  const merchantOrgIds = subtree
    .filter((row) => isMerchantOrgType(row.type))
    .map((row) => row.id);
  return { ok: true, merchantOrgIds };
}

/**
 * GET /v1/orders — list (JSON) or export (format=csv) in merchant scope.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
export async function handleListPaymentOrders(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const parsed = parseListOrdersQuery(url.searchParams, req.headers.accept);
  if (!parsed.ok) {
    sendError(res, parsed.status, parsed.code, parsed.message);
    return;
  }

  const scope = paymentOrderListScope(caller);
  if (scope.kind === "none") {
    sendError(res, 403, "forbidden", "Outside merchant scope");
    return;
  }

  if (parsed.csv && !canExportPaymentOrders(caller)) {
    sendError(res, 403, "forbidden", "Cashiers cannot export payment orders");
    return;
  }

  if (parsed.agentOrgId) {
    const visible = await listVisibleOrgs(caller.platformOperator, caller.memberships);
    const resolved = await merchantOrgIdsInAgentSubtree(parsed.agentOrgId, visible);
    if (!resolved.ok) {
      sendError(res, resolved.status, resolved.code, resolved.message);
      return;
    }
    if (parsed.orgId && !resolved.merchantOrgIds.includes(parsed.orgId)) {
      sendError(res, 403, "forbidden", "Outside merchant scope");
      return;
    }
    const filter = await expandPaymentOrderReadFilter(scope);
    const allowedIds =
      filter.kind === "all"
        ? resolved.merchantOrgIds
        : resolved.merchantOrgIds.filter((id) =>
            orgIdInPaymentOrderFilter(filter, id),
          );
    const rows =
      allowedIds.length === 0
        ? []
        : await listPaymentOrders({
            kind: "filter",
            treeOrgIds: allowedIds,
            orgId: parsed.orgId,
            status: parsed.status,
            limit: parsed.limit,
          });
    if (parsed.csv) {
      sendCsv(res, 200, "payment-orders.csv", paymentOrdersToCsv(rows));
      return;
    }
    sendJson(res, 200, { items: rows.map(toPaymentOrder) });
    return;
  }

  const filter = await expandPaymentOrderReadFilter(scope);
  if (parsed.orgId && !orgIdInPaymentOrderFilter(filter, parsed.orgId)) {
    sendError(res, 403, "forbidden", "Outside merchant scope");
    return;
  }

  const rows = await listPaymentOrders({
    kind: filter.kind === "all" ? "all" : "filter",
    treeOrgIds: filter.kind === "filter" ? filter.treeOrgIds : [],
    cashierOrgIds: filter.kind === "filter" ? filter.cashierOrgIds : [],
    createdBy: filter.kind === "filter" ? filter.createdBy : null,
    orgId: parsed.orgId,
    status: parsed.status,
    limit: parsed.limit,
  });

  if (parsed.csv) {
    sendCsv(res, 200, "payment-orders.csv", paymentOrdersToCsv(rows));
    return;
  }

  sendJson(res, 200, { items: rows.map(toPaymentOrder) });
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
