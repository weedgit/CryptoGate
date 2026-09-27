import { readJsonBody, sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { AUDIT_ACTIONS } from "../audit/audit-rules.mjs";
import { insertAuditEvent } from "../audit/audit-store.mjs";
import { canFindMissedInvoices } from "../orgs/role-policy.mjs";
import { utcToday } from "./billing-anchor-rules.mjs";
import { createMissedInvoice, findMissedInvoices } from "./missed-invoices.mjs";
import {
  validateCreateMissedInvoiceBody,
  validateMissedInvoiceRange,
} from "./missed-invoice-rules.mjs";
import { toServiceBill } from "./service-bill-rules.mjs";

async function requireOperator(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return null;
  if (!canFindMissedInvoices(caller)) {
    sendError(
      res,
      403,
      "forbidden",
      "Only platform Owner or Administrator may find missed invoices",
    );
    return null;
  }
  return caller;
}

/**
 * GET /v1/service-bills/missed?from=YYYY-MM-DD&to=YYYY-MM-DD
 * @param {URL} url
 */
export async function handleFindMissedInvoices(req, res, url) {
  const caller = await requireOperator(req, res);
  if (!caller) return;
  const today = utcToday();
  const range = validateMissedInvoiceRange(
    url.searchParams.get("from"),
    url.searchParams.get("to"),
    today,
  );
  if (!range.ok) {
    sendError(res, range.status, range.code, range.message);
    return;
  }
  const missed = await findMissedInvoices({ from: range.from, to: range.to });
  sendJson(res, 200, { from: range.from, to: range.to, today, missed });
}

/**
 * POST /v1/service-bills/missed — create one reviewed missed invoice.
 */
export async function handleCreateMissedInvoice(req, res) {
  const caller = await requireOperator(req, res);
  if (!caller) return;
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }
  const validated = validateCreateMissedInvoiceBody(body);
  if (!validated.ok) {
    sendError(res, validated.status, validated.code, validated.message);
    return;
  }
  const result = await createMissedInvoice({
    orgId: validated.orgId,
    periodStart: validated.periodStart,
    today: utcToday(),
  });
  if (!result.ok) {
    sendError(res, result.status, result.code, result.message);
    return;
  }
  const row = result.bill;
  await insertAuditEvent({
    actorUserId: caller.userId,
    orgId: validated.orgId,
    action: AUDIT_ACTIONS.serviceBillIssue,
    metadata: {
      billId: row.id,
      source: "missed_invoice",
      periodStart: validated.periodStart,
      invoiceOn: result.candidate.invoiceOn,
      previouslyCancelled: result.candidate.previouslyCancelled,
      totalAmount: row.total_amount,
      status: row.status,
    },
  });
  sendJson(res, 201, toServiceBill(row));
}
