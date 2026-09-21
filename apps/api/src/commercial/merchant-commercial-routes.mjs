import { MerchantTier } from "@paymentgate/domain";
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
  listMerchantCommercialByOrgIds,
} from "./merchant-commercial-store.mjs";
import { findFeeTierBand } from "../platform-settings/fee-tier-store.mjs";
import {
  defaultMerchantSchedulePlan,
} from "../platform-settings/pricing-resolve.mjs";
import { isVisibleOrg, listVisibleOrgs } from "../orgs/org-access.mjs";
import { findOrgById } from "../orgs/org-store.mjs";
import { collectAncestorOrgIds } from "../orgs/org-ancestry.mjs";
import {
  canReadMerchantCommercial,
  canUpdateMerchantCommercial,
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
 * Fixed rate overrides require Platform Owner. Automatic resets also Owner-only.
 * Legacy in-band tier/rate edits remain available to channel managers when
 * rateMode is omitted (keeps existing agent tooling working).
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
  const ancestors = await collectAncestorOrgIds(org);

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

  const wantsFixed =
    validated.rateMode === "fixed" ||
    (validated.rateMode === undefined && existing.rate_mode === "fixed");
  const wantsAutomatic = validated.rateMode === "automatic";

  if (wantsFixed || wantsAutomatic) {
    if (!canUpdatePlatformOwnerSettings(caller)) {
      sendError(
        res,
        403,
        "forbidden",
        "Only platform Owner may set or clear fixed commercial rates",
      );
      return;
    }
  } else if (!canUpdateMerchantCommercial(caller, org, ancestors)) {
    sendError(res, 403, "forbidden", "Not allowed to update merchant commercial settings");
    return;
  }

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

  const rateMode = wantsFixed ? "fixed" : "automatic";
  const volumeFeePercent = validated.volumeFeePercent;
  const bandRow = await findFeeTierBand(validated.tier);
  const bandCheck = validateCommercialAgainstBand(
    validated.tier,
    volumeFeePercent,
    bandRow,
    rateMode,
  );
  if (!bandCheck.ok) {
    sendError(res, bandCheck.status, bandCheck.code, bandCheck.message);
    return;
  }

  if (bandCheck.needsApproval && rateMode !== "fixed") {
    await insertEnterpriseRateApproval({
      orgId,
      requestedTier: validated.tier,
      requestedVolumeFeePercent: volumeFeePercent,
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
        volumeFeePercent,
        pendingApproval: true,
        reason: validated.reason ?? null,
      },
    });
    return;
  }

  const updated = await applyMerchantCommercialImmediate(orgId, {
    tier: validated.tier,
    volumeFeePercent,
    rateMode,
  });
  await insertAuditEvent({
    actorUserId: caller.userId,
    orgId,
    action: AUDIT_ACTIONS.merchantCommercialPut,
    metadata: {
      tier: validated.tier,
      volumeFeePercent,
      rateMode,
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
 *   actorUserId: string,
 *   needsApproval?: boolean,
 * }} input
 */
export async function bootstrapMerchantCommercial(input) {
  const rateMode = input.rateMode === "fixed" ? "fixed" : "automatic";
  const row = await insertMerchantCommercial({
    orgId: input.orgId,
    tier: input.tier,
    volumeFeePercent: input.volumeFeePercent,
    rateMode,
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
 * Optional commercial on create — omit to auto-bootstrap Mid schedule.
 * @param {unknown} commercial
 * @param {string} [defaultTier]
 */
export function parseCommercialOnCreate(commercial, defaultTier = MerchantTier.Mid) {
  if (commercial === undefined || commercial === null) {
    return { ok: true, omitted: true };
  }
  if (typeof commercial !== "object") {
    return fail(400, "invalid_request", "commercial must be an object");
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
    return fail(400, "invalid_request", "commercial.volumeFeePercent is required when commercial is provided");
  }
  return { ok: true, omitted: false, tier, volumeFeePercent };
}

function fail(status, code, message) {
  return { ok: false, status, code, message };
}
