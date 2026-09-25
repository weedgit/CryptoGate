import { readJsonBody, sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { AUDIT_ACTIONS } from "../audit/audit-rules.mjs";
import { insertAuditEvent } from "../audit/audit-store.mjs";
import { emitDashboardLive } from "../events/dashboard-events-hub.mjs";
import { findPlatformOrg } from "../orgs/org-store.mjs";
import {
  canIssueServiceBill,
  canReadAllCommissionPayouts,
  canReadCommissionPayouts,
} from "../orgs/role-policy.mjs";
import {
  defaultCommissionPeriodKey,
  generateMonthlyCommissionInvoices,
  validatePeriodKey,
} from "./commission-invoice-generate.mjs";
import {
  toCommissionPayout,
  scopedCommissionPayoutListFilter,
  validateMarkPaidBody,
} from "./commission-payout-rules.mjs";
import {
  findCommissionPayoutById,
  listCommissionPayoutRows,
  markCommissionPayoutPaidRow,
  markCommissionPayoutSettledRow,
} from "./commission-payout-store.mjs";

/**
 * GET /v1/commission-payouts
 * Query: payer, payeeOrgId, payerOrgId, status (comma list), limit, offset
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
  const statusRaw = url.searchParams.get("status") || undefined;
  const limitRaw = url.searchParams.get("limit");
  const offsetRaw = url.searchParams.get("offset");

  if (payer && payer !== "platform") {
    sendError(res, 400, "invalid_request", "payer must be platform");
    return;
  }

  if (statusRaw) {
    const parts = statusRaw.split(",").map((s) => s.trim()).filter(Boolean);
    const allowed = new Set(["issued", "paid", "settled"]);
    if (parts.length === 0 || parts.some((s) => !allowed.has(s))) {
      sendError(
        res,
        400,
        "invalid_request",
        "status must be issued, paid, settled (comma-separated)",
      );
      return;
    }
  }

  let limit;
  if (limitRaw != null && limitRaw !== "") {
    limit = Number(limitRaw);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      sendError(res, 400, "invalid_request", "limit must be an integer 1–500");
      return;
    }
  }

  let offset;
  if (offsetRaw != null && offsetRaw !== "") {
    offset = Number(offsetRaw);
    if (!Number.isInteger(offset) || offset < 0) {
      sendError(res, 400, "invalid_request", "offset must be an integer ≥ 0");
      return;
    }
  }

  /** @type {{ payer?: string, payeeOrgId?: string, payerOrgId?: string, status?: string, limit?: number, offset?: number }} */
  let filter = {};
  if (payer) filter.payer = payer;
  if (payeeOrgId) filter.payeeOrgId = payeeOrgId;
  if (statusRaw) filter.status = statusRaw;
  if (limit != null) filter.limit = limit;
  if (offset != null) filter.offset = offset;

  // Non-platform: platform → self invoices only.
  if (!canReadAllCommissionPayouts(caller)) {
    const agentRoots = caller.memberships
      .filter(
        (m) =>
          m.orgType === "agent" &&
          ["owner", "administrator", "viewer"].includes(m.role),
      )
      .map((m) => m.orgId);
    if (agentRoots.length === 0) {
      sendJson(res, 200, {
        items: [],
        total: 0,
        limit: limit ?? 200,
        offset: offset ?? 0,
      });
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
    filter = { ...scoped.filter, status: statusRaw, limit, offset };
  } else if (payerOrgId) {
    filter.payerOrgId = payerOrgId;
  }

  const result = await listCommissionPayoutRows(filter);
  sendJson(res, 200, {
    items: result.rows.map(toCommissionPayout),
    total: result.total,
    limit: result.limit,
    offset: result.offset,
  });
}

/**
 * GET /v1/commission-payouts/{id}
 */
export async function handleGetCommissionPayout(req, res, payoutId) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  if (!canReadCommissionPayouts(caller)) {
    sendError(res, 403, "forbidden", "Not allowed to read commission payouts");
    return;
  }

  const existing = await findCommissionPayoutById(payoutId);
  if (!existing) {
    sendError(res, 404, "not_found", "Payout not found");
    return;
  }
  if (existing.payer !== "platform") {
    sendError(res, 404, "not_found", "Payout not found");
    return;
  }

  if (!canReadAllCommissionPayouts(caller)) {
    const role = caller.memberships.find(
      (m) => m.orgId === existing.payee_org_id && m.orgType === "agent",
    )?.role;
    if (!role || !["owner", "administrator", "viewer"].includes(role)) {
      sendError(res, 404, "not_found", "Payout not found");
      return;
    }
  }

  sendJson(res, 200, toCommissionPayout(existing));
}

/**
 * POST /v1/commission-payouts/{id}/mark-paid
 * Platform only: issued → paid (awaiting agent confirm).
 */
