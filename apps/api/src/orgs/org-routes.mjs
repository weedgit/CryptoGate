import { readJsonBody, sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { DEFAULT_MAX_AGENT_DEPTH, toOrgAccount } from "./org-accounts.mjs";
import { validateCreateOrg } from "./org-rules.mjs";
import { insertMembership } from "./membership-store.mjs";
import { isVisibleOrg, listVisibleOrgs, roleOnOrg } from "./org-access.mjs";
import {
  canBootstrapPlatform,
  canCreateOrgUnderParent,
} from "./role-policy.mjs";
import {
  agentDepthOfParent,
  findOrgById,
  findPlatformOrg,
  insertOrgAccount,
} from "./org-store.mjs";
import { AUDIT_ACTIONS } from "../audit/audit-rules.mjs";
import { insertAuditEvent } from "../audit/audit-store.mjs";

/**
 * GET /v1/orgs
 */
export async function handleListOrgs(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return;
  const rows = await listVisibleOrgs(caller.platformOperator, caller.memberships);
  sendJson(res, 200, { items: rows.map(toOrgAccount) });
}

/**
 * GET /v1/orgs/{orgId}
 */
export async function handleGetOrg(req, res, orgId) {
  const caller = await requireCaller(req, res);
  if (!caller) return;
  const visible = await listVisibleOrgs(caller.platformOperator, caller.memberships);
  const row = await findOrgById(orgId);
  if (!row || !isVisibleOrg(visible, orgId)) {
    sendError(res, 404, "not_found", "Org not found");
    return;
  }
  sendJson(res, 200, toOrgAccount(row));
}

/**
 * POST /v1/orgs
 */
export async function handleCreateOrg(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const parentId =
    body?.parentId === null || body?.parentId === undefined || body?.parentId === ""
      ? null
      : String(body.parentId);
  const parent = parentId ? await findOrgById(parentId) : null;
  if (parentId && !parent) {
    sendError(res, 400, "invalid_parent", "Parent org not found");
    return;
  }

  const creatingPlatform = body?.type === "platform";
  if (creatingPlatform) {
    const platform = await findPlatformOrg();
    if (platform) {
      sendError(res, 403, "platform_exists", "Platform org already exists");
      return;
    }
    if (!canBootstrapPlatform(caller)) {
      sendError(res, 403, "forbidden", "Not allowed to create the platform org");
      return;
    }
  } else if (parent) {
    const visible = await listVisibleOrgs(caller.platformOperator, caller.memberships);
    if (!caller.platformOperator && !isVisibleOrg(visible, parent.id)) {
      sendError(res, 404, "not_found", "Parent org not found");
      return;
    }
    const parentRole = roleOnOrg(caller.memberships, parent.id);
    if (!canCreateOrgUnderParent(caller, parentRole)) {
      sendError(res, 403, "forbidden", "Not allowed to create orgs under this parent");
      return;
    }
  } else {
    sendError(res, 400, "invalid_parent", "Parent org is required");
    return;
  }

  const platform = await findPlatformOrg();
  const maxAgentDepth = platform?.max_agent_depth ?? DEFAULT_MAX_AGENT_DEPTH;
  const depth = await agentDepthOfParent(parent);

  const result = validateCreateOrg(body ?? {}, {
    parent,
    maxAgentDepth,
    agentDepthOfParent: depth,
  });
  if (!result.ok) {
    sendError(res, result.status, result.code, result.message);
    return;
  }

  const inserted = await insertOrgAccount(result.insert);
  if (!inserted.ok) {
    sendError(res, 403, "platform_exists", "Platform org already exists");
    return;
  }

  if (inserted.row.type === "platform") {
    await insertMembership({
      orgId: inserted.row.id,
      userId: caller.userId,
      role: "owner",
    });
  }

  await insertAuditEvent({
    actorUserId: caller.userId,
    orgId: inserted.row.id,
    action: AUDIT_ACTIONS.orgCreate,
    metadata: { type: inserted.row.type, parentId: inserted.row.parent_id },
  });

  sendJson(res, 201, toOrgAccount(inserted.row));
}
