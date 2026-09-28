import { createReadStream } from "node:fs";
import { sendError, sendJson, readJsonBody } from "../http/json.mjs";
import { requireCaller, assertApiKeyScope } from "../http/require-caller.mjs";
import { canExportPaymentOrders } from "../orgs/role-policy.mjs";
import { parseListOrdersQuery } from "./order-list-query.mjs";
import { resolvePaymentOrderListQuery } from "./order-list-resolve.mjs";
import {
  createInvoiceExportJob,
  findInvoiceExportJob,
  invoiceExportFileExists,
  toInvoiceExportJob,
} from "./order-export-store.mjs";

/**
 * Build URLSearchParams from JSON body filters (same keys as list query).
 * @param {Record<string, unknown>} body
 */
function paramsFromBody(body) {
  const p = new URLSearchParams();
  for (const key of [
    "status",
    "orgId",
    "includeSubtree",
    "agentOrgId",
    "createdBy",
    "createdFrom",
    "createdTo",
    "q",
    "asset",
    "network",
    "createdVia",
    "tz",
  ]) {
    const v = body[key];
    if (v == null || v === "") continue;
    if (typeof v === "boolean") {
      if (v) p.set(key, "1");
      continue;
    }
    p.set(key, String(v));
  }
  return p;
}

/**
 * POST /v1/orders/exports
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
export async function handleCreateInvoiceExport(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return;
  if (!assertApiKeyScope(caller, res, "orders")) return;
  if (!canExportPaymentOrders(caller)) {
    sendError(res, 403, "forbidden", "Cashiers cannot export payment orders");
    return;
  }

  const body = (await readJsonBody(req)) ?? {};
  const search =
    body && typeof body === "object" && Object.keys(body).length > 0
      ? paramsFromBody(/** @type {Record<string, unknown>} */ (body))
      : new URL(
          req.url ?? "/",
          `http://${req.headers.host ?? "localhost"}`,
        ).searchParams;

  const parsed = parseListOrdersQuery(search, undefined);
  if (!parsed.ok) {
    sendError(res, parsed.status, parsed.code, parsed.message);
    return;
  }
  // Async export ignores csv/limit from client — worker pages.
  parsed.csv = false;
  parsed.limit = 100;
  parsed.offset = 0;

  const resolved = await resolvePaymentOrderListQuery(caller, parsed);
  if (!resolved.ok) {
    sendError(res, resolved.status, resolved.code, resolved.message);
    return;
  }

  const filters = Object.fromEntries(search.entries());
  const listQuery = { ...resolved.query };
  delete listQuery.limit;
  delete listQuery.offset;

  const job = await createInvoiceExportJob(
    caller.userId,
    filters,
    listQuery,
  );
  sendJson(res, 201, toInvoiceExportJob(job));
}

/**
 * GET /v1/orders/exports/:id
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} id
 */
export async function handleGetInvoiceExport(req, res, id) {
  const caller = await requireCaller(req, res);
  if (!caller) return;
  if (!assertApiKeyScope(caller, res, "orders")) return;
  if (!canExportPaymentOrders(caller)) {
    sendError(res, 403, "forbidden", "Cashiers cannot export payment orders");
    return;
  }

  const job = await findInvoiceExportJob(id);
  if (!job) {
    sendError(res, 404, "not_found", "Export job not found");
    return;
  }
  if (job.requested_by !== caller.userId && !caller.platformOperator) {
    sendError(res, 403, "forbidden", "Outside export scope");
    return;
  }
  sendJson(res, 200, toInvoiceExportJob(job));
}

/**
 * GET /v1/orders/exports/:id/download
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} id
 */
export async function handleDownloadInvoiceExport(req, res, id) {
  const caller = await requireCaller(req, res);
  if (!caller) return;
  if (!assertApiKeyScope(caller, res, "orders")) return;
  if (!canExportPaymentOrders(caller)) {
    sendError(res, 403, "forbidden", "Cashiers cannot export payment orders");
    return;
  }

  const job = await findInvoiceExportJob(id);
  if (!job || job.status === "expired") {
    sendError(res, 404, "not_found", "Export job not found or expired");
    return;
  }
  if (job.requested_by !== caller.userId && !caller.platformOperator) {
    sendError(res, 403, "forbidden", "Outside export scope");
    return;
  }
  if (job.status !== "ready") {
    sendError(res, 409, "conflict", `Export is ${job.status}`);
    return;
  }

  const filePath = await invoiceExportFileExists(job.id, job.file_name);
  if (!filePath) {
    sendError(res, 404, "not_found", "Export file missing");
    return;
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="payment-orders-${job.id.slice(0, 8)}.csv"`,
  );
  createReadStream(filePath).pipe(res);
}
