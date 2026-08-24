import { readJsonBody, sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { findOrgById } from "../orgs/org-store.mjs";
import { isVisibleOrg, listVisibleOrgs } from "../orgs/org-access.mjs";
import {
  canManageApiKeys,
  canViewApiKeys,
  isMerchantOrgType,
  resolveApiKeyOrgId,
} from "../orgs/role-policy.mjs";
import { AUDIT_ACTIONS } from "../audit/audit-rules.mjs";
import { insertAuditEvent } from "../audit/audit-store.mjs";
import {
  API_KEY_MAX_PER_ORG,
  generateApiKeyId,
  generateApiKeySecret,
  toApiKey,
  toApiKeyCreated,
  validateCreateApiKeyBody,
  validateRotateApiKeyBody,
} from "./api-key-rules.mjs";
import {
  insertApiKey,
  listActiveApiKeys,
  revokeApiKey,
  rotateApiKey,
} from "../signing/api-key-store.mjs";

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {"view" | "manage"} mode
 * @param {string | null} requestedOrgId
 */
async function loadApiKeyMerchant(req, res, mode, requestedOrgId) {
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
    const scope = resolveApiKeyOrgId(caller.memberships, requestedOrgId, mode);
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

  if (mode === "manage" && !canManageApiKeys(caller, org)) {
    sendError(res, 403, "forbidden", "Not allowed to manage API keys");
    return null;
  }
  if (mode === "view" && !canViewApiKeys(caller, org)) {
    sendError(res, 403, "forbidden", "Not allowed to view API keys");
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
 * GET /v1/api-keys
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {URL} url
 */
export async function handleListApiKeys(req, res, url) {
  const loaded = await loadApiKeyMerchant(req, res, "view", queryOrgId(url));
  if (!loaded) return;
  const rows = await listActiveApiKeys(loaded.org.id);
  sendJson(res, 200, { items: rows.map(toApiKey) });
}

/**
 * POST /v1/api-keys
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
export async function handleCreateApiKey(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const validated = validateCreateApiKeyBody(body);
  if (!validated.ok) {
    sendError(res, validated.status, validated.code, validated.message);
    return;
  }

  const loaded = await loadApiKeyMerchant(
    req,
    res,
    "manage",
    validated.orgId,
  );
  if (!loaded) return;

  const secret = generateApiKeySecret();
  const keyId = generateApiKeyId();
  const inserted = await insertApiKey({
    orgId: loaded.org.id,
    userId: loaded.caller.userId,
    keyId,
    secret,
    label: validated.label,
    expiresAt: validated.expiresAt,
  });
  if (!inserted.ok) {
    sendError(
      res,
      409,
      "api_key_limit",
      `Maximum ${API_KEY_MAX_PER_ORG} active API keys per merchant`,
    );
    return;
  }

  await insertAuditEvent({
    actorUserId: loaded.caller.userId,
    orgId: loaded.org.id,
    action: AUDIT_ACTIONS.apiKeyCreate,
    metadata: { apiKeyId: inserted.row.id, keyId },
  });

  sendJson(res, 201, toApiKeyCreated(inserted.row, secret));
}

/**
 * DELETE /v1/api-keys/{apiKeyId}
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} apiKeyId
 * @param {URL} url
 */
export async function handleRevokeApiKey(req, res, apiKeyId, url) {
  const loaded = await loadApiKeyMerchant(req, res, "manage", queryOrgId(url));
  if (!loaded) return;

  const result = await revokeApiKey(apiKeyId, loaded.org.id);
  if (result === "missing") {
    sendError(res, 404, "not_found", "API key not found");
    return;
  }

  if (result === "revoked") {
    await insertAuditEvent({
      actorUserId: loaded.caller.userId,
      orgId: loaded.org.id,
      action: AUDIT_ACTIONS.apiKeyRevoke,
      metadata: { apiKeyId },
    });
  }

  res.statusCode = 204;
  res.end();
}

/**
 * POST /v1/api-keys/{apiKeyId}/rotate
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} apiKeyId
 * @param {URL} url
 */
export async function handleRotateApiKey(req, res, apiKeyId, url) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const validated = validateRotateApiKeyBody(body);
  if (!validated.ok) {
    sendError(res, validated.status, validated.code, validated.message);
    return;
  }

  const loaded = await loadApiKeyMerchant(
    req,
    res,
    "manage",
    validated.orgId ?? queryOrgId(url),
  );
  if (!loaded) return;

  const secret = generateApiKeySecret();
  const keyId = generateApiKeyId();
  const rotated = await rotateApiKey({
    apiKeyId,
    orgId: loaded.org.id,
    userId: loaded.caller.userId,
    keyId,
    secret,
    expiresAt: validated.expiresAt,
  });
  if (!rotated.ok) {
    sendError(res, 404, "not_found", "API key not found");
    return;
  }

  await insertAuditEvent({
    actorUserId: loaded.caller.userId,
    orgId: loaded.org.id,
    action: AUDIT_ACTIONS.apiKeyRotate,
    metadata: { apiKeyId, newApiKeyId: rotated.row.id, keyId },
  });

  sendJson(res, 201, toApiKeyCreated(rotated.row, secret));
}
