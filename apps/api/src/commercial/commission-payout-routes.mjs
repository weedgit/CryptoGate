import { readJsonBody, sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { AUDIT_ACTIONS } from "../audit/audit-rules.mjs";
import { insertAuditEvent } from "../audit/audit-store.mjs";
import { isVisibleOrg, listVisibleOrgs } from "../orgs/org-access.mjs";
import { findOrgById, findPlatformOrg } from "../orgs/org-store.mjs";
import {
  canIssueServiceBill,
  canManageAgentCommissionPayout,
  canReadAllCommissionPayouts,
  canReadCommissionPayouts,
} from "../orgs/role-policy.mjs";
import {
  defaultCommissionPeriodKey,
  generateMonthlyCommissionInvoices,
  generateSubAgentCommissionInvoices,
  validatePeriodKey,
} from "./commission-invoice-generate.mjs";
import {
  toCommissionPayout,
  scopedCommissionPayoutListFilter,
  validateConfirmSentBody,
  validateMarkPaidBody,
  validateUpsertCommissionPayoutBody,
} from "./commission-payout-rules.mjs";
import {
  findCommissionPayoutById,
  listCommissionPayoutRows,
  markCommissionPayoutPaidRow,
  markCommissionPayoutSettledRow,
  markCommissionPayoutVerifyingRow,
  upsertCommissionPayoutRow,
} from "./commission-payout-store.mjs";

/**
 * GET /v1/commission-payouts
 */
export async function handleListCommissionPayouts(req, res, url) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  if (!canReadCommissionPayouts(caller)) {
    sendError(res, 403, "forbidden", "Not allowed to list commission payouts");
    return;
  }

  const payer = url.searchParams.get("payer") || undefined;
  const payeeOrgId = url.searchParams.get("payeeOrgId") || undefined;
  const payerOrgId = url.searchParams.get("payerOrgId") || undefined;

  if (payer && payer !== "platform" && payer !== "agent") {
    sendError(res, 400, "invalid_request", "payer must be platform or agent");
    return;
  }

  /** @type {{ payer?: string, payeeOrgId?: string, payerOrgId?: string }} */
  let filter = {};
  if (payer) filter.payer = payer;
  if (payeeOrgId) filter.payeeOrgId = payeeOrgId;

  // Non-platform: slips they issue, platform→self, or parent→self (sub-agent).
  if (!canReadAllCommissionPayouts(caller)) {
    const agentRoots = caller.memberships
      .filter(
        (m) =>
          (m.orgType === "agent" || m.orgType === "agent_sub") &&
          ["owner", "administrator", "viewer"].includes(m.role),
      )
      .map((m) => m.orgId);
    if (agentRoots.length === 0) {
      sendJson(res, 200, { items: [] });
      return;
    }
    const scoped = scopedCommissionPayoutListFilter(agentRoots, {
      payer,
      payeeOrgId,
      payerOrgId,
    });
    if (!scoped.ok) {
      sendError(res, scoped.status, scoped.code, scoped.message);
      return;
    }
    filter = scoped.filter;
  } else if (payerOrgId) {
    filter.payerOrgId = payerOrgId;
  }

  const rows = await listCommissionPayoutRows(filter);
  sendJson(res, 200, { items: rows.map(toCommissionPayout) });
}

/**
 * POST /v1/commission-payouts — prepare / upsert ready slip
 */
export async function handleUpsertCommissionPayout(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const validated = validateUpsertCommissionPayoutBody(body);
  if (!validated.ok) {
    sendError(res, validated.status, validated.code, validated.message);
    return;
  }
  const p = validated.parsed;

  if (p.payer === "platform") {
    if (!canIssueServiceBill(caller)) {
      sendError(res, 403, "forbidden", "Not allowed to prepare platform payouts");
      return;
    }
  } else if (!canManageAgentCommissionPayout(caller, p.payerOrgId)) {
    sendError(res, 403, "forbidden", "Not allowed to prepare agent sub-payouts");
    return;
  }

  const visible = await listVisibleOrgs(
    caller.platformOperator,
    caller.memberships,
  );
  if (!isVisibleOrg(visible, p.payeeOrgId)) {
    sendError(res, 404, "not_found", "Payee org not found");
    return;
  }
  if (p.payerOrgId && !isVisibleOrg(visible, p.payerOrgId)) {
    sendError(res, 404, "not_found", "Payer org not found");
    return;
  }

  const payee = await findOrgById(p.payeeOrgId);
  if (!payee || (payee.type !== "agent" && payee.type !== "agent_sub")) {
    sendError(res, 400, "invalid_org_type", "Payee must be an agent org");
    return;
  }

  const row = await upsertCommissionPayoutRow(p);
  await insertAuditEvent({
    actorUserId: caller.userId,
    orgId: p.payeeOrgId,
    action: AUDIT_ACTIONS.commissionPayoutUpsert,
    metadata: {
      payoutId: row.id,
      payer: p.payer,
      periodKey: p.periodKey,
      commissionAmount: p.commissionAmount,
    },
  });
  sendJson(res, 200, toCommissionPayout(row));
}

