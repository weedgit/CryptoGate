import { readJsonBody, sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { findOrgById } from "../orgs/org-store.mjs";
import { isVisibleOrg, listVisibleOrgs } from "../orgs/org-access.mjs";
import {
  canChangeSettlementSettings,
  canViewSettlementSettings,
  isMerchantOrgType,
} from "../orgs/role-policy.mjs";
import { AUDIT_ACTIONS } from "../audit/audit-rules.mjs";
import { insertAuditEvent } from "../audit/audit-store.mjs";
import { validateNotificationPrefsBody } from "./notification-rules.mjs";
import {
  listNotificationPreferences,
  upsertNotificationPreferences,
} from "./notification-store.mjs";
import { isOutboundMailConfigured } from "../mail/mail-config.mjs";

function withEmailChannelState(items) {
  const emailAvailable = isOutboundMailConfigured();
  if (emailAvailable) {
    return { items, emailAvailable };
  }
  return {
    emailAvailable,
    items: items.map((row) => ({ ...row, email: false })),
  };
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} orgId
 * @param {"view" | "manage"} mode
 */
async function loadPrefsOrg(req, res, orgId, mode) {
  const caller = await requireCaller(req, res);
  if (!caller) return null;

  const org = await findOrgById(orgId);
  const visible = await listVisibleOrgs(
    caller.platformOperator,
    caller.memberships,
  );
  if (!org || !isVisibleOrg(visible, orgId) || !isMerchantOrgType(org.type)) {
    sendError(res, 404, "not_found", "Org not found");
    return null;
  }

  if (mode === "manage" && !canChangeSettlementSettings(caller, org)) {
    // Same O/A bar as other merchant settings (Cashier / Viewer 403 on write).
    sendError(res, 403, "forbidden", "Not allowed to change notification preferences");
    return null;
  }
  if (mode === "view" && !canViewSettlementSettings(caller, org)) {
    sendError(res, 403, "forbidden", "Not allowed to view notification preferences");
    return null;
  }

  return { caller, org };
}

/**
 * GET /v1/orgs/{orgId}/notification-preferences
 */
export async function handleGetNotificationPreferences(req, res, orgId) {
  const loaded = await loadPrefsOrg(req, res, orgId, "view");
  if (!loaded) return;
  const items = await listNotificationPreferences(
    loaded.caller.userId,
    loaded.org.id,
  );
  sendJson(res, 200, withEmailChannelState(items));
}

/**
 * PUT /v1/orgs/{orgId}/notification-preferences
 */
export async function handlePutNotificationPreferences(req, res, orgId) {
  const loaded = await loadPrefsOrg(req, res, orgId, "manage");
  if (!loaded) return;

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const validated = validateNotificationPrefsBody(body);
  if (!validated.ok) {
    sendError(res, validated.status, validated.code, validated.message);
    return;
  }

  const emailAvailable = isOutboundMailConfigured();
  const itemsInput = emailAvailable
    ? validated.items
    : validated.items.map((row) => ({ ...row, email: false }));

  const items = await upsertNotificationPreferences(
    loaded.caller.userId,
    loaded.org.id,
    itemsInput,
  );

  await insertAuditEvent({
    actorUserId: loaded.caller.userId,
    orgId: loaded.org.id,
    action: AUDIT_ACTIONS.notificationPrefsPut,
    metadata: { count: items.length },
  });

  sendJson(res, 200, withEmailChannelState(items));
}
