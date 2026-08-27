import { MerchantTier } from "@cryptogate/domain";
import { readJsonBody, sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { AUDIT_ACTIONS } from "../audit/audit-rules.mjs";
import { insertAuditEvent } from "../audit/audit-store.mjs";
import {
  insertEnterpriseRateApproval,
} from "../commercial/enterprise-approval-store.mjs";
import {
  toMerchantCommercialSettings,
  validateCommercialAgainstBand,
  validateUpdateMerchantCommercialBody,
} from "../commercial/merchant-commercial-rules.mjs";
import {
  findMerchantCommercial,
  insertMerchantCommercial,
  applyMerchantCommercialImmediate,
  setEnterpriseApprovalPending,
} from "./merchant-commercial-store.mjs";
import { findFeeTierBand } from "../platform-settings/fee-tier-store.mjs";
import { isVisibleOrg, listVisibleOrgs } from "../orgs/org-access.mjs";
import { findOrgById } from "../orgs/org-store.mjs";
import {
  canReadMerchantCommercial,
  canUpdateMerchantCommercial,
  isMerchantOrgType,
} from "../orgs/role-policy.mjs";

/**
 * GET /v1/orgs/{orgId}/commercial
 */
export async function handleGetMerchantCommercial(req, res, orgId) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  const org = await findOrgById(orgId);
  if (!org || !isMerchantOrgType(org.type)) {
    sendError(res, 404, "not_found", "Merchant org not found");
    return;
  }
  const visible = await listVisibleOrgs(caller.platformOperator, caller.memberships);
  if (!isVisibleOrg(visible, orgId)) {
    sendError(res, 404, "not_found", "Merchant org not found");
    return;
  }
  if (!canReadMerchantCommercial(caller, org)) {
    sendError(res, 403, "forbidden", "Not allowed to read merchant commercial settings");
    return;
  }

  const row = await findMerchantCommercial(orgId);
  if (!row) {
    sendError(res, 404, "not_found", "Commercial settings not configured");
    return;
  }
  const bandRow = await findFeeTierBand(row.tier);
  if (!bandRow) {
    sendError(res, 500, "internal_error", "Tier band missing");
    return;
  }
  sendJson(res, 200, toMerchantCommercialSettings(row, bandRow));
}

/**
 * PUT /v1/orgs/{orgId}/commercial
 */
export async function handlePutMerchantCommercial(req, res, orgId) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  const org = await findOrgById(orgId);
  if (!org || !isMerchantOrgType(org.type)) {
    sendError(res, 404, "not_found", "Merchant org not found");
    return;
  }
  const visible = await listVisibleOrgs(caller.platformOperator, caller.memberships);
  if (!isVisibleOrg(visible, orgId)) {
    sendError(res, 404, "not_found", "Merchant org not found");
    return;
  }
  if (!canUpdateMerchantCommercial(caller, org)) {
    sendError(res, 403, "forbidden", "Not allowed to update merchant commercial settings");
    return;
  }

  const existing = await findMerchantCommercial(orgId);
  if (!existing) {
    sendError(res, 404, "not_found", "Commercial settings not configured");
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const validated = validateUpdateMerchantCommercialBody(body, existing.tier);
  if (!validated.ok) {
    sendError(res, validated.status, validated.code, validated.message);
    return;
  }

  const bandRow = await findFeeTierBand(validated.tier);
  const bandCheck = validateCommercialAgainstBand(
    validated.tier,
    validated.volumeFeePercent,
    bandRow,
  );
  if (!bandCheck.ok) {
    sendError(res, bandCheck.status, bandCheck.code, bandCheck.message);
    return;
  }

  if (bandCheck.needsApproval) {
    await insertEnterpriseRateApproval({
      orgId,
      requestedTier: validated.tier,
      requestedVolumeFeePercent: validated.volumeFeePercent,
      requestedByUserId: caller.userId,
    });
    await setEnterpriseApprovalPending(orgId);
    const row = await findMerchantCommercial(orgId);
    sendJson(
      res,
      200,
      toMerchantCommercialSettings(row, bandRow, "pending"),
    );
    await insertAuditEvent({
      actorUserId: caller.userId,
      orgId,
      action: AUDIT_ACTIONS.merchantCommercialPut,
      metadata: {
        tier: validated.tier,
        volumeFeePercent: validated.volumeFeePercent,
        pendingApproval: true,
        reason: validated.reason ?? null,
      },
    });
    return;
  }

  const updated = await applyMerchantCommercialImmediate(orgId, {
    tier: validated.tier,
    volumeFeePercent: validated.volumeFeePercent,
  });
  await insertAuditEvent({
    actorUserId: caller.userId,
    orgId,
    action: AUDIT_ACTIONS.merchantCommercialPut,
    metadata: {
      tier: validated.tier,
      volumeFeePercent: validated.volumeFeePercent,
      reason: validated.reason ?? null,
    },
  });
  const band = await findFeeTierBand(updated.tier);
  sendJson(res, 200, toMerchantCommercialSettings(updated, band));
}

/**
 * Create commercial row on merchant org create.
 * @param {{
 *   orgId: string,
 *   tier: string,
 *   volumeFeePercent: string,
 *   actorUserId: string,
 *   needsApproval?: boolean,
 * }} input
 */
export async function bootstrapMerchantCommercial(input) {
  const row = await insertMerchantCommercial({
    orgId: input.orgId,
    tier: input.tier,
    volumeFeePercent: input.volumeFeePercent,
    enterpriseApprovalStatus: input.needsApproval ? "pending" : null,
  });
  if (input.needsApproval) {
    await insertEnterpriseRateApproval({
      orgId: input.orgId,
      requestedTier: input.tier,
      requestedVolumeFeePercent: input.volumeFeePercent,
      requestedByUserId: input.actorUserId,
    });
  }
  return row;
}

/**
 * @param {unknown} commercial
 * @param {string} [defaultTier]
 */
export function parseCommercialOnCreate(commercial, defaultTier = MerchantTier.Mid) {
  if (!commercial || typeof commercial !== "object") {
    return fail(400, "invalid_request", "commercial is required for merchant orgs");
  }
  const tier =
    typeof commercial.tier === "string" ? commercial.tier : defaultTier;
  if (!Object.values(MerchantTier).includes(tier)) {
    return fail(400, "invalid_request", "Invalid commercial tier");
  }
  const volumeFeePercent =
    typeof commercial.volumeFeePercent === "string"
      ? commercial.volumeFeePercent.trim()
      : "";
  if (!volumeFeePercent) {
    return fail(400, "invalid_request", "commercial.volumeFeePercent is required");
  }
  return { ok: true, tier, volumeFeePercent };
}

function fail(status, code, message) {
  return { ok: false, status, code, message };
}
