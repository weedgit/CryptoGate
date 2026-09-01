import { sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { listVisibleOrgs } from "../orgs/org-access.mjs";
import { listOrgsInSubtree } from "../orgs/org-scope.mjs";
import { isMerchantOrgType, paymentOrderListScope } from "../orgs/role-policy.mjs";
import { expandPaymentOrderReadFilter } from "../orders/order-list-scope.mjs";
import { summarizePaymentOrders } from "../orders/order-summary-store.mjs";
import { listAuditLog } from "../audit/audit-list-store.mjs";

function parseIsoRange(url) {
  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");
  if (!fromRaw || !toRaw) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "from and to query params are required (ISO date-time)",
    };
  }
  const from = new Date(fromRaw);
  const to = new Date(toRaw);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "from and to must be valid ISO date-times",
    };
  }
  return { ok: true, from, to };
}

/**
 * @param {object} caller
 */
async function scopedOrgIds(caller) {
  const scope = paymentOrderListScope(caller);
  if (scope.kind === "none") return { ok: false, orgIds: [] };
  if (scope.kind === "all") return { ok: true, orgIds: null };
  const filter = await expandPaymentOrderReadFilter(scope);
  if (filter.kind === "all") return { ok: true, orgIds: null };
  const ids = new Set([
    ...(filter.treeOrgIds ?? []),
    ...(filter.cashierOrgIds ?? []),
  ]);
  return { ok: true, orgIds: [...ids] };
}

/**
 * GET /v1/orders/summary?from=&to=
 */
export async function handleGetOrderSummary(req, res, url) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  const range = parseIsoRange(url);
  if (!range.ok) {
    sendError(res, range.status, range.code, range.message);
    return;
  }

  const scoped = await scopedOrgIds(caller);
  if (!scoped.ok) {
    sendError(res, 403, "forbidden", "Outside merchant scope");
    return;
  }

  const summary = await summarizePaymentOrders({
    orgIds: scoped.orgIds,
    from: range.from,
    to: range.to,
  });
  sendJson(res, 200, summary);
}

/**
 * GET /v1/platform/dashboard-summary?from=&to=
 */
export async function handleGetPlatformDashboardSummary(req, res, url) {
  const caller = await requireCaller(req, res);
  if (!caller) return;
  if (!caller.platformOperator) {
    sendError(res, 403, "forbidden", "Platform operator only");
    return;
  }

  const range = parseIsoRange(url);
  if (!range.ok) {
    sendError(res, range.status, range.code, range.message);
    return;
  }

  const [orderSummary, createEvents, inviteEvents] = await Promise.all([
    summarizePaymentOrders({ orgIds: null, from: range.from, to: range.to }),
    listAuditLog({
      kind: "all",
      action: "org_create",
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      limit: 200,
    }).catch(() => []),
    listAuditLog({
      kind: "all",
      action: "org_user_invite",
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      limit: 200,
    }).catch(() => []),
  ]);

  let newMerchants = 0;
  let newAgents = 0;
  let newCashiers = 0;
  for (const e of createEvents) {
    const type = String(e.metadata?.type ?? "");
    if (type === "merchant" || type === "merchant_site") newMerchants += 1;
    else if (type === "agent" || type === "agent_sub") newAgents += 1;
  }
  for (const e of inviteEvents) {
    if (String(e.metadata?.role ?? "") === "cashier") newCashiers += 1;
  }

  sendJson(res, 200, {
    orders: orderSummary,
    signups: { newMerchants, newAgents, newCashiers },
  });
}

/**
 * GET /v1/agent/dashboard-summary?from=&to=
 */
export async function handleGetAgentDashboardSummary(req, res, url) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  const range = parseIsoRange(url);
  if (!range.ok) {
    sendError(res, range.status, range.code, range.message);
    return;
  }

  const visible = await listVisibleOrgs(caller.platformOperator, caller.memberships);
  const merchantIds = new Set();
  const agentRoots = visible.filter(
    (o) => o.type === "agent" || o.type === "agent_sub",
  );
  for (const root of agentRoots) {
    const subtree = await listOrgsInSubtree([root.id]);
    for (const row of subtree) {
      if (isMerchantOrgType(row.type)) merchantIds.add(row.id);
    }
  }
  for (const m of caller.memberships) {
    if (m.orgType === "merchant" || m.orgType === "merchant_site") {
      merchantIds.add(m.orgId);
    }
  }

  const summary = await summarizePaymentOrders({
    orgIds: [...merchantIds],
    from: range.from,
    to: range.to,
  });
  sendJson(res, 200, { orders: summary });
}
