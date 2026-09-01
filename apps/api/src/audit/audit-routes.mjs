import { sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { listOrgsInSubtree } from "../orgs/org-scope.mjs";
import { auditListScope } from "../orgs/role-policy.mjs";
import {
  parseAuditActionFilter,
  parseAuditLimit,
  parseIsoDateTimeFilter,
  toAuditLogEntry,
} from "./audit-list-rules.mjs";
import { listAuditLog } from "./audit-list-store.mjs";
import { enrichAuditLogRows } from "./audit-enrich.mjs";

/**
 * GET /v1/audit
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {URL} url
 */
export async function handleListAuditLog(req, res, url) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  const scope = auditListScope(caller);
  if (scope.kind === "none") {
    sendError(res, 403, "forbidden", "Cashiers cannot view audit log");
    return;
  }

  const fromFilter = parseIsoDateTimeFilter(url.searchParams.get("from"), "from");
  if (!fromFilter.ok) {
    sendError(res, fromFilter.status, fromFilter.code, fromFilter.message);
    return;
  }
  const toFilter = parseIsoDateTimeFilter(url.searchParams.get("to"), "to");
  if (!toFilter.ok) {
    sendError(res, toFilter.status, toFilter.code, toFilter.message);
    return;
  }
  const actionFilter = parseAuditActionFilter(url.searchParams.get("action"));
  if (!actionFilter.ok) {
    sendError(res, actionFilter.status, actionFilter.code, actionFilter.message);
    return;
  }
  const limitFilter = parseAuditLimit(url.searchParams.get("limit"));
  if (!limitFilter.ok) {
    sendError(res, limitFilter.status, limitFilter.code, limitFilter.message);
    return;
  }

  const orgIdRaw = url.searchParams.get("orgId");
  const orgId = orgIdRaw?.trim() ? orgIdRaw.trim() : null;
  const actorRaw = url.searchParams.get("actorUserId");
  const actorUserId = actorRaw?.trim() ? actorRaw.trim() : null;

  /** @type {string[] | undefined} */
  let orgIds;
  if (scope.kind === "scoped") {
    const subtree = await listOrgsInSubtree(scope.rootIds);
    orgIds = subtree.map((r) => r.id);
    if (orgId && !orgIds.includes(orgId)) {
      sendError(res, 403, "forbidden", "Outside audit scope");
      return;
    }
  }

  const rows = await enrichAuditLogRows(
    await listAuditLog({
      kind: scope.kind === "all" ? "all" : "filter",
      orgIds,
      orgId,
      actorUserId,
      action: actionFilter.action,
      from: fromFilter.value,
      to: toFilter.value,
      limit: limitFilter.limit,
    }),
  );

  sendJson(res, 200, { items: rows.map(toAuditLogEntry) });
}
