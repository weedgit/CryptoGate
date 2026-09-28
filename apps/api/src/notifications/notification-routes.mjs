import { readJsonBody, sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { findOrgById } from "../orgs/org-store.mjs";
import { isVisibleOrg, listVisibleOrgs } from "../orgs/org-access.mjs";
import {
  canManageMerchantOrgOps,
  canViewSettlementSettings,
  isAgentOrgType,
  isMerchantOrgType,
} from "../orgs/role-policy.mjs";
import { AUDIT_ACTIONS } from "../audit/audit-rules.mjs";
import { insertAuditEvent } from "../audit/audit-store.mjs";
import {
  notificationEventTypesForOrgType,
  validateNotificationPrefsBody,
} from "./notification-rules.mjs";
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
  if (org?.type === "platform") {
    // Platform staff preferences are personal: any member manages their own.
    const membership = caller.memberships.find((m) => m.orgId === org.id);
    if (!membership) {
      sendError(res, 404, "not_found", "Org not found");
      return null;
    }
    return { caller, org, role: membership.role ?? null };
  }
  const visible = await listVisibleOrgs(
    caller.platformOperator,
    caller.memberships,
  );
  const agentOrg = org ? isAgentOrgType(org.type) : false;
  if (
    !org ||
    !isVisibleOrg(visible, orgId) ||
    !(isMerchantOrgType(org.type) || agentOrg)
  ) {
    sendError(res, 404, "not_found", "Org not found");
    return null;
  }

  if (agentOrg) {
    // Agent preferences are personal: any member manages their own.
    const member = caller.memberships.some((m) => m.orgId === org.id);
    if (!member) {
      sendError(res, 403, "forbidden", "Only members of this org have notification preferences");
      return null;
    }
    return { caller, org };
  }

  // Merchant preferences are personal too: every member (Cashier included)
  // manages their own; O/A of a parent org may still open a child's page.
  const membership = caller.memberships.find((m) => m.orgId === org.id);
  if (!membership) {
    if (mode === "manage" && !canManageMerchantOrgOps(caller, org)) {
      sendError(res, 403, "forbidden", "Not allowed to change notification preferences");
      return null;
    }
    if (mode === "view" && !canViewSettlementSettings(caller, org)) {
      sendError(res, 403, "forbidden", "Not allowed to view notification preferences");
      return null;
    }
  }

  return { caller, org, role: membership?.role ?? null };
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
    notificationEventTypesForOrgType(loaded.org.type, loaded.role),
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

  const eventTypes = notificationEventTypesForOrgType(loaded.org.type, loaded.role);
  const validated = validateNotificationPrefsBody(body, eventTypes);
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
    eventTypes,
  );

  await insertAuditEvent({
    actorUserId: loaded.caller.userId,
    orgId: loaded.org.id,
    action: AUDIT_ACTIONS.notificationPrefsPut,
    metadata: { count: items.length },
  });

  sendJson(res, 200, withEmailChannelState(items));
}
