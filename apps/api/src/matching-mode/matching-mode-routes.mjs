import { validateMatchingSettings } from "@cryptogate/matching";
import { readJsonBody, sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { findOrgById } from "../orgs/org-store.mjs";
import { isVisibleOrg, listVisibleOrgs } from "../orgs/org-access.mjs";
import {
  canChangeMatchingModeSettings,
  canViewMatchingModeSettings,
} from "../orgs/role-policy.mjs";
import {
  matchingModeAllowedOnOrgType,
  toMatchingModeSettings,
  validateMatchingModeBody,
} from "./matching-mode-rules.mjs";
import {
  findMatchingModeSettings,
  upsertMatchingModeSettings,
} from "./matching-mode-store.mjs";

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} orgId
 */
async function loadVisibleMerchantOrg(req, res, orgId) {
  const caller = await requireCaller(req, res);
  if (!caller) return null;

  const org = await findOrgById(orgId);
  const visible = await listVisibleOrgs(caller.platformOperator, caller.memberships);
  if (!org || !isVisibleOrg(visible, orgId)) {
    sendError(res, 404, "not_found", "Org not found");
    return null;
  }
  if (!matchingModeAllowedOnOrgType(org.type)) {
    sendError(
      res,
      400,
      "invalid_org_type",
      "Matching mode is only valid on merchant orgs",
    );
    return null;
  }
  return { caller, org };
}

/**
 * GET /v1/orgs/{orgId}/matching-mode
 */
export async function handleGetMatchingMode(req, res, orgId) {
  const loaded = await loadVisibleMerchantOrg(req, res, orgId);
  if (!loaded) return;

  if (!canViewMatchingModeSettings(loaded.caller, loaded.org)) {
    sendError(res, 403, "forbidden", "Not allowed to view matching mode");
    return;
  }

  const row = await findMatchingModeSettings(orgId);
  sendJson(res, 200, toMatchingModeSettings(row, orgId));
}

/**
 * PUT /v1/orgs/{orgId}/matching-mode
 */
export async function handlePutMatchingMode(req, res, orgId) {
  const loaded = await loadVisibleMerchantOrg(req, res, orgId);
  if (!loaded) return;

  if (!canChangeMatchingModeSettings(loaded.caller, loaded.org)) {
    sendError(res, 403, "forbidden", "Not allowed to change matching mode");
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const validated = validateMatchingModeBody(body);
  if (!validated.ok) {
    sendError(res, validated.status, validated.code, validated.message);
    return;
  }

  const policy = validateMatchingSettings({
    mode: validated.parsed.matchingMode,
  });
  if (!policy.ok) {
    sendError(res, 400, policy.code, policy.message);
    return;
  }

  const row = await upsertMatchingModeSettings({
    orgId,
    matchingMode: validated.parsed.matchingMode,
  });
  sendJson(res, 200, toMatchingModeSettings(row, orgId));
}
