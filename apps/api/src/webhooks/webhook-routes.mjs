import { randomUUID } from "node:crypto";
import { WebhookEventType } from "@cryptogate/domain";
import { readJsonBody, sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { findOrgById } from "../orgs/org-store.mjs";
import { isVisibleOrg, listVisibleOrgs } from "../orgs/org-access.mjs";
import {
  canManageWebhooks,
  canViewWebhooks,
  isMerchantOrgType,
  resolveWebhookOrgId,
} from "../orgs/role-policy.mjs";
import { AUDIT_ACTIONS } from "../audit/audit-rules.mjs";
import { insertAuditEvent } from "../audit/audit-store.mjs";
import {
  generateWebhookSigningSecret,
  toWebhookCreated,
  toWebhookDelivery,
  toWebhookEndpoint,
  validateRegisterWebhookBody,
} from "./webhook-rules.mjs";
import {
  disableWebhookEndpoint,
  enqueueWebhookDelivery,
  findWebhookById,
  insertWebhookEndpoint,
  listWebhookDeliveries,
  listWebhookEndpoints,
} from "./webhook-store.mjs";

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {"view" | "manage"} mode
 * @param {string | null} requestedOrgId
 */
async function loadWebhookMerchant(req, res, mode, requestedOrgId) {
  const caller = await requireCaller(req, res);
  if (!caller) return null;

  let orgId;
  if (caller.platformOperator) {
    if (!requestedOrgId) {
      sendError(
        res,
        400,
        "org_required",
        "orgId is required for platform operators",
      );
      return null;
    }
    orgId = requestedOrgId;
  } else {
    const scope = resolveWebhookOrgId(caller.memberships, requestedOrgId, mode);
    if (!scope.ok) {
      sendError(res, scope.status, scope.code, scope.message);
      return null;
    }
    orgId = scope.orgId;
  }

  const org = await findOrgById(orgId);
  const visible = await listVisibleOrgs(
    caller.platformOperator,
    caller.memberships,
  );
  if (!org || !isVisibleOrg(visible, orgId) || !isMerchantOrgType(org.type)) {
    sendError(res, 404, "not_found", "Org not found");
    return null;
  }

  if (mode === "manage" && !canManageWebhooks(caller, org)) {
    sendError(res, 403, "forbidden", "Not allowed to manage webhooks");
    return null;
  }
  if (mode === "view" && !canViewWebhooks(caller, org)) {
    sendError(res, 403, "forbidden", "Not allowed to view webhooks");
    return null;
  }

  return { caller, org };
}

/**
 * @param {URL} url
 */
function queryOrgId(url) {
  const raw = url.searchParams.get("orgId");
  return raw && raw.trim() ? raw.trim() : null;
}

/**
 * GET /v1/webhooks
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {URL} url
 */
export async function handleListWebhooks(req, res, url) {
  const loaded = await loadWebhookMerchant(req, res, "view", queryOrgId(url));
  if (!loaded) return;
  const rows = await listWebhookEndpoints(loaded.org.id);
  sendJson(res, 200, { items: rows.map(toWebhookEndpoint) });
}

/**
 * POST /v1/webhooks
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
export async function handleRegisterWebhook(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const validated = validateRegisterWebhookBody(body);
  if (!validated.ok) {
    sendError(res, validated.status, validated.code, validated.message);
    return;
  }

  const loaded = await loadWebhookMerchant(
    req,
    res,
    "manage",
    validated.orgId,
  );
  if (!loaded) return;

  const signingSecret = generateWebhookSigningSecret();
  const inserted = await insertWebhookEndpoint({
    orgId: loaded.org.id,
    url: validated.url,
    events: validated.events,
    signingSecret,
  });
  if (!inserted.ok) {
    if (inserted.code === "limit") {
      sendError(res, 400, "webhook_limit", "Maximum 5 webhook endpoints per merchant");
      return;
    }
    sendError(res, 409, "duplicate_url", "URL already registered for this org");
    return;
  }

  await insertAuditEvent({
    actorUserId: loaded.caller.userId,
    orgId: loaded.org.id,
    action: AUDIT_ACTIONS.webhookRegister,
    metadata: { webhookId: inserted.row.id, url: validated.url },
  });

  sendJson(res, 201, toWebhookCreated(inserted.row, signingSecret));
}

/**
 * DELETE /v1/webhooks/{webhookId}
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} webhookId
 * @param {URL} url
 */
export async function handleDeleteWebhook(req, res, webhookId, url) {
  const loaded = await loadWebhookMerchant(req, res, "manage", queryOrgId(url));
  if (!loaded) return;

  const row = await findWebhookById(webhookId);
  if (!row || !row.enabled || row.org_id !== loaded.org.id) {
    sendError(res, 404, "not_found", "Webhook not found");
    return;
  }

  await disableWebhookEndpoint(webhookId, loaded.org.id);
  await insertAuditEvent({
    actorUserId: loaded.caller.userId,
    orgId: loaded.org.id,
    action: AUDIT_ACTIONS.webhookDelete,
    metadata: { webhookId },
  });
  res.statusCode = 204;
  res.end();
}

/**
 * POST /v1/webhooks/test — enqueue webhook.test (delivery worker is M3-14).
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {URL} url
 */
export async function handleTestWebhook(req, res, url) {
  let body = {};
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const webhookId =
    typeof body?.webhookId === "string" && body.webhookId.trim()
      ? body.webhookId.trim()
      : null;
  const orgHint =
    typeof body?.orgId === "string" && body.orgId.trim()
      ? body.orgId.trim()
      : queryOrgId(url);

  const loaded = await loadWebhookMerchant(req, res, "manage", orgHint);
  if (!loaded) return;

  /** @type {object[]} */
  let targets;
  if (webhookId) {
    const row = await findWebhookById(webhookId);
    if (!row || !row.enabled || row.org_id !== loaded.org.id) {
      sendError(res, 404, "not_found", "Webhook not found");
      return;
    }
    targets = [row];
  } else {
    targets = await listWebhookEndpoints(loaded.org.id);
  }

  const eventId = randomUUID();
  const createdAt = new Date().toISOString();
  const payload = {
    id: eventId,
    type: WebhookEventType.WebhookTest,
    createdAt,
    data: { orgId: loaded.org.id },
  };

  let queued = 0;
  for (const target of targets) {
    await enqueueWebhookDelivery({
      webhookId: target.id,
      eventId,
      eventType: WebhookEventType.WebhookTest,
      payload,
    });
    queued += 1;
  }

  sendJson(res, 202, { queued });
}

/**
 * GET /v1/webhooks/{webhookId}/deliveries
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} webhookId
 * @param {URL} url
 */
export async function handleListWebhookDeliveries(req, res, webhookId, url) {
  const loaded = await loadWebhookMerchant(req, res, "view", queryOrgId(url));
  if (!loaded) return;

  const row = await findWebhookById(webhookId);
  if (!row || row.org_id !== loaded.org.id) {
    sendError(res, 404, "not_found", "Webhook not found");
    return;
  }
  const rows = await listWebhookDeliveries(webhookId);
  sendJson(res, 200, { items: rows.map(toWebhookDelivery) });
}
