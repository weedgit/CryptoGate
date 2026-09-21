import { readJsonBody, sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { DEFAULT_MAX_AGENT_DEPTH, isOrgIconValue, ORG_STATUSES, toOrgAccount } from "./org-accounts.mjs";
import { validateCreateOrg } from "./org-rules.mjs";
import { insertMembership } from "./membership-store.mjs";
import { isVisibleOrg, listVisibleOrgs, roleOnOrg } from "./org-access.mjs";
import {
  canBootstrapPlatform,
  canCreateOrgUnderParent,
  canEditOrgProfile,
  canManageDirectChildOrg,
  canManageMerchantSiteTree,
  canManagePlatform,
} from "./role-policy.mjs";
import {
  deleteOrgCascade,
  summarizeOrgDeleteImpact,
} from "./org-delete.mjs";
import { collectAncestorOrgIds } from "./org-ancestry.mjs";
import { invalidatePlatformOrgListCache } from "./org-list-cache.mjs";
import {
  agentDepthOfParent,
  countChildOrgs,
  deleteOrgAccount,
  findOrgById,
  findPlatformOrg,
  findSiblingByNormalizedName,
  findSiblingByNormalizedNameExcluding,
  insertOrgAccount,
  updateOrgProfile,
  updateOrgStatus,
} from "./org-store.mjs";
import { AUDIT_ACTIONS } from "../audit/audit-rules.mjs";
import { insertAuditEvent } from "../audit/audit-store.mjs";
import { emitDashboardLive } from "../events/dashboard-events-hub.mjs";
import {
  bootstrapMerchantCommercial,
  parseCommercialOnCreate,
} from "../commercial/merchant-commercial-routes.mjs";
import { validateCommercialOnCreate } from "../commercial/merchant-commercial-rules.mjs";
import { bootstrapAgentCommission } from "../commercial/agent-commission-routes.mjs";
import { parseCommissionPercent } from "../commercial/agent-commission-rules.mjs";
import {
  defaultAgentSchedulePlan,
  defaultMerchantSchedulePlan,
} from "../platform-settings/pricing-resolve.mjs";

const MANAGEABLE_ORG_TYPES = new Set(["agent", "agent_sub", "merchant"]);

function wantsCascadeDelete(req) {
  try {
    const url = new URL(req.url ?? "/", "http://local");
    const v = url.searchParams.get("cascade");
    return v === "1" || v === "true";
  } catch {
    return false;
  }
}

async function assertMayDeleteOrg(caller, row, orgId, res) {
  const visible = await listVisibleOrgs(caller.platformOperator, caller.memberships);
  if (!isVisibleOrg(visible, orgId)) {
    sendError(res, 404, "not_found", "Org not found");
    return false;
  }
  if (row.type === "platform") {
    sendError(res, 400, "invalid_request", "Platform org cannot be deleted");
    return false;
  }
  if (row.type === "merchant_site") {
    if (!(await canManageMerchantSiteTree(caller, row))) {
      sendError(
        res,
        403,
        "forbidden",
        "Parent merchant or site Owner or Administrator required",
      );
      return false;
    }
    return true;
  }
  if (!caller.platformOperator) {
    const ancestors = await collectAncestorOrgIds(row);
    if (!canManageDirectChildOrg(caller, row, ancestors)) {
      sendError(
        res,
        403,
        "forbidden",
        "Not allowed to delete this org — only direct children of your agent account",
      );
      return false;
    }
  }
  if (!MANAGEABLE_ORG_TYPES.has(row.type)) {
    sendError(
      res,
      400,
      "invalid_request",
      "Only agent or merchant accounts can be deleted here",
    );
    return false;
  }
  return true;
}

/**
 * GET /v1/orgs/{orgId}/delete-preview
 */
export async function handleGetOrgDeletePreview(req, res, orgId) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  const row = await findOrgById(orgId);
  if (!row) {
    sendError(res, 404, "not_found", "Org not found");
    return;
  }
  if (!(await assertMayDeleteOrg(caller, row, orgId, res))) return;

  const summary = await summarizeOrgDeleteImpact(orgId);
  sendJson(res, 200, summary);
}

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
 * PATCH /v1/orgs/{orgId} — Owner/Admin (or platform) updates display name + brand icon.
 */