/**
 * POST /v1/commission-payouts/{id}/confirm-sent
 * ready → verifying (USDT-TRON remittance sent; await match / ops complete)
 */
export async function handleConfirmCommissionPayoutSent(req, res, payoutId) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  const existing = await findCommissionPayoutById(payoutId);
  if (!existing) {
    sendError(res, 404, "not_found", "Payout not found");
    return;
  }

  if (existing.payer === "platform") {
    if (!canIssueServiceBill(caller)) {
      sendError(res, 403, "forbidden", "Not allowed to confirm platform payouts");
      return;
    }
  } else if (
    !canManageAgentCommissionPayout(caller, existing.payer_org_id)
  ) {
    sendError(res, 403, "forbidden", "Not allowed to confirm this payout");
    return;
  }

  if (existing.payout_status === "paid") {
    sendError(res, 409, "already_paid", "Payout is already paid");
    return;
  }

  let body = {};
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }
  const validated = validateConfirmSentBody(body);
  if (!validated.ok) {
    sendError(res, validated.status, validated.code, validated.message);
    return;
  }

  const row = await markCommissionPayoutVerifyingRow({
    id: payoutId,
    note: validated.parsed.note,
  });
  if (!row) {
    sendError(res, 409, "invalid_state", "Payout cannot enter verification");
    return;
  }
  await insertAuditEvent({
    actorUserId: caller.userId,
    orgId: existing.payee_org_id,
    action: AUDIT_ACTIONS.commissionPayoutConfirmSent,
    metadata: {
      payoutId,
      note: validated.parsed.note,
      payer: existing.payer,
    },
  });
  sendJson(res, 200, toCommissionPayout(row));
}

/**
 * POST /v1/commission-payouts/{id}/mark-paid
 * Complete: manual (note required when from ready without tx) or after verifying.
 */
