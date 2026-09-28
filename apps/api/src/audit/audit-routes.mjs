import { once } from "node:events";
import { sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { listOrgsInSubtree } from "../orgs/org-scope.mjs";
import { auditListScope } from "../orgs/role-policy.mjs";
import { auditCsvHeaderLine, auditCsvLine } from "./audit-csv.mjs";
import { isValidTimeZone } from "../dashboard/dashboard-range.mjs";
import {
  parseAuditActionFilter,
  parseAuditLimit,
  parseAuditOffset,
  parseAuditSearch,
  parseAuditSearchActions,
  parseIsoDateTimeFilter,
  toAuditLogEntry,
} from "./audit-list-rules.mjs";
import { iterateAuditLogBatches, listAuditLogPage } from "./audit-list-store.mjs";
import { enrichAuditLogRows } from "./audit-enrich.mjs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Caller scope + shared filters (from, to, action, orgId, actorUserId, q, qActions).
 * Sends the error response and returns null when rejected.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {URL} url
 * @returns {Promise<import("./audit-list-store.mjs").AuditListFilter | null>}
 */
async function resolveAuditFilter(req, res, url) {
  const caller = await requireCaller(req, res);
  if (!caller) return null;

  const scope = auditListScope(caller);
  if (scope.kind === "none") {
    sendError(res, 403, "forbidden", "Cashiers cannot view audit log");
    return null;
  }

  const fromFilter = parseIsoDateTimeFilter(url.searchParams.get("from"), "from");
  if (!fromFilter.ok) {
    sendError(res, fromFilter.status, fromFilter.code, fromFilter.message);
    return null;
  }
  const toFilter = parseIsoDateTimeFilter(url.searchParams.get("to"), "to");
  if (!toFilter.ok) {
    sendError(res, toFilter.status, toFilter.code, toFilter.message);
    return null;
  }
  const actionFilter = parseAuditActionFilter(url.searchParams.get("action"));
  if (!actionFilter.ok) {
    sendError(res, actionFilter.status, actionFilter.code, actionFilter.message);
    return null;
  }
  const searchFilter = parseAuditSearch(url.searchParams.get("q"));
  if (!searchFilter.ok) {
    sendError(res, searchFilter.status, searchFilter.code, searchFilter.message);
    return null;
  }
  const searchActions = parseAuditSearchActions(url.searchParams.get("qActions"));
  if (!searchActions.ok) {
    sendError(res, searchActions.status, searchActions.code, searchActions.message);
    return null;
  }

  const orgIdRaw = url.searchParams.get("orgId");
  const orgId = orgIdRaw?.trim() ? orgIdRaw.trim() : null;
  const actorRaw = url.searchParams.get("actorUserId");
  const actorUserId = actorRaw?.trim() ? actorRaw.trim() : null;
  if ((orgId && !UUID_RE.test(orgId)) || (actorUserId && !UUID_RE.test(actorUserId))) {
    sendError(res, 400, "invalid_request", "orgId and actorUserId must be UUIDs");
    return null;
  }

  /** @type {string[] | undefined} */
  let orgIds;
  if (scope.kind === "scoped") {
    const subtree = await listOrgsInSubtree(scope.rootIds);
    orgIds = subtree.map((r) => r.id);
    if (orgId && !orgIds.includes(orgId)) {
      sendError(res, 403, "forbidden", "Outside audit scope");
      return null;
    }
  }

  return {
    kind: scope.kind === "all" ? "all" : "filter",
    orgIds,
    orgId,
    actorUserId,
    action: actionFilter.action,
    from: fromFilter.value,
    to: toFilter.value,
    q: searchFilter.q,
    qActions: searchActions.actions,
  };
}

/**
 * GET /v1/audit
 * Query: from, to, action, orgId, actorUserId, q, qActions, limit (1–500, default 100), offset
 * Response: { items, total, limit, offset } — newest first.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {URL} url
 */
export async function handleListAuditLog(req, res, url) {
  const limitFilter = parseAuditLimit(url.searchParams.get("limit"));
  const offsetFilter = parseAuditOffset(url.searchParams.get("offset"));
  const filter = await resolveAuditFilter(req, res, url);
  if (!filter) return;
  if (!limitFilter.ok) {
    sendError(res, limitFilter.status, limitFilter.code, limitFilter.message);
    return;
  }
  if (!offsetFilter.ok) {
    sendError(res, offsetFilter.status, offsetFilter.code, offsetFilter.message);
    return;
  }

  const page = await listAuditLogPage({
    ...filter,
    limit: limitFilter.limit,
    offset: offsetFilter.offset,
  });
  const rows = await enrichAuditLogRows(page.rows);

  sendJson(res, 200, {
    items: rows.map(toAuditLogEntry),
    total: page.total,
    limit: limitFilter.limit,
    offset: offsetFilter.offset,
  });
}

/**
 * Backpressure wait that leaves no listeners behind (one wait per slow batch).
 * @param {import("node:http").ServerResponse} res
 */
function drainOrClose(res) {
  return new Promise((resolve) => {
    const done = () => {
      res.off("drain", done);
      res.off("close", done);
      resolve(undefined);
    };
    res.on("drain", done);
    res.on("close", done);
  });
}

/**
 * GET /v1/audit/export — CSV of every matching event, streamed newest first.
 * Same filters and scope as GET /v1/audit; no row cap.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {URL} url
 */
export async function handleExportAuditLog(req, res, url) {
  const filter = await resolveAuditFilter(req, res, url);
  if (!filter) return;

  const stamp = new Date().toISOString().slice(0, 10);
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="paymentgate-audit-${stamp}.csv"`,
  );
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Accel-Buffering", "no");

  let closed = false;
  res.on("close", () => {
    closed = true;
  });

  try {
    const tzParam = url.searchParams.get("tz");
    const timeZone = tzParam && isValidTimeZone(tzParam) ? tzParam : "UTC";
    res.write(auditCsvHeaderLine(timeZone));
    for await (const batch of iterateAuditLogBatches(filter)) {
      if (closed) return;
      const rows = await enrichAuditLogRows(batch);
      if (!res.write(rows.map((row) => auditCsvLine(row, timeZone)).join(""))) await drainOrClose(res);
    }
    res.end();
  } catch (err) {
    console.error("[audit-export] stream failed", err);
    res.destroy(err instanceof Error ? err : new Error(String(err)));
  }
}
