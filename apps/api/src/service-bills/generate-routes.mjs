import { readJsonBody, sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { canIssueServiceBill } from "../orgs/role-policy.mjs";
import { AUDIT_ACTIONS } from "../audit/audit-rules.mjs";
import { insertAuditEvent } from "../audit/audit-store.mjs";
import { toServiceBill } from "./service-bill-rules.mjs";
import { resolveGeneratePeriod } from "./generate-rules.mjs";
import { generateServiceBillsForPeriod } from "./generate.mjs";

/**
 * POST /v1/service-bills/generate — platform only. Idempotent per org+period.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
export async function handleGenerateServiceBills(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  if (!canIssueServiceBill(caller)) {
    sendError(
      res,
      403,
      "forbidden",
      "Only platform operators may generate service bills",
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

  const period = resolveGeneratePeriod(body);
  if (!period.ok) {
    sendError(res, period.status, period.code, period.message);
    return;
  }

  const result = await generateServiceBillsForPeriod({
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    inclusiveStartIso: period.inclusiveStartIso,
    exclusiveEndIso: period.exclusiveEndIso,
    actorUserId: caller.userId,
  });

  if (result.issued.length > 0) {
    await insertAuditEvent({
      actorUserId: caller.userId,
      action: AUDIT_ACTIONS.serviceBillIssue,
      metadata: {
        generated: true,
        periodStart: result.periodStart,
        periodEnd: result.periodEnd,
        issuedCount: result.issued.length,
        skippedCount: result.skipped.length,
      },
    });
  }

  sendJson(res, 200, {
    periodStart: result.periodStart,
    periodEnd: result.periodEnd,
    issued: result.issued.map(toServiceBill),
    skipped: result.skipped,
  });
}
