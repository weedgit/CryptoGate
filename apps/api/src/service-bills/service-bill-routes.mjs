import { ServiceBillStatus } from "@cryptogate/domain";
import { readJsonBody, sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { findOrgById } from "../orgs/org-store.mjs";
import { listOrgsInSubtree } from "../orgs/org-scope.mjs";
import {
  canCheckoutServiceBill,
  canIssueServiceBill,
  canViewServiceBill,
  isMerchantOrgType,
  serviceBillListScope,
} from "../orgs/role-policy.mjs";
import { AUDIT_ACTIONS } from "../audit/audit-rules.mjs";
import { insertAuditEvent } from "../audit/audit-store.mjs";
import {
  parseServiceBillStatusFilter,
  toServiceBill,
  toServiceBillCheckout,
  validateIssueServiceBillBody,
} from "./service-bill-rules.mjs";
import {
  findServiceBillById,
  insertServiceBill,
  listServiceBills,
} from "./service-bill-store.mjs";

/**
 * Expand list scope to merchant org ids the caller may see.
 * @param {{ kind: "all" } | { kind: "none" } | { kind: "scoped", rootIds: string[] }} scope
 */
async function expandServiceBillOrgIds(scope) {
  if (scope.kind === "all") return { kind: "all" };
  if (scope.kind === "none") return { kind: "filter", orgIds: [] };
  const rows = await listOrgsInSubtree(scope.rootIds);
  const orgIds = rows
    .filter((r) => isMerchantOrgType(r.type))
    .map((r) => r.id);
  return { kind: "filter", orgIds };
}

/**
 * GET /v1/service-bills
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {URL} url
 */
export async function handleListServiceBills(req, res, url) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  const scope = serviceBillListScope(caller);
  if (scope.kind === "none") {
    sendError(res, 403, "forbidden", "Cashiers cannot view service bills");
    return;
  }

  const statusFilter = parseServiceBillStatusFilter(url.searchParams.get("status"));
  if (!statusFilter.ok) {
    sendError(res, statusFilter.status, statusFilter.code, statusFilter.message);
    return;
  }

  const orgIdRaw = url.searchParams.get("orgId");
  const orgId = orgIdRaw && orgIdRaw.trim() ? orgIdRaw.trim() : null;

  const expanded = await expandServiceBillOrgIds(scope);
  if (orgId) {
    if (expanded.kind === "filter" && !expanded.orgIds.includes(orgId)) {
      sendError(res, 403, "forbidden", "Outside service-bill scope");
      return;
    }
  }

  const rows = await listServiceBills({
    kind: expanded.kind === "all" ? "all" : "filter",
    orgIds: expanded.kind === "filter" ? expanded.orgIds : [],
    orgId,
    status: statusFilter.status,
    limit: 100,
  });
  sendJson(res, 200, { items: rows.map(toServiceBill) });
}

/**
 * POST /v1/service-bills — platform only.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
export async function handleIssueServiceBill(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  if (!canIssueServiceBill(caller)) {
    sendError(res, 403, "forbidden", "Only platform operators may issue service bills");
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const validated = validateIssueServiceBillBody(body);
  if (!validated.ok) {
    sendError(res, validated.status, validated.code, validated.message);
    return;
  }

  const org = await findOrgById(validated.orgId);
  if (!org || !isMerchantOrgType(org.type)) {
    sendError(res, 400, "invalid_org_type", "Service bills target merchant orgs only");
    return;
  }

  const row = await insertServiceBill({
    orgId: validated.orgId,
    periodStart: validated.periodStart,
    periodEnd: validated.periodEnd,
    subscriptionAmount: validated.subscriptionAmount,
    volumeFeeAmount: validated.volumeFeeAmount,
    totalAmount: validated.totalAmount,
    dueAt: validated.dueAt,
    status: ServiceBillStatus.Issued,
  });

  await insertAuditEvent({
    actorUserId: caller.userId,
    orgId: validated.orgId,
    action: AUDIT_ACTIONS.serviceBillIssue,
    metadata: { billId: row.id, totalAmount: row.total_amount },
  });

  sendJson(res, 201, toServiceBill(row));
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} billId
 * @param {"view" | "checkout"} mode
 */
async function loadReadableBill(req, res, billId, mode) {
  const caller = await requireCaller(req, res);
  if (!caller) return null;

  const row = await findServiceBillById(billId);
  if (!row) {
    sendError(res, 404, "not_found", "Service bill not found");
    return null;
  }

  const org = await findOrgById(row.org_id);
  if (!org) {
    sendError(res, 404, "not_found", "Service bill not found");
    return null;
  }

  const scope = serviceBillListScope(caller);
  if (scope.kind === "none") {
    sendError(res, 403, "forbidden", "Cashiers cannot view service bills");
    return null;
  }

  /** @type {Set<string> | undefined} */
  let visible;
  if (scope.kind === "scoped") {
    const expanded = await expandServiceBillOrgIds(scope);
    visible = new Set(expanded.orgIds);
  }

  if (!canViewServiceBill(caller, org, visible)) {
    sendError(res, 403, "forbidden", "Outside service-bill scope");
    return null;
  }

  if (mode === "checkout" && !canCheckoutServiceBill(caller, org)) {
    sendError(res, 403, "forbidden", "Not allowed to open service-bill checkout");
    return null;
  }

  return { caller, org, row };
}

/**
 * GET /v1/service-bills/{billId}
 */
export async function handleGetServiceBill(req, res, billId) {
  const loaded = await loadReadableBill(req, res, billId, "view");
  if (!loaded) return;
  sendJson(res, 200, toServiceBill(loaded.row));
}

/**
 * GET /v1/service-bills/{billId}/checkout
 */
export async function handleGetServiceBillCheckout(req, res, billId) {
  const loaded = await loadReadableBill(req, res, billId, "checkout");
  if (!loaded) return;
  sendJson(res, 200, toServiceBillCheckout(loaded.row));
}
