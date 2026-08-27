import { readJsonBody, sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { AUDIT_ACTIONS } from "../audit/audit-rules.mjs";
import { insertAuditEvent } from "../audit/audit-store.mjs";
import { isVisibleOrg, listVisibleOrgs } from "../orgs/org-access.mjs";
import { findOrgById } from "../orgs/org-store.mjs";
import {
  canReadAgentPayout,
  canUpdateAgentPayout,
} from "../orgs/role-policy.mjs";
import {
  agentPayoutAllowedOnOrgType,
  toAgentPayoutAddress,
  validateAgentPayoutBody,
} from "./agent-payout-rules.mjs";
import {
  findAgentPayoutAddress,
  upsertAgentPayoutAddress,
} from "./agent-payout-store.mjs";

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} orgId
 */
async function loadVisibleAgentOrg(req, res, orgId) {
  const caller = await requireCaller(req, res);
  if (!caller) return null;

  const org = await findOrgById(orgId);
  const visible = await listVisibleOrgs(caller.platformOperator, caller.memberships);
  if (!org || !isVisibleOrg(visible, orgId)) {
    sendError(res, 404, "not_found", "Org not found");
    return null;
  }
  if (!agentPayoutAllowedOnOrgType(org.type)) {
    sendError(
      res,
      400,
      "invalid_org_type",
      "Payout address is only valid on agent orgs",
    );
    return null;
  }
  return { caller, org };
}

/**
 * GET /v1/orgs/{orgId}/agent-payout
 */
export async function handleGetAgentPayout(req, res, orgId) {
  const loaded = await loadVisibleAgentOrg(req, res, orgId);
  if (!loaded) return;

  if (!canReadAgentPayout(loaded.caller, loaded.org)) {
    sendError(res, 403, "forbidden", "Not allowed to view agent payout address");
    return;
  }

  const row = await findAgentPayoutAddress(orgId);
  if (!row) {
    sendError(res, 404, "not_found", "Payout address not configured");
    return;
  }
  sendJson(res, 200, toAgentPayoutAddress(row));
}

/**
 * PUT /v1/orgs/{orgId}/agent-payout
 */
export async function handlePutAgentPayout(req, res, orgId) {
  const loaded = await loadVisibleAgentOrg(req, res, orgId);
  if (!loaded) return;

  if (!canUpdateAgentPayout(loaded.caller, loaded.org)) {
    sendError(res, 403, "forbidden", "Not allowed to change agent payout address");
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const validated = validateAgentPayoutBody(body);
  if (!validated.ok) {
    sendError(res, validated.status, validated.code, validated.message);
    return;
  }

  const row = await upsertAgentPayoutAddress({
    orgId,
    asset: validated.parsed.asset,
    network: validated.parsed.network,
    address: validated.parsed.address,
  });

  await insertAuditEvent({
    actorUserId: loaded.caller.userId,
    orgId,
    action: AUDIT_ACTIONS.agentPayoutPut,
    metadata: {
      asset: validated.parsed.asset,
      network: validated.parsed.network,
      address: validated.parsed.address,
    },
  });

  sendJson(res, 200, toAgentPayoutAddress(row));
}
