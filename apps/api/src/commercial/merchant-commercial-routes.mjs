import { readJsonBody, sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { AUDIT_ACTIONS } from "../audit/audit-rules.mjs";
import { insertAuditEvent } from "../audit/audit-store.mjs";
import {
  toMerchantCommercialSettings,
  validateCommercialAgainstBand,
  validateUpdateMerchantCommercialBody,
} from "../commercial/merchant-commercial-rules.mjs";
import {
  findMerchantCommercial,
  insertMerchantCommercial,
  applyMerchantCommercialImmediate,
  listMerchantCommercialByOrgIds,
  updateMerchantBillingFlags,
} from "./merchant-commercial-store.mjs";
import { findFeeTierBand } from "../platform-settings/fee-tier-store.mjs";
import {
  defaultMerchantSchedulePlan,
} from "../platform-settings/pricing-resolve.mjs";
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
 * GET /v1/orgs/commercial-summaries?ids=uuid,uuid
 */
export async function handleListMerchantCommercialSummaries(req, res, url) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  const raw = url.searchParams.get("ids")?.trim() ?? "";
  const orgIds = raw
    ? raw.split(",").map((id) => id.trim()).filter(Boolean)
    : [];
  if (orgIds.length === 0) {
    sendJson(res, 200, { items: [] });
    return;
  }
  if (orgIds.length > 200) {
    sendError(res, 400, "invalid_request", "At most 200 org ids per request");
    return;
  }

  const visible = await listVisibleOrgs(caller.platformOperator, caller.memberships);
  const allowed = orgIds.filter((id) => isVisibleOrg(visible, id));
  const rows = await listMerchantCommercialByOrgIds(allowed);
  const items = [];
  for (const row of rows) {
    const bandRow = await findFeeTierBand(row.tier);
    if (!bandRow) continue;
    items.push(toMerchantCommercialSettings(row, bandRow));
  }
  sendJson(res, 200, { items });
}

/**
 * PUT /v1/orgs/{orgId}/commercial
 * Platform Owner/Admin for Automatic + billing flags; Platform Owner only for Fixed.
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

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const existing = await findMerchantCommercial(orgId);
  if (!existing) {
    sendError(res, 404, "not_found", "Commercial settings not configured");
    return;
  }

  const validated = validateUpdateMerchantCommercialBody(body, existing.tier);
  if (!validated.ok) {
    sendError(res, validated.status, validated.code, validated.message);
    return;
  }

  const rateModeHint =
    validated.flagsOnly || validated.rateMode === "automatic"
      ? "automatic"
      : validated.rateMode === "fixed"
        ? "fixed"
        : "automatic";

  if (!canUpdateMerchantCommercial(caller, org, [], { rateMode: rateModeHint })) {
    sendError(
      res,
      403,
      "forbidden",
      rateModeHint === "fixed"
        ? "Only platform Owner may set or clear fixed commercial rates"
        : "Only platform Owner or Administrator may update commercial settings",
    );
    return;
  }

  /**
   * @param {object} row
   */
  async function respondWith(row) {
    let finalRow = row;
    if (validated.hasBillingFlags) {
      finalRow =
        (await updateMerchantBillingFlags(orgId, {
          feeExemptUntil: validated.feeExemptUntil,
          skipActivation: validated.skipActivation,
          billingOpsNote: validated.billingOpsNote,
          serviceBillCreditUsd: validated.serviceBillCreditUsd,
        })) ?? row;
    }
    const band = await findFeeTierBand(finalRow.tier);
    sendJson(res, 200, toMerchantCommercialSettings(finalRow, band));
  }

  if (validated.flagsOnly) {
    const updated = await updateMerchantBillingFlags(orgId, {
      feeExemptUntil: validated.feeExemptUntil,
      skipActivation: validated.skipActivation,
      billingOpsNote: validated.billingOpsNote,
      serviceBillCreditUsd: validated.serviceBillCreditUsd,
    });
    await insertAuditEvent({
      actorUserId: caller.userId,
      orgId,
      action: AUDIT_ACTIONS.merchantCommercialPut,
      metadata: {
        billingFlagsOnly: true,
        feeExemptUntil: validated.feeExemptUntil ?? null,
        skipActivation: validated.skipActivation ?? null,
        serviceBillCreditUsd: validated.serviceBillCreditUsd ?? null,
        reason: validated.reason ?? null,
      },
    });
    const band = await findFeeTierBand((updated ?? existing).tier);
    sendJson(res, 200, toMerchantCommercialSettings(updated ?? existing, band));
    return;
  }

  const wantsAutomatic = validated.rateMode === "automatic";

  if (wantsAutomatic) {
    const plan = await defaultMerchantSchedulePlan();
    const updated = await applyMerchantCommercialImmediate(orgId, {
      tier: plan.tier,
      volumeFeePercent: plan.volumeFeePercent,
      rateMode: "automatic",
    });
    await insertAuditEvent({
      actorUserId: caller.userId,
      orgId,
      action: AUDIT_ACTIONS.merchantCommercialPut,
      metadata: {
        tier: plan.tier,
        volumeFeePercent: plan.volumeFeePercent,
        rateMode: "automatic",
        reason: validated.reason ?? null,
      },
    });
    await respondWith(updated);
    return;
  }

  const volumeFeePercent = validated.volumeFeePercent;
  const bandRow = await findFeeTierBand(validated.tier);
  const bandCheck = validateCommercialAgainstBand(
    validated.tier,
    volumeFeePercent,
    bandRow,
    "fixed",
  );
  if (!bandCheck.ok) {
    sendError(res, bandCheck.status, bandCheck.code, bandCheck.message);
    return;
  }

  const updated = await applyMerchantCommercialImmediate(orgId, {
    tier: validated.tier,
    volumeFeePercent,
    rateMode: "fixed",
  });
  await insertAuditEvent({
    actorUserId: caller.userId,
    orgId,
    action: AUDIT_ACTIONS.merchantCommercialPut,
    metadata: {
      tier: validated.tier,
      volumeFeePercent,
      rateMode: "fixed",
      reason: validated.reason ?? null,
    },
  });
  await respondWith(updated);
}

/**
 * Create commercial row on merchant org create.
 * @param {{
 *   orgId: string,
 *   tier: string,
 *   volumeFeePercent: string,
 *   rateMode?: "automatic" | "fixed",
 *   actorUserId?: string,
 * }} input
 */
export async function bootstrapMerchantCommercial(input) {
  const rateMode = input.rateMode === "fixed" ? "fixed" : "automatic";
  return insertMerchantCommercial({
    orgId: input.orgId,
    tier: input.tier,
    volumeFeePercent: input.volumeFeePercent,
    rateMode,
    enterpriseApprovalStatus: null,
  });
}
