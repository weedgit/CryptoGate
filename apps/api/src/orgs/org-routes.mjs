import { readJsonBody, sendError, sendJson } from "../http/json.mjs";
import { requireSession } from "../http/require-session.mjs";
import { DEFAULT_MAX_AGENT_DEPTH, toOrgAccount } from "./org-accounts.mjs";
import { validateCreateOrg } from "./org-rules.mjs";
import {
  agentDepthOfParent,
  findOrgById,
  findPlatformOrg,
  insertOrgAccount,
  listOrgAccounts,
} from "./org-store.mjs";

/**
 * GET /v1/orgs — unscoped until M1-15 memberships.
 */
export async function handleListOrgs(req, res) {
  const auth = await requireSession(req, res);
  if (!auth) return;
  const rows = await listOrgAccounts();
  sendJson(res, 200, { items: rows.map(toOrgAccount) });
}

/**
 * GET /v1/orgs/{orgId}
 */
export async function handleGetOrg(req, res, orgId) {
  const auth = await requireSession(req, res);
  if (!auth) return;
  const row = await findOrgById(orgId);
  if (!row) {
    sendError(res, 404, "not_found", "Org not found");
    return;
  }
  sendJson(res, 200, toOrgAccount(row));
}

/**
 * POST /v1/orgs
 */
export async function handleCreateOrg(req, res) {
  const auth = await requireSession(req, res);
  if (!auth) return;

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
  sendJson(res, 201, toOrgAccount(inserted.row));
}
