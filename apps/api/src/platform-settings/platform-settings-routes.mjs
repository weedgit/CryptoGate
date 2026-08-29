import { readJsonBody, sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { AUDIT_ACTIONS } from "../audit/audit-rules.mjs";
import { insertAuditEvent } from "../audit/audit-store.mjs";
import {
  canListEnterpriseApprovals,
  canReadFeeTierBands,
  canReadPlatformOrgPolicy,
  canUpdatePlatformOwnerSettings,
} from "../orgs/role-policy.mjs";
import {
  decideEnterpriseRateApproval,
  findEnterpriseRateApproval,
  insertEnterpriseRateApproval,
  listEnterpriseRateApprovals,
  toEnterpriseRateApproval,
} from "../commercial/enterprise-approval-store.mjs";
import {
  applyMerchantCommercialImmediate,
  finalizeEnterpriseApproval,
  setEnterpriseApprovalPending,
} from "../commercial/merchant-commercial-store.mjs";
import { validateUpdateFeeTierSettingsBody } from "./fee-tier-rules.mjs";
import {
  getFeeTierSettings,
  replaceFeeTierSettings,
  toFeeTierBand,
} from "./fee-tier-store.mjs";
import {
  getPlatformOrgPolicy,
  maxAgentDepthInTree,
  updatePlatformOrgPolicy,
  ALLOWED_SESSION_TIMEOUT_MINUTES,
} from "./org-policy-store.mjs";
import { validateUpdateBillingWalletBody } from "./billing-wallet-rules.mjs";
import {
  getPlatformBillingSettings,
  updatePlatformBillingSettings,
} from "./billing-wallet-store.mjs";

/**
 * GET /v1/platform/settings/fee-tiers
 */
export async function handleGetFeeTierSettings(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return;
  if (!canReadFeeTierBands(caller)) {
    sendError(res, 403, "forbidden", "Not allowed to read fee tier settings");
    return;
  }
  const settings = await getFeeTierSettings();
  sendJson(res, 200, settings);
}

/**
 * PUT /v1/platform/settings/fee-tiers
 */
export async function handlePutFeeTierSettings(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return;
  if (!canUpdatePlatformOwnerSettings(caller)) {
    sendError(res, 403, "forbidden", "Only platform Owner may update fee tiers");
    return;
  }
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }
  const validated = validateUpdateFeeTierSettingsBody(body);
  if (!validated.ok) {
    sendError(res, validated.status, validated.code, validated.message);
    return;
  }
  const settings = await replaceFeeTierSettings(validated.tiers);
  await insertAuditEvent({
    actorUserId: caller.userId,
    orgId: null,
    action: AUDIT_ACTIONS.feeTierPut,
    metadata: { tierCount: validated.tiers.length },
  });
  sendJson(res, 200, settings);
}

/**
 * GET /v1/platform/settings/org-policy
 */
export async function handleGetPlatformOrgPolicy(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return;
  if (!canReadPlatformOrgPolicy(caller)) {
    sendError(res, 403, "forbidden", "Not allowed to read platform org policy");
    return;
  }
  const policy = await getPlatformOrgPolicy();
  sendJson(res, 200, policy);
}

/**
 * PUT /v1/platform/settings/org-policy
 */
export async function handlePutPlatformOrgPolicy(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return;
  if (!canUpdatePlatformOwnerSettings(caller)) {
    sendError(res, 403, "forbidden", "Only platform Owner may update org policy");
    return;
  }
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }
  const raw = body?.maxAgentDepth;
  const maxAgentDepth = Number(raw);
  if (!Number.isInteger(maxAgentDepth) || maxAgentDepth < 0 || maxAgentDepth > 5) {
    sendError(res, 400, "invalid_request", "maxAgentDepth must be an integer 0–5");
    return;
  }
  if (typeof body?.mfaEnforcement !== "boolean") {
    sendError(res, 400, "invalid_request", "mfaEnforcement must be a boolean");
    return;
  }
  const sessionTimeoutMinutes = Number(body?.sessionTimeoutMinutes);
  if (!ALLOWED_SESSION_TIMEOUT_MINUTES.includes(sessionTimeoutMinutes)) {
    sendError(
      res,
      400,
      "invalid_request",
      `sessionTimeoutMinutes must be one of ${ALLOWED_SESSION_TIMEOUT_MINUTES.join(", ")}`,
    );
    return;
  }
  const deepest = await maxAgentDepthInTree();
  if (maxAgentDepth < deepest) {
    sendError(
      res,
      422,
      "depth_orphan_risk",
      `Cannot lower max agent depth below existing subtree depth (${deepest})`,
    );
    return;
  }
  const policy = await updatePlatformOrgPolicy({
    maxAgentDepth,
    mfaEnforcement: body.mfaEnforcement,
    sessionTimeoutMinutes,
  });
  await insertAuditEvent({
    actorUserId: caller.userId,
    orgId: null,
    action: AUDIT_ACTIONS.orgPolicyPut,
    metadata: {
      maxAgentDepth,
      mfaEnforcement: policy.mfaEnforcement,
      sessionTimeoutMinutes: policy.sessionTimeoutMinutes,
    },
  });
  sendJson(res, 200, policy);
}

