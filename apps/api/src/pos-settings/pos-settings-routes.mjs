import { readJsonBody, sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { findOrgById } from "../orgs/org-store.mjs";
import { isVisibleOrg, listVisibleOrgs } from "../orgs/org-access.mjs";
import { canChangeFulfillmentPolicySettings } from "../orgs/role-policy.mjs";
import { AUDIT_ACTIONS } from "../audit/audit-rules.mjs";
import { insertAuditEvent } from "../audit/audit-store.mjs";
import {
  denySiteWriteWithoutOverride,
  settingsLookupOrgId,
} from "../sites/site-inherit.mjs";
import {
  DEFAULT_CASHIER_WEB_ORDERS,
  findPosSettings,
  upsertPosSettings,
} from "./pos-settings-store.mjs";

const MERCHANT_TYPES = new Set(["merchant", "merchant_site"]);

/**
 * @param {{ org_id: string, cashier_web_orders: boolean } | null} row
 * @param {string} orgId
 * @param {{ source?: string, parentOrgId?: string | null, orgId?: string }} lookup
 */
export function toPosSettings(row, orgId, lookup = {}) {
  return {
    orgId,
    cashierWebOrders: row ? row.cashier_web_orders === true : DEFAULT_CASHIER_WEB_ORDERS,
    source: lookup.source ?? "merchant",
    parentOrgId: lookup.parentOrgId ?? null,
    effectiveOrgId: lookup.orgId ?? orgId,
  };
}

/**
 * @param {unknown} body
 */
export function validatePosSettingsBody(body) {
  if (typeof body?.cashierWebOrders !== "boolean") {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "cashierWebOrders (boolean) is required",
    };
  }
  return { ok: true, parsed: { cashierWebOrders: body.cashierWebOrders } };
}

async function loadVisibleMerchantOrg(req, res, orgId) {
  const caller = await requireCaller(req, res);
  if (!caller) return null;
  const org = await findOrgById(orgId);
  const visible = await listVisibleOrgs(caller.platformOperator, caller.memberships);
  if (!org || !isVisibleOrg(visible, orgId)) {
    sendError(res, 404, "not_found", "Org not found");
    return null;
  }
  if (!MERCHANT_TYPES.has(org.type)) {
    sendError(res, 400, "invalid_org_type", "POS settings are only valid on merchant orgs");
    return null;
  }
  return { caller, org };
}

/**
 * GET /v1/orgs/{orgId}/pos-settings — any member who can see the org (cashiers
 * need it to know whether the web pay pad is allowed).
 */
export async function handleGetPosSettings(req, res, orgId) {
  const loaded = await loadVisibleMerchantOrg(req, res, orgId);
  if (!loaded) return;
  const lookup = await settingsLookupOrgId(loaded.org, "pos_settings");
  const row = await findPosSettings(lookup.orgId);
  sendJson(res, 200, toPosSettings(row, orgId, lookup));
}

/**
 * PUT /v1/orgs/{orgId}/pos-settings — merchant Owner/Administrator; sites inherit.
 */
export async function handlePutPosSettings(req, res, orgId) {
  const loaded = await loadVisibleMerchantOrg(req, res, orgId);
  if (!loaded) return;
  if (!canChangeFulfillmentPolicySettings(loaded.caller, loaded.org)) {
    sendError(res, 403, "forbidden", "Not allowed to change POS settings");
    return;
  }
  if (await denySiteWriteWithoutOverride(res, loaded.org, "pos_settings", loaded.caller)) {
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }
  const validated = validatePosSettingsBody(body);
  if (!validated.ok) {
    sendError(res, validated.status, validated.code, validated.message);
    return;
  }

  const row = await upsertPosSettings({
    orgId,
    cashierWebOrders: validated.parsed.cashierWebOrders,
  });
  await insertAuditEvent({
    actorUserId: loaded.caller.userId,
    orgId,
    action: AUDIT_ACTIONS.posSettingsPut,
    metadata: { cashierWebOrders: validated.parsed.cashierWebOrders },
  });
  const lookup = await settingsLookupOrgId(loaded.org, "pos_settings");
  sendJson(res, 200, toPosSettings(row, orgId, lookup));
}