export async function handlePatchOrg(req, res, orgId) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  const row = await findOrgById(orgId);
  if (!row) {
    sendError(res, 404, "not_found", "Org not found");
    return;
  }
  const visible = await listVisibleOrgs(caller.platformOperator, caller.memberships);
  if (!isVisibleOrg(visible, orgId)) {
    sendError(res, 404, "not_found", "Org not found");
    return;
  }
  if (!canEditOrgProfile(caller, row)) {
    sendError(
      res,
      403,
      "forbidden",
      "Owner or Administrator required to edit org profile",
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

  const name =
    typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  if (name.length < 2 || name.length > 120) {
    sendError(res, 400, "invalid_request", "name must be 2–120 characters");
    return;
  }

  let iconKey = null;
  if (body?.iconKey != null && body.iconKey !== "") {
    if (!isOrgIconValue(body.iconKey)) {
      sendError(
        res,
        400,
        "invalid_request",
        "iconKey must be a preset mark or a small PNG/JPEG/WebP/GIF image",
      );
      return;
    }
    iconKey = body.iconKey;
  }

  let country;
  if (typeof body?.country === "string") {
    const trimmed = body.country.trim();
    if (!trimmed) {
      sendError(res, 400, "invalid_request", "country is required");
      return;
    }
    if (trimmed.length > 80) {
      sendError(res, 400, "invalid_request", "country is too long");
      return;
    }
    country = trimmed;
  }

  if (row.parent_id) {
    const clash = await findSiblingByNormalizedNameExcluding(
      row.parent_id,
      name,
      orgId,
    );
    if (clash) {
      sendError(
        res,
        409,
        "name_conflict",
        "Another account under the same parent already uses this name",
      );
      return;
    }
  }

  const updated = await updateOrgProfile(orgId, { name, iconKey, country });
  if (!updated) {
    sendError(res, 404, "not_found", "Org not found");
    return;
  }

  invalidatePlatformOrgListCache();
  await insertAuditEvent({
    actorUserId: caller.userId,
    orgId,
    action: AUDIT_ACTIONS.orgProfile,
    metadata: {
      name,
      country: country ?? undefined,
      iconKey: iconKey?.startsWith("data:") ? "custom_image" : iconKey,
    },
  }).catch(() => {});

  sendJson(res, 200, toOrgAccount(updated));
}

/**
 * PUT /v1/orgs/{orgId}/status — pause or resume agent, merchant, or merchant_site.
 * Platform operators; agent Owner/Admin on a direct agent/merchant child;
 * parent merchant Owner/Admin for a merchant_site.
 */
export async function handleSetOrgStatus(req, res, orgId) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  const row = await findOrgById(orgId);
  if (!row) {
    sendError(res, 404, "not_found", "Org not found");
    return;
  }
  if (row.type === "merchant_site") {
    if (!(await canManageMerchantSiteTree(caller, row))) {
      sendError(
        res,
        403,
        "forbidden",
        "Parent merchant or site Owner or Administrator required",
      );
      return;
    }
  } else {
    if (!MANAGEABLE_ORG_TYPES.has(row.type)) {
      sendError(
        res,
        400,
        "invalid_request",
        "Only agent or merchant accounts can be paused or resumed here",
      );
      return;
    }

    if (!caller.platformOperator) {
      const ancestors = await collectAncestorOrgIds(row);
      if (!canManageDirectChildOrg(caller, row, ancestors)) {
        sendError(
          res,
          403,
          "forbidden",
          "Not allowed to change status — only direct children of your agent account",
        );
        return;
      }
    }
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

  invalidatePlatformOrgListCache();
  emitDashboardLive({
    type: "org.status",
    slices: ["orgs"],
    orgId,
    parentId: row.parent_id ?? null,
  });
  sendJson(res, 200, toOrgAccount(updated));
}

/**
 * DELETE /v1/orgs/{orgId}?cascade=1
 * - cascade=1: delete subtree, members, orders, bills, and keys (deepest children first)
 * - default: single org only when empty (no children, no blocking FK rows)
 */
export async function handleDeleteOrg(req, res, orgId) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  const row = await findOrgById(orgId);
  if (!row) {
    sendError(res, 404, "not_found", "Org not found");
    return;
  }
  if (!(await assertMayDeleteOrg(caller, row, orgId, res))) return;

  const cascade = wantsCascadeDelete(req);

  if (cascade) {
    try {
      const summary = await summarizeOrgDeleteImpact(orgId);
      if (summary.orgCount === 0) {
        sendError(res, 404, "not_found", "Org not found");
        return;
      }
      const { deletedOrgIds } = await deleteOrgCascade(orgId);
      if (deletedOrgIds.length === 0) {
        sendError(res, 404, "not_found", "Org not found");
        return;
      }
      try {
        await insertAuditEvent({
          actorUserId: caller.userId,
          orgId: null,
          action: AUDIT_ACTIONS.orgDelete,
          metadata: {
            deletedOrgId: orgId,
            deletedOrgIds,
            type: row.type,
            name: row.name,
            parentId: row.parent_id ?? null,
            cascade: true,
            orgCount: summary.orgCount,
            memberCount: summary.memberCount,
            orderCount: summary.orderCount,
            billCount: summary.billCount,
          },
        });
      } catch (auditErr) {
        if (process.env.NODE_ENV !== "test") {
          console.error("org delete audit failed after cascade", auditErr);
        }
      }
      invalidatePlatformOrgListCache();
      res.writeHead(204);
      res.end();
    } catch (err) {
      if (err?.code === "has_dependencies" || err?.code === "23503") {
        sendError(
          res,
          409,
          "has_dependencies",
          err.message ||
            "Account still has linked records that could not be removed automatically.",
        );
        return;
      }
      if (process.env.NODE_ENV !== "test") {
        console.error("org delete cascade failed", err);
      }
      sendError(res, 500, "internal_error", "Failed to delete org account");
      return;
    }
    return;
  }

  const children = await countChildOrgs(orgId);
  if (children > 0) {
    sendError(
      res,
      409,
      "has_children",
      row.type === "merchant"
        ? "Remove merchant sites first, or delete with ?cascade=1"
        : row.type === "merchant_site"
          ? "Remove child orgs before deleting this site"
          : "Remove child orgs first, or delete with ?cascade=1",
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
        row.type === "merchant_site"
          ? "Site still has linked records. Delete with cascade or remove them first."
          : "Account still has linked records. Delete with cascade or pause instead.",
      );
      return;
    }
    sendError(res, 404, "not_found", "Org not found");
    return;
  }

  await insertAuditEvent({
    actorUserId: caller.userId,
    orgId: null,
    action: AUDIT_ACTIONS.orgDelete,
    metadata: {
      deletedOrgId: orgId,
      type: row.type,
      name: row.name,
      parentId: row.parent_id ?? null,
    },
  });

  invalidatePlatformOrgListCache();
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
    if (parent.type === "platform" && !canManagePlatform(caller)) {
      sendError(
        res,
        403,
        "forbidden",
        "Platform Owner or Administrator required to onboard under Platform",
      );
      return;
    }
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

  /** @type {{ tier: string, volumeFeePercent: string, rateMode: string, needsApproval?: boolean } | null} */
  let commercialPlan = null;
  if (result.insert.type === "merchant") {
    const parsed = parseCommercialOnCreate(body?.commercial);
    if (!parsed.ok) {
      sendError(res, parsed.status, parsed.code, parsed.message);
      return;
    }
    if (parsed.omitted) {
      const schedule = await defaultMerchantSchedulePlan();
      commercialPlan = {
        tier: schedule.tier,
        volumeFeePercent: schedule.volumeFeePercent,
        rateMode: "automatic",
        needsApproval: false,
      };
    } else {
      const bandCheck = await validateCommercialOnCreate(
        parsed.tier,
        parsed.volumeFeePercent,
      );
      if (!bandCheck.ok) {
        sendError(res, bandCheck.status, bandCheck.code, bandCheck.message);
        return;
      }
      commercialPlan = {
        tier: parsed.tier,
        volumeFeePercent: parsed.volumeFeePercent,
        rateMode: "automatic",
        needsApproval: bandCheck.needsApproval,
      };
    }
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
  invalidatePlatformOrgListCache();

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
      rateMode: commercialPlan.rateMode,
      actorUserId: caller.userId,
      needsApproval: commercialPlan.needsApproval,
    });
  }

  if (inserted.row.type === "agent" || inserted.row.type === "agent_sub") {
    const fromBody = parseCommissionPercent(body?.commissionPercent);
    if (fromBody) {
      await bootstrapAgentCommission({
        orgId: inserted.row.id,
        commissionPercent: fromBody,
        rateMode: "fixed",
      });
    } else {
      const schedule = await defaultAgentSchedulePlan();
      await bootstrapAgentCommission({
        orgId: inserted.row.id,
        commissionPercent: schedule.commissionPercent,
        rateMode: "automatic",
      });
    }
  }

  await insertAuditEvent({
    actorUserId: caller.userId,
    orgId: inserted.row.id,
    action: AUDIT_ACTIONS.orgCreate,
    metadata: { type: inserted.row.type, parentId: inserted.row.parent_id },
  });

  emitDashboardLive({
    type: "org.created",
    slices: ["orgs"],
    orgId: inserted.row.id,
    parentId: inserted.row.parent_id ?? null,
  });

  sendJson(res, 201, toOrgAccount(inserted.row));
}