/**
 * GET /v1/platform/enterprise-rate-approvals
 */
export async function handleListEnterpriseRateApprovals(req, res, url) {
  const caller = await requireCaller(req, res);
  if (!caller) return;
  if (!canListEnterpriseApprovals(caller)) {
    sendError(res, 403, "forbidden", "Not allowed to list enterprise rate approvals");
    return;
  }
  const statusRaw = url.searchParams.get("status");
  const status = statusRaw?.trim() ? statusRaw.trim() : null;
  if (status && !["pending", "approved", "denied"].includes(status)) {
    sendError(res, 400, "invalid_request", "Invalid status filter");
    return;
  }
  const limitRaw = url.searchParams.get("limit");
  const limitN = limitRaw ? Number(limitRaw) : 50;
  if (!Number.isInteger(limitN) || limitN < 1 || limitN > 200) {
    sendError(res, 400, "invalid_request", "limit must be 1–200");
    return;
  }
  const rows = await listEnterpriseRateApprovals({ status, limit: limitN });
  sendJson(res, 200, { items: rows.map(toEnterpriseRateApproval) });
}

/**
 * PATCH /v1/platform/enterprise-rate-approvals/{approvalId}
 */
export async function handleDecideEnterpriseRateApproval(req, res, approvalId) {
  const caller = await requireCaller(req, res);
  if (!caller) return;
  if (!canUpdatePlatformOwnerSettings(caller)) {
    sendError(res, 403, "forbidden", "Only platform Owner may decide enterprise rates");
    return;
  }
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }
  const decision = body?.decision;
  if (decision !== "approve" && decision !== "deny") {
    sendError(res, 400, "invalid_request", "decision must be approve or deny");
    return;
  }
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (decision === "deny" && !reason) {
    sendError(res, 400, "invalid_request", "reason is required when denying");
    return;
  }
  const existing = await findEnterpriseRateApproval(approvalId);
  if (!existing || existing.status !== "pending") {
    sendError(res, 404, "not_found", "Pending approval not found");
    return;
  }
  const status = decision === "approve" ? "approved" : "denied";
  const row = await decideEnterpriseRateApproval(approvalId, {
    status,
    decidedByUserId: caller.userId,
    decisionReason: reason || null,
  });
  if (!row) {
    sendError(res, 404, "not_found", "Pending approval not found");
    return;
  }
  if (decision === "approve") {
    await applyMerchantCommercialImmediate(existing.org_id, {
      tier: existing.requested_tier,
      volumeFeePercent: existing.requested_volume_fee_percent,
    });
  } else {
    await finalizeEnterpriseApproval(existing.org_id, "denied");
  }
  const updated = await findEnterpriseRateApproval(approvalId);
  await insertAuditEvent({
    actorUserId: caller.userId,
    orgId: existing.org_id,
    action: AUDIT_ACTIONS.enterpriseRateDecide,
    metadata: { approvalId, decision, reason: reason || null },
  });
  sendJson(res, 200, toEnterpriseRateApproval({ ...updated, merchant_name: existing.merchant_name }));
}

/**
 * GET /v1/platform/settings/billing-wallet
 */
export async function handleGetBillingWalletSettings(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return;
  if (!canReadPlatformOrgPolicy(caller)) {
    sendError(res, 403, "forbidden", "Not allowed to read billing wallet settings");
    return;
  }
  const settings = await getPlatformBillingSettings();
  sendJson(res, 200, settings);
}

/**
 * PUT /v1/platform/settings/billing-wallet
 */
export async function handlePutBillingWalletSettings(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return;
  if (!canUpdatePlatformOwnerSettings(caller)) {
    sendError(res, 403, "forbidden", "Only platform Owner may update billing wallet");
    return;
  }
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }
  const validated = validateUpdateBillingWalletBody(body);
  if (!validated.ok) {
    sendError(res, validated.status, validated.code, validated.message);
    return;
  }
  const settings = await updatePlatformBillingSettings({
    sellerName: validated.sellerName,
    sellerEmail: validated.sellerEmail,
    payTo: validated.payTo,
  });
  await insertAuditEvent({
    actorUserId: caller.userId,
    orgId: null,
    action: AUDIT_ACTIONS.billingWalletPut,
    metadata: {
      sellerName: settings.sellerName,
      hasSellerEmail: Boolean(settings.sellerEmail),
      hasPayTo: Boolean(settings.payTo),
    },
  });
  sendJson(res, 200, settings);
}

export { toFeeTierBand };
