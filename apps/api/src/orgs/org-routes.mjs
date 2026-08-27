import { readJsonBody, sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { DEFAULT_MAX_AGENT_DEPTH, ORG_STATUSES, toOrgAccount } from "./org-accounts.mjs";
import { validateCreateOrg } from "./org-rules.mjs";
import { insertMembership } from "./membership-store.mjs";
import { isVisibleOrg, listVisibleOrgs, roleOnOrg } from "./org-access.mjs";
import {
  canBootstrapPlatform,
  canCreateOrgUnderParent,
} from "./role-policy.mjs";
import {
  agentDepthOfParent,
  countChildOrgs,
  deleteOrgAccount,
  findOrgById,
  findPlatformOrg,
  findSiblingByNormalizedName,
  insertOrgAccount,
  updateOrgStatus,
} from "./org-store.mjs";
import { AUDIT_ACTIONS } from "../audit/audit-rules.mjs";
import { insertAuditEvent } from "../audit/audit-store.mjs";
import {
  bootstrapMerchantCommercial,
  parseCommercialOnCreate,
} from "../commercial/merchant-commercial-routes.mjs";
import { validateCommercialOnCreate } from "../commercial/merchant-commercial-rules.mjs";
import { bootstrapAgentCommission } from "../commercial/agent-commission-routes.mjs";
import {
  DEFAULT_AGENT_COMMISSION_PERCENT,
  parseCommissionPercent,
} from "../commercial/agent-commission-rules.mjs";

const MANAGEABLE_ORG_TYPES = new Set(["agent", "agent_sub", "merchant"]);

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
 * PUT /v1/orgs/{orgId}/status — Platform Owner/Admin pause or resume agent/merchant orgs.
 */
export async function handleSetOrgStatus(req, res, orgId) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  if (!caller.platformOperator) {
    sendError(res, 403, "forbidden", "Platform Owner or Administrator required");
    return;
  }

  const row = await findOrgById(orgId);
  if (!row) {
    sendError(res, 404, "not_found", "Org not found");
    return;
  }
  if (!MANAGEABLE_ORG_TYPES.has(row.type)) {
    sendError(
      res,
      400,
      "invalid_request",
      "Only agent or merchant accounts can be paused or resumed here",
    );
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const status = typeof body?.status === "string" ? body.status : "";
  if (!ORG_STATUSES.includes(status)) {
    sendError(res, 400, "invalid_request", "status must be active or paused");
    return;
  }

  const reason =
    typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) : "";

  if (row.status === status) {
    sendJson(res, 200, toOrgAccount(row));
    return;
  }

  const updated = await updateOrgStatus(orgId, status);
  if (!updated) {
    sendError(res, 404, "not_found", "Org not found");
    return;
  }

  await insertAuditEvent({
    actorUserId: caller.userId,
    orgId,
    action: AUDIT_ACTIONS.orgStatus,
    metadata: {
      status,
      priorStatus: row.status ?? "active",
      type: row.type,
      ...(status === "paused" && reason ? { reason } : {}),
    },
  });

  sendJson(res, 200, toOrgAccount(updated));
}

/**
 * DELETE /v1/orgs/{orgId} — Platform Owner/Admin remove empty agent/merchant org.
 */
export async function handleDeleteOrg(req, res, orgId) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  if (!caller.platformOperator) {
    sendError(res, 403, "forbidden", "Platform Owner or Administrator required");
    return;
  }

  const row = await findOrgById(orgId);
  if (!row) {
    sendError(res, 404, "not_found", "Org not found");
    return;
  }
  if (!MANAGEABLE_ORG_TYPES.has(row.type)) {
    sendError(
      res,
      400,
      "invalid_request",
      "Only agent or merchant accounts can be deleted here",
    );
    return;
  }

  const children = await countChildOrgs(orgId);
  if (children > 0) {
    sendError(
      res,
      409,
      "has_children",
      row.type === "merchant"
        ? "Remove merchant sites before deleting this merchant"
        : "Remove or reassign child agents and merchants before deleting this agent",
    );
    return;
  }

  const result = await deleteOrgAccount(orgId);
  if (!result.ok) {
    if (result.code === "has_dependencies") {
      sendError(
        res,
        409,
        "has_dependencies",
        "Account still has linked records (orders, bills, or keys). Pause instead.",
      );
      return;
    }
    sendError(res, 404, "not_found", "Org not found");
    return;
  }

  await insertAuditEvent({
    actorUserId: caller.userId,
    orgId,
    action: AUDIT_ACTIONS.orgDelete,
    metadata: { type: row.type, name: row.name },
  });

  res.writeHead(204);
  res.end();
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

  if (result.insert.parentId) {
    const sibling = await findSiblingByNormalizedName(
      result.insert.parentId,
      result.insert.name,
    );
    if (sibling) {
      sendError(
        res,
        409,
        "duplicate_sibling_name",
        "An org with this name already exists under the same parent",
      );
      return;
    }
  }

  /** @type {{ tier: string, volumeFeePercent: string, needsApproval?: boolean } | null} */
  let commercialPlan = null;
  if (result.insert.type === "merchant") {
    const parsed = parseCommercialOnCreate(body?.commercial);
    if (!parsed.ok) {
      sendError(res, parsed.status, parsed.code, parsed.message);
      return;
    }
    const bandCheck = await validateCommercialOnCreate(parsed.tier, parsed.volumeFeePercent);
    if (!bandCheck.ok) {
      sendError(res, bandCheck.status, bandCheck.code, bandCheck.message);
      return;
    }
    commercialPlan = {
      tier: parsed.tier,
      volumeFeePercent: parsed.volumeFeePercent,
      needsApproval: bandCheck.needsApproval,
    };
  }

  const inserted = await insertOrgAccount(result.insert);
  if (!inserted.ok) {
    if (inserted.code === "duplicate_sibling_name") {
      sendError(
        res,
        409,
        "duplicate_sibling_name",
        "An org with this name already exists under the same parent",
      );
      return;
    }
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

  if (inserted.row.type === "merchant" && commercialPlan) {
    await bootstrapMerchantCommercial({
      orgId: inserted.row.id,
      tier: commercialPlan.tier,
      volumeFeePercent: commercialPlan.volumeFeePercent,
      actorUserId: caller.userId,
      needsApproval: commercialPlan.needsApproval,
    });
  }

  if (inserted.row.type === "agent" || inserted.row.type === "agent_sub") {
    const fromBody = parseCommissionPercent(body?.commissionPercent);
    await bootstrapAgentCommission({
      orgId: inserted.row.id,
      commissionPercent: fromBody ?? DEFAULT_AGENT_COMMISSION_PERCENT,
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
