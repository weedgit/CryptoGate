import { readJsonBody, sendError, sendJson } from "../http/json.mjs";
import { requireCaller, assertApiKeyScope } from "../http/require-caller.mjs";
import { insertAuditEvent } from "../audit/audit-store.mjs";
import { resolveOrderOrgId } from "../orgs/role-policy.mjs";
import {
  getMerchantPricingSettings,
  getPlatformPricingSettings,
  updateMerchantPricingSettings,
  updatePlatformPricingSettings,
} from "./pricing-settings-store.mjs";

/**
 * GET /v1/platform/settings/pricing
 */
export async function handleGetPlatformPricingSettings(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return;
  if (!assertApiKeyScope(caller, res, "platform")) return;
  const isPlatform = caller.memberships.some((m) => m.orgType === "platform");
  if (!isPlatform) {
    sendError(res, 403, "forbidden", "Platform membership required");
    return;
  }
  sendJson(res, 200, await getPlatformPricingSettings());
}

/**
 * PUT /v1/platform/settings/pricing
 */
export async function handlePutPlatformPricingSettings(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return;
  if (!assertApiKeyScope(caller, res, "platform")) return;
  const isOwner = caller.memberships.some(
    (m) => m.orgType === "platform" && (m.role === "owner" || m.role === "administrator"),
  );
  if (!isOwner) {
    sendError(res, 403, "forbidden", "Platform Owner/Admin required");
    return;
  }
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }
  try {
    const next = await updatePlatformPricingSettings({
      ratesEnabled: body.ratesEnabled,
      modePegged1to1Enabled: body.modePegged1to1Enabled,
      modeMarketEnabled: body.modeMarketEnabled,
      depegThresholdBps: body.depegThresholdBps,
      allowedQuoteLockSeconds: body.allowedQuoteLockSeconds,
      minRateSources: body.minRateSources,
      rateVenues: body.rateVenues,
      chainlinkReferenceEnabled: body.chainlinkReferenceEnabled,
      referenceDeviationBps: body.referenceDeviationBps,
    });
    await insertAuditEvent({
      actorUserId: caller.userId,
      orgId: caller.memberships.find((m) => m.orgType === "platform")?.orgId,
      action: "platform_pricing_settings_put",
      metadata: next,
    });
    sendJson(res, 200, next);
  } catch (err) {
    const code = err?.code === "invalid_request" ? "invalid_request" : "internal_error";
    sendError(
      res,
      code === "invalid_request" ? 400 : 500,
      code,
      err instanceof Error ? err.message : "Failed to update pricing settings",
    );
  }
}

/**
 * GET /v1/orgs/:orgId/pricing
 */
export async function handleGetMerchantPricingSettings(req, res, orgId) {
  const caller = await requireCaller(req, res);
  if (!caller) return;
  const scope = resolveOrderOrgId(caller.memberships, orgId);
  if (!scope.ok) {
    sendError(res, scope.status, scope.code, scope.message);
    return;
  }
  sendJson(res, 200, await getMerchantPricingSettings(scope.orgId));
}

/**
 * PUT /v1/orgs/:orgId/pricing
 */
export async function handlePutMerchantPricingSettings(req, res, orgId) {
  const caller = await requireCaller(req, res);
  if (!caller) return;
  const scope = resolveOrderOrgId(caller.memberships, orgId);
  if (!scope.ok) {
    sendError(res, scope.status, scope.code, scope.message);
    return;
  }
  const canWrite = caller.memberships.some(
    (m) =>
      m.orgId === scope.orgId &&
      (m.role === "owner" || m.role === "administrator"),
  );
  if (!canWrite) {
    sendError(res, 403, "forbidden", "Owner/Admin required");
    return;
  }
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }
  try {
    const next = await updateMerchantPricingSettings(scope.orgId, {
      pricingMode: body.pricingMode,
      quoteLockSeconds: body.quoteLockSeconds,
    });
    await insertAuditEvent({
      actorUserId: caller.userId,
      orgId: scope.orgId,
      action: "merchant_pricing_settings_put",
      metadata: next,
    });
    sendJson(res, 200, next);
  } catch (err) {
    const code = err?.code ?? "internal_error";
    const status =
      code === "invalid_request"
        ? 400
        : code === "pricing_mode_unavailable"
          ? 422
          : 500;
    sendError(
      res,
      status,
      typeof code === "string" ? code : "internal_error",
      err instanceof Error ? err.message : "Failed to update pricing settings",
    );
  }
}
