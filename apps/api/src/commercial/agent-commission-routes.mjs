import { readJsonBody, sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { AUDIT_ACTIONS } from "../audit/audit-rules.mjs";
import { insertAuditEvent } from "../audit/audit-store.mjs";
import { isVisibleOrg, listVisibleOrgs } from "../orgs/org-access.mjs";
import { findOrgById } from "../orgs/org-store.mjs";
import {
  canReadAgentCommission,
  canReadCommissionPayouts,
  canUpdateAgentCommission,
} from "../orgs/role-policy.mjs";
import {
  agentCommissionAllowedOnOrgType,
  toAgentCommissionSettings,
  validateUpdateAgentCommissionBody,
} from "./agent-commission-rules.mjs";
import {
  ensureAgentCommission,
  findAgentCommission,
  listAgentCommissionsByOrgIds,
  upsertAgentCommission,
} from "./agent-commission-store.mjs";

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
  if (!agentCommissionAllowedOnOrgType(org.type)) {
    sendError(
      res,
      400,
      "invalid_org_type",
      "Commission is only valid on agent orgs",
    );
    return null;
  }
  return { caller, org };
}

/**
 * GET /v1/agent-commissions — all visible agent/agent_sub commission rows.
 * Missing orgs are omitted; clients apply the default percent.
 */
export async function handleListAgentCommissions(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  if (!canReadCommissionPayouts(caller)) {
    sendError(res, 403, "forbidden", "Not allowed to list agent commissions");
    return;
  }

  const visible = await listVisibleOrgs(
    caller.platformOperator,
    caller.memberships,
  );
  const agentOrgIds = visible
    .filter((o) => agentCommissionAllowedOnOrgType(o.type))
    .map((o) => o.id);
  const rows = await listAgentCommissionsByOrgIds(agentOrgIds);
  sendJson(res, 200, { items: rows.map(toAgentCommissionSettings) });
}

/**
 * GET /v1/orgs/{orgId}/agent-commission
 */
export async function handleGetAgentCommission(req, res, orgId) {
  const loaded = await loadVisibleAgentOrg(req, res, orgId);
  if (!loaded) return;

  if (!canReadAgentCommission(loaded.caller, loaded.org)) {
    sendError(res, 403, "forbidden", "Not allowed to view agent commission");
    return;
  }

  const row = await ensureAgentCommission(orgId);
  sendJson(res, 200, toAgentCommissionSettings(row));
}

/**
 * PUT /v1/orgs/{orgId}/agent-commission — applies immediately.
 */
export async function handlePutAgentCommission(req, res, orgId) {
  const loaded = await loadVisibleAgentOrg(req, res, orgId);
  if (!loaded) return;

  if (!canUpdateAgentCommission(loaded.caller, loaded.org)) {
    sendError(res, 403, "forbidden", "Not allowed to change agent commission");
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Invalid JSON body");
    return;
  }

  const parsed = validateUpdateAgentCommissionBody(body);
  if (!parsed.ok) {
    sendError(res, parsed.status, parsed.code, parsed.message);
    return;
  }

  const previous = await findAgentCommission(orgId);
  const row = await upsertAgentCommission({
    orgId,
    commissionPercent: parsed.commissionPercent,
  });

  await insertAuditEvent({
    actorUserId: loaded.caller.userId,
    orgId,
    action: AUDIT_ACTIONS.agentCommissionPut,
    metadata: {
      previousPercent: previous?.commission_percent ?? null,
      commissionPercent: row.commission_percent,
      apply: "immediate",
    },
  });

  sendJson(res, 200, toAgentCommissionSettings(row));
}

/**
 * Called after agent org create.
 * @param {{ orgId: string, commissionPercent?: string }} input
 */
export async function bootstrapAgentCommission(input) {
  return ensureAgentCommission(input.orgId, input.commissionPercent);
}