export async function handleMarkCommissionPayoutPaid(req, res, payoutId) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  const existing = await findCommissionPayoutById(payoutId);
  if (!existing) {
    sendError(res, 404, "not_found", "Payout not found");
    return;
  }

  if (existing.payer === "platform") {
    if (!canIssueServiceBill(caller)) {
      sendError(res, 403, "forbidden", "Not allowed to mark platform payouts paid");
      return;
    }
  } else if (
    !canManageAgentCommissionPayout(caller, existing.payer_org_id)
  ) {
    sendError(res, 403, "forbidden", "Not allowed to mark this payout paid");
    return;
  }

  if (
    existing.payout_status === "paid" ||
    existing.payout_status === "settled"
  ) {
    sendError(
      res,
      409,
      "already_paid",
      existing.payout_status === "settled"
        ? "Payout is already settled"
        : "Payout is already paid (awaiting agent confirm)",
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
  const validated = validateMarkPaidBody(body);
  if (!validated.ok) {
    sendError(res, validated.status, validated.code, validated.message);
    return;
  }

  const fromOpen =
    existing.payout_status === "ready" ||
    existing.payout_status === "issued";
  const hasTx = Boolean(validated.parsed.txRef || existing.tx_ref);
  if (fromOpen && !hasTx && !validated.parsed.note) {
    sendError(
      res,
      400,
      "invalid_request",
      "note is required to complete without on-chain remittance",
    );
    return;
  }

  const row = await markCommissionPayoutPaidRow({
    id: payoutId,
    txRef: validated.parsed.txRef,
    note: validated.parsed.note,
  });
  if (!row) {
    sendError(res, 409, "invalid_state", "Payout cannot be marked paid");
    return;
  }
  await insertAuditEvent({
    actorUserId: caller.userId,
    orgId: existing.payee_org_id,
    action: AUDIT_ACTIONS.commissionPayoutMarkPaid,
    metadata: {
      payoutId,
      txRef: validated.parsed.txRef,
      note: validated.parsed.note,
      payer: existing.payer,
      fromStatus: existing.payout_status,
    },
  });
  sendJson(res, 200, toCommissionPayout(row));
}

/**
 * POST /v1/commission-payouts/generate
 * Month-end: create issued invoices for all top-level agents.
 */
export async function handleGenerateCommissionInvoices(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  if (!canIssueServiceBill(caller)) {
    sendError(res, 403, "forbidden", "Not allowed to generate commission invoices");
    return;
  }

  let body = {};
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const periodKey =
    typeof body?.periodKey === "string" && body.periodKey.trim()
      ? body.periodKey.trim()
      : defaultCommissionPeriodKey();
  const validated = validatePeriodKey(periodKey);
  if (!validated.ok) {
    sendError(res, validated.status, validated.code, validated.message);
    return;
  }

  const result = await generateMonthlyCommissionInvoices(periodKey);
  const platform = await findPlatformOrg();
  await insertAuditEvent({
    actorUserId: caller.userId,
    orgId: platform?.id ?? null,
    action: AUDIT_ACTIONS.commissionPayoutGenerate,
    metadata: {
      periodKey: result.periodKey,
      created: result.created.length,
      skipped: result.skipped.length,
    },
  });
  sendJson(res, 200, {
    periodKey: result.periodKey,
    periodLabel: result.periodLabel,
    created: result.created.map(toCommissionPayout),
    skipped: result.skipped,
  });
}

/**
 * POST /v1/commission-payouts/generate-sub
 * After the caller received this period, issue invoices to direct sub-agents.
 */
export async function handleGenerateSubAgentCommissionInvoices(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  let body = {};
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const payerOrgId =
    typeof body?.payerOrgId === "string" && body.payerOrgId.trim()
      ? body.payerOrgId.trim()
      : (caller.memberships.find(
          (m) =>
            (m.orgType === "agent" || m.orgType === "agent_sub") &&
            canManageAgentCommissionPayout(caller, m.orgId),
        )?.orgId ?? "");

  if (!canManageAgentCommissionPayout(caller, payerOrgId)) {
    sendError(
      res,
      403,
      "forbidden",
      "Not allowed to issue sub-agent commission invoices",
    );
    return;
  }

  const periodKey =
    typeof body?.periodKey === "string" && body.periodKey.trim()
      ? body.periodKey.trim()
      : defaultCommissionPeriodKey();
  const validated = validatePeriodKey(periodKey);
  if (!validated.ok) {
    sendError(res, validated.status, validated.code, validated.message);
    return;
  }

  const result = await generateSubAgentCommissionInvoices(
    payerOrgId,
    periodKey,
  );
  if (!result.ok) {
    sendError(res, result.status, result.code, result.message);
    return;
  }

  await insertAuditEvent({
    actorUserId: caller.userId,
    orgId: payerOrgId,
    action: AUDIT_ACTIONS.commissionPayoutGenerate,
    metadata: {
      periodKey: result.periodKey,
      payer: "agent",
      created: result.created.length,
      skipped: result.skipped.length,
    },
  });
  sendJson(res, 200, {
    periodKey: result.periodKey,
    periodLabel: result.periodLabel,
    created: result.created.map(toCommissionPayout),
    skipped: result.skipped,
  });
}

/**
 * POST /v1/commission-payouts/{id}/agent-confirm
 * Agent acknowledges remittance → settled (Payout history).
 */
export async function handleAgentConfirmCommissionPayout(req, res, payoutId) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  const existing = await findCommissionPayoutById(payoutId);
  if (!existing) {
    sendError(res, 404, "not_found", "Payout not found");
    return;
  }
  if (existing.payer !== "platform" && existing.payer !== "agent") {
    sendError(res, 400, "invalid_request", "Only commission invoices use payee confirm");
    return;
  }

  const role = caller.memberships.find(
    (m) => m.orgId === existing.payee_org_id,
  )?.role;
  if (!role || !["owner", "administrator"].includes(role)) {
    sendError(res, 403, "forbidden", "Only agent Owner/Admin may confirm this invoice");
    return;
  }

  if (existing.payout_status === "settled") {
    sendError(res, 409, "already_settled", "Invoice is already settled");
    return;
  }
  if (existing.payout_status !== "paid") {
    sendError(
      res,
      409,
      "invalid_state",
      "Confirm after the remittance is marked paid",
    );
    return;
  }

  const row = await markCommissionPayoutSettledRow({
    id: payoutId,
    userId: caller.userId,
  });
  if (!row) {
    sendError(res, 409, "invalid_state", "Invoice cannot be settled");
    return;
  }
  await insertAuditEvent({
    actorUserId: caller.userId,
    orgId: existing.payee_org_id,
    action: AUDIT_ACTIONS.commissionPayoutAgentConfirm,
    metadata: { payoutId, periodKey: existing.period_key },
  });
  sendJson(res, 200, toCommissionPayout(row));
}
