import { ServiceBillStatus } from "@paymentgate/domain";
import { readJsonBody, sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { AUDIT_ACTIONS } from "../audit/audit-rules.mjs";
import { insertAuditEvent } from "../audit/audit-store.mjs";
import { emitDashboardLive } from "../events/dashboard-events-hub.mjs";
import { findOrgById } from "../orgs/org-store.mjs";
import {
  canManageBillingWaivers,
  canReadBillingWaivers,
} from "../orgs/role-policy.mjs";
import {
  findMerchantCommercial,
  setBillingAnchorFromActivationPaid,
} from "../commercial/merchant-commercial-store.mjs";
import {
  deleteActivationWaiver,
  deleteFeeWaiver,
  findActivationWaiver,
  listActivationWaivers,
  listFeeWaivers,
  upsertActivationWaiver,
  upsertFeeWaiver,
} from "./billing-waiver-store.mjs";
import {
  activationWaiverCloseReason,
  toActivationWaiver,
  toFeeWaiver,
  validateActivationWaiverBody,
  validateFeeWaiverBody,
} from "./billing-waiver-rules.mjs";
import { findActiveActivationBill, waiveServiceBill } from "./service-bill-store.mjs";
import { maybeCreateActivationForMerchantOrg } from "./activation.mjs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const OPEN_STATUSES = new Set([
  ServiceBillStatus.Draft,
  ServiceBillStatus.Issued,
  ServiceBillStatus.Overdue,
]);

/**
 * GET /v1/billing-waivers
 */
export async function handleListBillingWaivers(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return;
  if (!canReadBillingWaivers(caller)) {
    sendError(res, 403, "forbidden", "Only platform staff may view billing waivers");
    return;
  }
  const [fee, activation] = await Promise.all([listFeeWaivers(), listActivationWaivers()]);
  sendJson(res, 200, {
    fee: fee.map(toFeeWaiver),
    activation: activation.map(toActivationWaiver),
  });
}

/**
 * Shared guard for PUT / DELETE: platform Owner/Admin, merchant org exists.
 * @returns {Promise<{ caller: object, org: object } | null>}
 */
async function loadWaiverTarget(req, res, orgId) {
  const caller = await requireCaller(req, res);
  if (!caller) return null;
  if (!canManageBillingWaivers(caller)) {
    sendError(
      res,
      403,
      "forbidden",
      "Only platform Owner or Administrator may change billing waivers",
    );
    return null;
  }
  const org = UUID_RE.test(orgId) ? await findOrgById(orgId) : null;
  if (!org || org.type !== "merchant") {
    sendError(res, 404, "not_found", "Merchant org not found");
    return null;
  }
  return { caller, org };
}

async function readBody(req, res) {
  try {
    return { ok: true, body: await readJsonBody(req) };
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return { ok: false };
  }
}

/**
 * PUT /v1/billing-waivers/fee/{orgId} — add or edit (months left + reason).
 */
export async function handlePutFeeWaiver(req, res, orgId) {
  const target = await loadWaiverTarget(req, res, orgId);
  if (!target) return;
  const read = await readBody(req, res);
  if (!read.ok) return;
  const validated = validateFeeWaiverBody(read.body);
  if (!validated.ok) {
    sendError(res, validated.status, validated.code, validated.message);
    return;
  }
  const row = await upsertFeeWaiver({
    orgId,
    monthsLeft: validated.monthsLeft,
    reason: validated.reason,
    createdBy: target.caller.userId,
  });
  await insertAuditEvent({
    actorUserId: target.caller.userId,
    orgId,
    action: AUDIT_ACTIONS.billingWaiverPut,
    metadata: { kind: "fee", monthsLeft: validated.monthsLeft, reason: validated.reason },
  });
  sendJson(res, 200, toFeeWaiver({ ...row, org_name: target.org.name }));
}

/**
 * DELETE /v1/billing-waivers/fee/{orgId}
 */
export async function handleDeleteFeeWaiver(req, res, orgId) {
  const target = await loadWaiverTarget(req, res, orgId);
  if (!target) return;
  const removed = await deleteFeeWaiver(orgId);
  if (!removed) {
    sendError(res, 404, "not_found", "Merchant is not on the waive platform fee list");
    return;
  }
  await insertAuditEvent({
    actorUserId: target.caller.userId,
    orgId,
    action: AUDIT_ACTIONS.billingWaiverDelete,
    metadata: { kind: "fee" },
  });
  res.statusCode = 204;
  res.end();
}

/**
 * PUT /v1/billing-waivers/activation/{orgId}
 * Setup not done yet: listed until setup completes. Setup done: activated now
 * (open activation bill saved as waived), and the entry is not kept.
 */
export async function handlePutActivationWaiver(req, res, orgId) {
  const target = await loadWaiverTarget(req, res, orgId);
  if (!target) return;
  const read = await readBody(req, res);
  if (!read.ok) return;
  const validated = validateActivationWaiverBody(read.body);
  if (!validated.ok) {
    sendError(res, validated.status, validated.code, validated.message);
    return;
  }

  const open = await findActiveActivationBill(orgId);
  const commercial = await findMerchantCommercial(orgId);
  if (commercial?.billing_anchor_at || (open && !OPEN_STATUSES.has(open.status))) {
    sendError(res, 409, "already_activated", "Merchant is already activated");
    return;
  }

  const row = await upsertActivationWaiver({
    orgId,
    reason: validated.reason,
    createdBy: target.caller.userId,
  });
  await insertAuditEvent({
    actorUserId: target.caller.userId,
    orgId,
    action: AUDIT_ACTIONS.billingWaiverPut,
    metadata: { kind: "activation", reason: validated.reason },
  });

  let activated = false;
  if (open) {
    const waived = await waiveServiceBill(open.id, activationWaiverCloseReason(row));
    if (waived) {
      await setBillingAnchorFromActivationPaid(orgId, new Date());
      await deleteActivationWaiver(orgId);
      emitDashboardLive({
        type: "service_bill.waived",
        slices: ["serviceBills"],
        orgId,
      });
      activated = true;
    }
  } else {
    await maybeCreateActivationForMerchantOrg(orgId);
    activated = !(await findActivationWaiver(orgId));
  }

  sendJson(res, 200, {
    ...toActivationWaiver({ ...row, org_name: target.org.name }),
    activated,
  });
}

/**
 * DELETE /v1/billing-waivers/activation/{orgId}
 */
export async function handleDeleteActivationWaiver(req, res, orgId) {
  const target = await loadWaiverTarget(req, res, orgId);
  if (!target) return;
  const removed = await deleteActivationWaiver(orgId);
  if (!removed) {
    sendError(res, 404, "not_found", "Merchant is not on the waive activation list");
    return;
  }
  await insertAuditEvent({
    actorUserId: target.caller.userId,
    orgId,
    action: AUDIT_ACTIONS.billingWaiverDelete,
    metadata: { kind: "activation" },
  });
  res.statusCode = 204;
  res.end();
}