export async function handleMarkCommissionPayoutPaid(req, res, payoutId) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  const existing = await findCommissionPayoutById(payoutId);
  if (!existing) {
    sendError(res, 404, "not_found", "Payout not found");
    return;
  }

  if (existing.payer !== "platform") {
    sendError(res, 404, "not_found", "Payout not found");
    return;
  }
  if (!canIssueServiceBill(caller)) {
    sendError(res, 403, "forbidden", "Not allowed to mark platform payouts paid");
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

  const hasTx = Boolean(validated.parsed.txRef || existing.tx_ref);
  if (!hasTx && !validated.parsed.note) {
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
  emitDashboardLive({
    type: "commission.paid",
    slices: ["commissions"],
    orgId: existing.payee_org_id,
    parentId: existing.payer_org_id ?? null,
  });
  sendJson(res, 200, toCommissionPayout(row));
}

const MARK_PAID_BATCH_MAX = 50;

/**
 * POST /v1/commission-payouts/mark-paid-batch
 * Platform only: mark many issued → paid with shared note / optional txRef.
 */
export async function handleMarkCommissionPayoutPaidBatch(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  if (!canIssueServiceBill(caller)) {
    sendError(res, 403, "forbidden", "Not allowed to mark platform payouts paid");
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const rawIds = Array.isArray(body?.ids) ? body.ids : null;
  if (!rawIds || rawIds.length === 0) {
    sendError(res, 400, "invalid_request", "ids must be a non-empty array");
    return;
  }
  if (rawIds.length > MARK_PAID_BATCH_MAX) {
    sendError(
      res,
      400,
      "invalid_request",
      `ids must contain at most ${MARK_PAID_BATCH_MAX} items`,
    );
    return;
  }

  /** @type {string[]} */
  const ids = [];
  const seen = new Set();
  for (const raw of rawIds) {
    if (typeof raw !== "string" || !raw.trim()) {
      sendError(res, 400, "invalid_request", "each id must be a non-empty string");
      return;
    }
    const id = raw.trim();
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }

  const validated = validateMarkPaidBody(body);
  if (!validated.ok) {
    sendError(res, validated.status, validated.code, validated.message);
    return;
  }
  // Match platform Confirm & pay UI: note required for batch remittance.
  if (!validated.parsed.note) {
    sendError(res, 400, "invalid_request", "note is required");
    return;
  }

  /** @type {ReturnType<typeof toCommissionPayout>[]} */
  const paid = [];
  /** @type {{ id: string, code: string, message: string }[]} */
  const failed = [];

  for (const payoutId of ids) {
    const existing = await findCommissionPayoutById(payoutId);
    if (!existing || existing.payer !== "platform") {
      failed.push({
        id: payoutId,
        code: "not_found",
        message: "Payout not found",
      });
      continue;
    }
    if (
      existing.payout_status === "paid" ||
      existing.payout_status === "settled"
    ) {
      failed.push({
        id: payoutId,
        code: "already_paid",
        message:
          existing.payout_status === "settled"
            ? "Payout is already settled"
            : "Payout is already paid (awaiting agent confirm)",
      });
      continue;
    }
    if (existing.payout_status !== "issued") {
      failed.push({
        id: payoutId,
        code: "invalid_state",
        message: `Payout status is ${existing.payout_status}`,
      });
      continue;
    }

    const row = await markCommissionPayoutPaidRow({
      id: payoutId,
      txRef: validated.parsed.txRef,
      note: validated.parsed.note,
    });
    if (!row) {
      failed.push({
        id: payoutId,
        code: "invalid_state",
        message: "Payout cannot be marked paid",
      });
      continue;
    }
    paid.push(toCommissionPayout(row));
    emitDashboardLive({
      type: "commission.paid",
      slices: ["commissions"],
      orgId: existing.payee_org_id,
      parentId: existing.payer_org_id ?? null,
    });
  }

  await insertAuditEvent({
    actorUserId: caller.userId,
    orgId: null,
    action: AUDIT_ACTIONS.commissionPayoutMarkPaidBatch,
    metadata: {
      countPaid: paid.length,
      countFailed: failed.length,
      note: validated.parsed.note,
      txRef: validated.parsed.txRef,
      ids: ids.join(","),
    },
  });

  sendJson(res, 200, { paid, failed });
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
      skippedZero: result.skipped.filter((s) => s.reason === "skipped_zero")
        .length,
    },
  });
  for (const row of result.created) {
    emitDashboardLive({
      type: "commission.issued",
      slices: ["commissions"],
      orgId: row.payee_org_id,
      parentId: row.payer_org_id ?? null,
    });
  }
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
 * Platform-payer invoices only.
 */
export async function handleAgentConfirmCommissionPayout(req, res, payoutId) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  const existing = await findCommissionPayoutById(payoutId);
  if (!existing) {
    sendError(res, 404, "not_found", "Payout not found");
    return;
  }
  if (existing.payer !== "platform") {
    sendError(res, 400, "invalid_request", "Only platform invoices use payee confirm");
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
  emitDashboardLive({
    type: "commission.settled",
    slices: ["commissions"],
    orgId: existing.payee_org_id,
    parentId: existing.payer_org_id ?? null,
  });
  sendJson(res, 200, toCommissionPayout(row));
}
