import { readJsonBody, sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { AUDIT_ACTIONS } from "../audit/audit-rules.mjs";
import { insertAuditEvent } from "../audit/audit-store.mjs";
import {
  canReadFeeTierBands,
  canReadPlatformOrgPolicy,
  canUpdatePlatformOwnerSettings,
} from "../orgs/role-policy.mjs";
import { validateUpdateFeeTierSettingsBody } from "./fee-tier-rules.mjs";
import {
  getFeeTierSettings,
  replaceFeeTierSettings,
  toFeeTierBand,
} from "./fee-tier-store.mjs";
import { DEFAULT_MAX_AGENT_DEPTH } from "../orgs/org-accounts.mjs";
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
import { validateUpdateBillingCalendarBody } from "./billing-calendar-rules.mjs";
import {
  getBillingCalendarSettings,
  updateBillingCalendarSettings,
} from "./billing-calendar-store.mjs";

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
  const settings = await replaceFeeTierSettings(
    validated.tiers,
    validated.effectiveTiming,
  );
  await insertAuditEvent({
    actorUserId: caller.userId,
    orgId: null,
    action: AUDIT_ACTIONS.feeTierPut,
    metadata: {
      tierCount: validated.tiers.length,
      effectiveTiming: validated.effectiveTiming,
    },
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
  // Phase 1: agents under Platform only (DEFAULT_MAX_AGENT_DEPTH = 1).
  if (
    !Number.isInteger(maxAgentDepth) ||
    maxAgentDepth < 0 ||
    maxAgentDepth > DEFAULT_MAX_AGENT_DEPTH
  ) {
    sendError(
      res,
      400,
      "invalid_request",
      `maxAgentDepth must be an integer 0–${DEFAULT_MAX_AGENT_DEPTH}`,
    );
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
    payTo: validated.payTo,
    ...(validated.sellerEmail !== undefined
      ? { sellerEmail: validated.sellerEmail }
      : {}),
  });
  await insertAuditEvent({
    actorUserId: caller.userId,
    orgId: null,
    action: AUDIT_ACTIONS.billingWalletPut,
    metadata: {
      sellerName: settings.sellerName,
      hasPayTo: Boolean(settings.payTo),
      hasSellerEmail: Boolean(settings.sellerEmail),
    },
  });
  sendJson(res, 200, settings);
}

/**
 * GET /v1/platform/settings/billing-calendar
 */
export async function handleGetBillingCalendarSettings(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return;
  if (!canReadPlatformOrgPolicy(caller)) {
    sendError(res, 403, "forbidden", "Not allowed to read billing calendar settings");
    return;
  }
  const settings = await getBillingCalendarSettings();
  sendJson(res, 200, settings);
}

/**
 * PUT /v1/platform/settings/billing-calendar
 */
export async function handlePutBillingCalendarSettings(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return;
  if (!canUpdatePlatformOwnerSettings(caller)) {
    sendError(res, 403, "forbidden", "Only platform Owner may update billing calendar");
    return;
  }
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }
  const validated = validateUpdateBillingCalendarBody(body);
  if (!validated.ok) {
    sendError(res, validated.status, validated.code, validated.message);
    return;
  }
  const settings = await updateBillingCalendarSettings(validated);
  await insertAuditEvent({
    actorUserId: caller.userId,
    orgId: null,
    action: AUDIT_ACTIONS.billingCalendarPut,
    metadata: {
      merchantPayDayStart: settings.merchantPayDayStart,
      merchantPayDayEnd: settings.merchantPayDayEnd,
      agentPayDayStart: settings.agentPayDayStart,
      agentPayDayEnd: settings.agentPayDayEnd,
      activationFeeUsd: settings.activationFeeUsd,
      activationPayDays: settings.activationPayDays,
      autoSendInvoices: settings.autoSendInvoices,
    },
  });
  sendJson(res, 200, settings);
}

export { toFeeTierBand };
