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
} from "./merchant-commercial-store.mjs";
import { findFeeTierBand } from "../platform-settings/fee-tier-store.mjs";
import {
  defaultMerchantSchedulePlan,
} from "../platform-settings/pricing-resolve.mjs";
import { isVisibleOrg, listVisibleOrgs } from "../orgs/org-access.mjs";
import { findOrgById } from "../orgs/org-store.mjs";
import {
  canReadMerchantCommercial,
  canUpdatePlatformOwnerSettings,
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
 * Platform Owner only — lock a fixed special or return to automatic schedule.
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

  if (!canUpdatePlatformOwnerSettings(caller)) {
    sendError(
      res,
      403,
      "forbidden",
      "Only platform Owner may set or clear fixed commercial rates",
    );
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
    const band = await findFeeTierBand(updated.tier);
    sendJson(res, 200, toMerchantCommercialSettings(updated, band));
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
  const band = await findFeeTierBand(updated.tier);
  sendJson(res, 200, toMerchantCommercialSettings(updated, band));
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
