import { ServiceBillStatus, ServiceBillUpdateAction } from "@cryptogate/domain";
import { readJsonBody, sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { findOrgById } from "../orgs/org-store.mjs";
import { listOrgsInSubtree } from "../orgs/org-scope.mjs";
import { findMerchantCommercial } from "../commercial/merchant-commercial-store.mjs";
import {
  canCheckoutServiceBill,
  canIssueServiceBill,
  canUpdateServiceBill,
  canViewServiceBill,
  isMerchantOrgType,
  serviceBillListScope,
} from "../orgs/role-policy.mjs";
import { AUDIT_ACTIONS } from "../audit/audit-rules.mjs";
import { insertAuditEvent } from "../audit/audit-store.mjs";
import { resolvePlatformBillingPayTo } from "../platform-settings/billing-wallet-store.mjs";
import {
  parseServiceBillStatusFilter,
  toServiceBill,
  toServiceBillCheckout,
  checkoutAllowedForBillStatus,
  validateIssueServiceBillBody,
  validateUpdateServiceBillBody,
  applyUsdAdjustment,
} from "./service-bill-rules.mjs";
import { roundUsd } from "./generate-rules.mjs";
import {
  findServiceBillById,
  insertServiceBill,
  listServiceBills,
  markServiceBillPaid,
  voidServiceBill,
  adjustServiceBill,
  sumCompletedPayableVolume,
} from "./service-bill-store.mjs";

const SERVICE_BILL_LIST_MAX = 5000;

function parseServiceBillListLimit(raw) {
  if (raw == null || raw === "") return 100;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 1) return 100;
  return Math.min(n, SERVICE_BILL_LIST_MAX);
}

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
    limit: parseServiceBillListLimit(url.searchParams.get("limit")),
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

  let tier = validated.tier;
  let volumeFeePercent = validated.volumeFeePercent;
  let billedVolumeUsd = validated.billedVolumeUsd;

  if (!tier || !volumeFeePercent || billedVolumeUsd == null) {
    const commercial = await findMerchantCommercial(validated.orgId);
    if (commercial) {
      tier = tier ?? commercial.tier ?? null;
      volumeFeePercent =
        volumeFeePercent ??
        (commercial.volume_fee_percent != null
          ? String(commercial.volume_fee_percent)
          : null);
    }
    if (billedVolumeUsd == null) {
      const subtree = await listOrgsInSubtree([validated.orgId]);
      const volumeOrgIds = subtree
        .filter((r) => r.type === "merchant" || r.type === "merchant_site")
        .map((r) => r.id);
      const inclusiveStartIso = `${validated.periodStart}T00:00:00.000Z`;
      const end = new Date(`${validated.periodEnd}T00:00:00.000Z`);
      end.setUTCDate(end.getUTCDate() + 1);
      const exclusiveEndIso = end.toISOString();
      const volumeRaw = await sumCompletedPayableVolume(
        volumeOrgIds,
        inclusiveStartIso,
        exclusiveEndIso,
      );
      billedVolumeUsd = roundUsd(volumeRaw);
    }
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
    tier,
    volumeFeePercent,
    billedVolumeUsd,
  });

  await insertAuditEvent({
    actorUserId: caller.userId,
    orgId: validated.orgId,
    action: AUDIT_ACTIONS.serviceBillIssue,
    metadata: {
      billId: row.id,
      totalAmount: row.total_amount,
      tier: tier ?? null,
      volumeFeePercent: volumeFeePercent ?? null,
      billedVolumeUsd: billedVolumeUsd ?? null,
    },
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

  if (mode === "checkout" && !checkoutAllowedForBillStatus(row.status)) {
    sendError(
      res,
      422,
      "bill_not_payable",
      "Service bill cannot be paid in its current status",
    );
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
  const bill = toServiceBill(loaded.row);
  // Receipt / invoice remittance: snapshotted rx, else live platform fee wallet.
  const remittancePayTo =
    (typeof loaded.row.rx_address === "string" && loaded.row.rx_address.trim()) ||
    (await resolvePlatformBillingPayTo());
  if (remittancePayTo) {
    bill.remittancePayTo = remittancePayTo;
  }
  sendJson(res, 200, bill);
}

/**
 * GET /v1/service-bills/{billId}/checkout
 */
export async function handleGetServiceBillCheckout(req, res, billId) {
  const loaded = await loadReadableBill(req, res, billId, "checkout");
  if (!loaded) return;
  const payTo = await resolvePlatformBillingPayTo();
  sendJson(
    res,
    200,
    toServiceBillCheckout(loaded.row, payTo ? { payTo } : {}),
  );
}

/**
 * PATCH /v1/service-bills/{billId} — platform operator only (v0.3.2).
 */
export async function handleUpdateServiceBill(req, res, billId) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  if (!canUpdateServiceBill(caller)) {
    sendError(res, 403, "forbidden", "Only platform operators may update service bills");
    return;
  }

  const row = await findServiceBillById(billId);
  if (!row) {
    sendError(res, 404, "not_found", "Service bill not found");
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const validated = validateUpdateServiceBillBody(body, row.status);
  if (!validated.ok) {
    sendError(res, validated.status, validated.code, validated.message);
    return;
  }

  /** @type {object | null} */
  let updated = null;

  if (validated.action === ServiceBillUpdateAction.MarkPaid) {
    let rxAddress = validated.rxAddress;
    if (!rxAddress) {
      rxAddress = (await resolvePlatformBillingPayTo()) || null;
    }
    updated = await markServiceBillPaid(billId, {
      paymentReference: validated.paymentReference,
      rxAddress,
      txAddress: validated.txAddress,
    });
    if (updated) {
      await insertAuditEvent({
        actorUserId: caller.userId,
        orgId: row.org_id,
        action: AUDIT_ACTIONS.serviceBillMarkPaid,
        metadata: {
          billId,
          paymentReference: validated.paymentReference,
          rxAddress,
          txAddress: validated.txAddress,
        },
      });
    }
  } else if (validated.action === ServiceBillUpdateAction.Void) {
    updated = await voidServiceBill(billId, validated.reason);
    if (updated) {
      await insertAuditEvent({
        actorUserId: caller.userId,
        orgId: row.org_id,
        action: AUDIT_ACTIONS.serviceBillVoid,
        metadata: { billId, reason: validated.reason },
      });
    }
  } else if (validated.action === ServiceBillUpdateAction.Adjust) {
    let nextTotal;
    try {
      nextTotal = applyUsdAdjustment(row.total_amount, validated.adjustmentAmount);
    } catch {
      sendError(res, 400, "invalid_request", "Invalid adjustmentAmount");
      return;
    }
    updated = await adjustServiceBill(
      billId,
      nextTotal,
      validated.reason,
      validated.adjustmentAmount,
    );
    if (updated) {
      await insertAuditEvent({
        actorUserId: caller.userId,
        orgId: row.org_id,
        action: AUDIT_ACTIONS.serviceBillAdjust,
        metadata: {
          billId,
          adjustmentAmount: validated.adjustmentAmount,
          totalAmount: nextTotal,
        },
      });
    }
  }

  if (!updated) {
    sendError(
      res,
      422,
      "invalid_transition",
      "Service bill cannot transition in its current status",
    );
    return;
  }

  sendJson(res, 200, toServiceBill(updated));
}
