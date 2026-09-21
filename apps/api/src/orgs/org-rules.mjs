import {
  DEFAULT_MAX_AGENT_DEPTH,
  ORG_TYPES,
} from "./org-accounts.mjs";

const AGENT_TYPES = new Set(["agent", "agent_sub"]);

/**
 * Trim + lowercase for sibling name comparison.
 * @param {unknown} name
 * @returns {string}
 */
export function normalizeOrgName(name) {
  if (typeof name !== "string") return "";
  return name.trim().toLowerCase();
}

/**
 * True when two display names collide under the same parent
 * (case-insensitive, trimmed).
 * @param {string} a
 * @param {string} b
 */
export function orgNamesEqual(a, b) {
  const na = normalizeOrgName(a);
  const nb = normalizeOrgName(b);
  return na.length > 0 && na === nb;
}

/**
 * Count agent / agent_sub nodes from this org up to (but not including) platform.
 * @param {{ type: string, parent_id: string | null } | null} org
 * @param {(id: string) => { type: string, parent_id: string | null } | null} getById
 */
export function agentDepthOf(org, getById) {
  let depth = 0;
  let current = org;
  const seen = new Set();
  while (current && current.type !== "platform") {
    if (seen.has(current.id ?? current.parent_id)) break;
    if (current.id) seen.add(current.id);
    if (AGENT_TYPES.has(current.type)) depth += 1;
    if (!current.parent_id) break;
    current = getById(current.parent_id);
  }
  return depth;
}

function parseRegistrationFields(input) {
  const country =
    typeof input.country === "string" && input.country.trim()
      ? input.country.trim()
      : null;
  const legalName =
    typeof input.legalName === "string" && input.legalName.trim()
      ? input.legalName.trim()
      : null;
  return { country, legalName };
}

function withRegistration(insert, input) {
  return { ...insert, ...parseRegistrationFields(input ?? {}) };
}

/**
 * @param {{ type?: unknown, name?: unknown, parentId?: unknown, country?: unknown, legalName?: unknown }} input
 * @param {{
 *   parent: object | null,
 *   maxAgentDepth: number,
 *   agentDepthOfParent: number,
 * }} ctx
 * @returns {{ ok: true, insert: object } | { ok: false, status: number, code: string, message: string }}
 */
export function validateCreateOrg(input, ctx) {
  const type = typeof input.type === "string" ? input.type : "";
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const parentIdRaw = input.parentId;
  const parentId =
    parentIdRaw === null || parentIdRaw === undefined || parentIdRaw === ""
      ? null
      : String(parentIdRaw);

  if (!ORG_TYPES.includes(type)) {
    return fail(400, "invalid_org_type", "Unknown org type");
  }
  if (!name) {
    return fail(400, "invalid_request", "Name is required");
  }

  // Nested agents removed — legacy agent_sub rows may remain read-only.
  if (type === "agent_sub") {
    return fail(
      403,
      "org_type_disabled",
      "Sub-agent accounts are no longer available — create a top-level agent under Platform",
    );
  }

  if (type === "platform") {
    if (parentId) {
      return fail(400, "invalid_parent", "Platform has no parent");
    }
    return {
      ok: true,
      insert: withRegistration(
        {
          type,
          name,
          parentId: null,
          maxAgentDepth: DEFAULT_MAX_AGENT_DEPTH,
        },
        input,
      ),
    };
  }

  if (!parentId || !ctx.parent) {
    return fail(400, "invalid_parent", "Parent org is required");
  }

  const parent = ctx.parent;

  const parentOk = parentTypeAllowed(type, parent.type);
  if (!parentOk) {
    return fail(403, "invalid_parent", "Org type is not allowed under this parent");
  }

  if (AGENT_TYPES.has(type)) {
    const nextDepth = ctx.agentDepthOfParent + 1;
    if (nextDepth > ctx.maxAgentDepth) {
      return fail(403, "agent_depth_exceeded", "Agent nesting exceeds platform max depth");
    }
  }

  return {
    ok: true,
    insert: withRegistration(
      {
        type,
        name,
        parentId,
        maxAgentDepth: null,
      },
      input,
    ),
  };
}

/** Phase 1 create graph: agent under platform; merchant under platform/agent;
 *  site under merchant or site (unlimited depth; no separate sub-site type). */
function parentTypeAllowed(childType, parentType) {
  switch (childType) {
    case "agent":
      return parentType === "platform";
    case "merchant":
      return parentType === "platform" || parentType === "agent";
    case "merchant_site":
      return parentType === "merchant" || parentType === "merchant_site";
    default:
      return false;
  }
}

function fail(status, code, message) {
  return { ok: false, status, code, message };
}
