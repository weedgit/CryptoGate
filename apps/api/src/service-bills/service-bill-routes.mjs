import {
  ServiceBillKind,
  ServiceBillStatus,
  ServiceBillUpdateAction,
} from "@paymentgate/domain";
import { readJsonBody, sendError, sendJson } from "../http/json.mjs";
import { requireCaller } from "../http/require-caller.mjs";
import { findOrgById, updateOrgStatus } from "../orgs/org-store.mjs";
import { listOrgsInSubtree } from "../orgs/org-scope.mjs";
import { findMerchantCommercial } from "../commercial/merchant-commercial-store.mjs";
import {
  canCheckoutServiceBill,
  canIssueServiceBill,
  canUpdateServiceBill,
  canViewServiceBill,
  isMerchantOrgType,
  serviceBillListScope,
} from "../orgs/role-policy.mjs";
import { AUDIT_ACTIONS } from "../audit/audit-rules.mjs";
import { insertAuditEvent } from "../audit/audit-store.mjs";
import { emitDashboardLive } from "../events/dashboard-events-hub.mjs";
import {
  resolvePlatformBillingPayTo,
  resolvePlatformInvoiceSeller,
} from "../platform-settings/billing-wallet-store.mjs";
import {
  parseServiceBillStatusFilter,
  toServiceBill,
  toServiceBillCheckout,
  checkoutAllowedForBillStatus,
  validateIssueServiceBillBody,
  validateUpdateServiceBillBody,
  applyUsdAdjustment,
  addUsdAmounts,
} from "./service-bill-rules.mjs";
import { roundUsd } from "./generate-rules.mjs";
import {
  parseServiceBillListQuery,
  parseServiceBillWindow,
} from "./service-bill-list-rules.mjs";
import {
  findServiceBillById,
  insertServiceBill,
  listServiceBills,
  serviceBillSummary,
  serviceBillOrgStatus,
  markServiceBillPaid,
  waiveServiceBill,
  cancelServiceBill,
  sendServiceBill,
  adjustServiceBill,
  adjustServiceBillLines,
  setServiceBillOpsNote,
  sumCompletedPayableVolume,
} from "./service-bill-store.mjs";
import { getBillingCalendarSettings } from "../platform-settings/billing-calendar-store.mjs";
import { merchantInvoiceDueAt } from "../platform-settings/billing-calendar-rules.mjs";
import {
  setBillingAnchorFromActivationPaid,
  resetBillingAnchorAfterLatePay,
  addMerchantServiceBillCredit,
} from "../commercial/merchant-commercial-store.mjs";
import { maybeCreateActivationForMerchantOrg } from "./activation.mjs";
import { listUpcomingBills } from "./upcoming-bills.mjs";

/**
 * Waived / cancelled bill that paused the merchant: resume the org.
 * @param {object} row bill before the update
 */
async function resumeOrgPausedByBill(row) {
  const org = await findOrgById(row.org_id);
  if (org?.status === "paused" && String(org.status_reason_bill_id ?? "") === row.id) {
    await updateOrgStatus(row.org_id, "active");
  }
}

const SERVICE_BILL_LIST_MAX = 5000;

function parseServiceBillListLimit(raw) {
  if (raw == null || raw === "") return 100;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 1) return 100;
  return Math.min(n, SERVICE_BILL_LIST_MAX);
}

/**
 * @param {string | null} raw
 * @returns {{ ok: true, offset: number } | { ok: false, status: number, code: string, message: string }}
 */
function parseServiceBillListOffset(raw) {
  if (raw == null || raw === "") return { ok: true, offset: 0 };
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 0) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "offset must be an integer ≥ 0",
    };
  }
  return { ok: true, offset: n };
}

/**
 * Expand list scope to merchant org ids the caller may see.
 * @param {{ kind: "all" } | { kind: "none" } | { kind: "scoped", rootIds: string[] }} scope
 */
async function expandServiceBillOrgIds(scope) {
  if (scope.kind === "all") return { kind: "all" };
  if (scope.kind === "none") return { kind: "filter", orgIds: [] };
  const rows = await listOrgsInSubtree(scope.rootIds);
  const orgIds = rows
    .filter((r) => isMerchantOrgType(r.type))
    .map((r) => r.id);
  return { kind: "filter", orgIds };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Optional `periodFrom` + `periodTo` (YYYY-MM-DD): billing period overlaps the range.
 * @param {URL} url
 * @returns {{ ok: true, period: { from: string, to: string } | null } | { ok: false, message: string }}
 */
function parseBillingPeriodOverlap(url) {
  const from = url.searchParams.get("periodFrom")?.trim() ?? "";
  const to = url.searchParams.get("periodTo")?.trim() ?? "";
  if (!from && !to) return { ok: true, period: null };
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) {
    return { ok: false, message: "periodFrom and periodTo must be YYYY-MM-DD with periodFrom <= periodTo" };
  }
  return { ok: true, period: { from, to } };
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Optional `paidMonth` (YYYY-MM): paid monthly bills with paid_at in that UTC month.
 * @param {URL} url
 * @returns {{ ok: true, paidMonth: { startIso: string, endIso: string } | null } | { ok: false, message: string }}
 */
export function parsePaidMonth(url) {
  const raw = url.searchParams.get("paidMonth")?.trim() ?? "";
  if (!raw) return { ok: true, paidMonth: null };
  if (!MONTH_RE.test(raw)) return { ok: false, message: "paidMonth must be YYYY-MM" };
  const [y, m] = raw.split("-").map(Number);
  return {
    ok: true,
    paidMonth: {
      startIso: new Date(Date.UTC(y, m - 1, 1)).toISOString(),
      endIso: new Date(Date.UTC(y, m, 1)).toISOString(),
    },
  };
}

/**
 * Optional `agentOrgId`: narrow the caller's scope to merchants under that agent.
 * Sends the error and returns null when invalid or outside scope.
 * @param {import("node:http").ServerResponse} res
 * @param {URL} url
 * @param {{ kind: "all" } | { kind: "filter", orgIds: string[] }} expanded
 */
async function narrowToAgent(res, url, expanded) {
  const raw = url.searchParams.get("agentOrgId")?.trim();
  if (!raw) return expanded;
  if (!UUID_RE.test(raw)) {
    sendError(res, 400, "invalid_request", "agentOrgId must be a UUID");
    return null;
  }
  const rows = await listOrgsInSubtree([raw]);
  const agentMerchants = rows.filter((r) => isMerchantOrgType(r.type)).map((r) => r.id);
  if (expanded.kind === "all") return { kind: "filter", orgIds: agentMerchants };
  const allowed = new Set(expanded.orgIds);
  if (agentMerchants.length > 0 && !agentMerchants.some((id) => allowed.has(id))) {
    sendError(res, 403, "forbidden", "Outside service-bill scope");
    return null;
  }
  return { kind: "filter", orgIds: agentMerchants.filter((id) => allowed.has(id)) };
}

/**
 * GET /v1/service-bills
 * Query also accepts agentOrgId (merchants in that agent's subtree).
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {URL} url
 */
export async function handleListServiceBills(req, res, url) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  const scope = serviceBillListScope(caller);
  if (scope.kind === "none") {
    sendError(res, 403, "forbidden", "Cashiers cannot view service bills");
    return;
  }

  const statusFilter = parseServiceBillStatusFilter(url.searchParams.get("status"));
  if (!statusFilter.ok) {
    sendError(res, statusFilter.status, statusFilter.code, statusFilter.message);
    return;
  }

  const orgIdRaw = url.searchParams.get("orgId");
  const orgId = orgIdRaw && orgIdRaw.trim() ? orgIdRaw.trim() : null;

  const expanded = await narrowToAgent(res, url, await expandServiceBillOrgIds(scope));
  if (!expanded) return;
  if (orgId) {
    if (expanded.kind === "filter" && !expanded.orgIds.includes(orgId)) {
      sendError(res, 403, "forbidden", "Outside service-bill scope");
      return;
    }
  }

  const offsetParsed = parseServiceBillListOffset(url.searchParams.get("offset"));
  if (!offsetParsed.ok) {
    sendError(res, offsetParsed.status, offsetParsed.code, offsetParsed.message);
    return;
  }

  const listQuery = parseServiceBillListQuery(url.searchParams);
  if (!listQuery.ok) {
    sendError(res, 400, "invalid_request", listQuery.message);
    return;
  }

  const period = parseBillingPeriodOverlap(url);
  if (!period.ok) {
    sendError(res, 400, "invalid_request", period.message);
    return;
  }

  const paid = parsePaidMonth(url);
  if (!paid.ok) {
    sendError(res, 400, "invalid_request", paid.message);
    return;
  }

  const limit = parseServiceBillListLimit(url.searchParams.get("limit"));
  const result = await listServiceBills({
    kind: expanded.kind === "all" ? "all" : "filter",
    orgIds: expanded.kind === "filter" ? expanded.orgIds : [],
    orgId,
    status: statusFilter.status,
    period: period.period,
    paidMonth: paid.paidMonth,
    ...listQuery.query,
    limit,
    offset: offsetParsed.offset,
  });
  sendJson(res, 200, {
    items: result.rows.map(toServiceBill),
    total: result.total,
    limit: result.limit,
    offset: result.offset,
  });
}

/**
 * GET /v1/service-bills/summary — bucket counts + USD totals (same scope and
 * date window as the list; search does not narrow KPIs).
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {URL} url
 */
export async function handleServiceBillSummary(req, res, url) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  const scope = serviceBillListScope(caller);
  if (scope.kind === "none") {
    sendError(res, 403, "forbidden", "Cashiers cannot view service bills");
    return;
  }

  const win = parseServiceBillWindow(url.searchParams);
  if (!win.ok) {
    sendError(res, 400, "invalid_request", win.message);
    return;
  }

  const orgIdRaw = url.searchParams.get("orgId");
  const orgId = orgIdRaw && orgIdRaw.trim() ? orgIdRaw.trim() : null;
  const expanded = await narrowToAgent(res, url, await expandServiceBillOrgIds(scope));
  if (!expanded) return;
  if (orgId && expanded.kind === "filter" && !expanded.orgIds.includes(orgId)) {
    sendError(res, 403, "forbidden", "Outside service-bill scope");
    return;
  }

  const period = parseBillingPeriodOverlap(url);
  if (!period.ok) {
    sendError(res, 400, "invalid_request", period.message);
    return;
  }

  const paid = parsePaidMonth(url);
  if (!paid.ok) {
    sendError(res, 400, "invalid_request", paid.message);
    return;
  }

  const summary = await serviceBillSummary({
    kind: expanded.kind === "all" ? "all" : "filter",
    orgIds: expanded.kind === "filter" ? expanded.orgIds : [],
    orgId,
    window: win.window,
    period: period.period,
    paidMonth: paid.paidMonth,
  });
  sendJson(res, 200, summary);
}

/**
 * GET /v1/service-bills/upcoming — estimated next monthly bill per activated
 * merchant (volume so far). Same scope as the list; accepts orgId / agentOrgId.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {URL} url
 */
export async function handleUpcomingServiceBills(req, res, url) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  const scope = serviceBillListScope(caller);
  if (scope.kind === "none") {
    sendError(res, 403, "forbidden", "Cashiers cannot view service bills");
    return;
  }

  const orgIdRaw = url.searchParams.get("orgId")?.trim() || null;
  if (orgIdRaw && !UUID_RE.test(orgIdRaw)) {
    sendError(res, 400, "invalid_request", "orgId must be a UUID");
    return;
  }
  const expanded = await narrowToAgent(res, url, await expandServiceBillOrgIds(scope));
  if (!expanded) return;
  if (orgIdRaw && expanded.kind === "filter" && !expanded.orgIds.includes(orgIdRaw)) {
    sendError(res, 403, "forbidden", "Outside service-bill scope");
    return;
  }

  const items = await listUpcomingBills({
    orgIds: expanded.kind === "all" ? null : expanded.orgIds,
    orgId: orgIdRaw,
  });
  sendJson(res, 200, { items });
}

/**
 * GET /v1/service-bills/org-status — per-merchant bill badge for account lists.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
export async function handleServiceBillOrgStatus(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return;
  const scope = serviceBillListScope(caller);
  if (scope.kind === "none") {
    sendError(res, 403, "forbidden", "Cashiers cannot view service bills");
    return;
  }
  const expanded = await expandServiceBillOrgIds(scope);
  const items = await serviceBillOrgStatus({
    kind: expanded.kind === "all" ? "all" : "filter",
    orgIds: expanded.kind === "filter" ? expanded.orgIds : [],
  });
  sendJson(res, 200, { items });
}

/**
 * POST /v1/service-bills — platform only.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
export async function handleIssueServiceBill(req, res) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  if (!canIssueServiceBill(caller)) {
    sendError(res, 403, "forbidden", "Only platform operators may issue service bills");
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const validated = validateIssueServiceBillBody(body);
  if (!validated.ok) {
    sendError(res, validated.status, validated.code, validated.message);
    return;
  }

  const org = await findOrgById(validated.orgId);
  if (!org || org.type !== "merchant") {
    sendError(res, 400, "invalid_org_type", "Service bills target merchant orgs only (not sites)");
    return;
  }

  let tier = validated.tier;
  let volumeFeePercent = validated.volumeFeePercent;
  let billedVolumeUsd = validated.billedVolumeUsd;

  if (!tier || !volumeFeePercent || billedVolumeUsd == null) {
    const commercial = await findMerchantCommercial(validated.orgId);
    if (commercial) {
      tier = tier ?? commercial.tier ?? null;
      volumeFeePercent =
        volumeFeePercent ??
        (commercial.volume_fee_percent != null
          ? String(commercial.volume_fee_percent)
          : null);
    }
    if (billedVolumeUsd == null) {
      const subtree = await listOrgsInSubtree([validated.orgId]);
      const volumeOrgIds = subtree
        .filter((r) => r.type === "merchant" || r.type === "merchant_site")
        .map((r) => r.id);
      const inclusiveStartIso = `${validated.periodStart}T00:00:00.000Z`;
      const end = new Date(`${validated.periodEnd}T00:00:00.000Z`);
      end.setUTCDate(end.getUTCDate() + 1);
      const exclusiveEndIso = end.toISOString();
      const volumeRaw = await sumCompletedPayableVolume(
        volumeOrgIds,
        inclusiveStartIso,
        exclusiveEndIso,
      );
      billedVolumeUsd = roundUsd(volumeRaw);
    }
  }

  const calendar = await getBillingCalendarSettings();
  // Always pay-within from issue time — ignore client dueAt (legacy field).
  const dueAt = merchantInvoiceDueAt(calendar.activationPayDays);
  const initialStatus = calendar.autoSendInvoices
    ? ServiceBillStatus.Issued
    : ServiceBillStatus.Draft;

  const row = await insertServiceBill({
    orgId: validated.orgId,
    periodStart: validated.periodStart,
    periodEnd: validated.periodEnd,
    subscriptionAmount: validated.subscriptionAmount,
    volumeFeeAmount: validated.volumeFeeAmount,
    totalAmount: validated.totalAmount,
    dueAt,
    status: initialStatus,
    tier,
    volumeFeePercent,
    billedVolumeUsd,
    billKind: ServiceBillKind.Monthly,
    sentAt: calendar.autoSendInvoices ? new Date().toISOString() : null,
  });

  await insertAuditEvent({
    actorUserId: caller.userId,
    orgId: validated.orgId,
    action: AUDIT_ACTIONS.serviceBillIssue,
    metadata: {
      billId: row.id,
      totalAmount: row.total_amount,
      tier: tier ?? null,
      volumeFeePercent: volumeFeePercent ?? null,
      billedVolumeUsd: billedVolumeUsd ?? null,
      status: row.status,
    },
  });

  emitDashboardLive({
    type:
      row.status === ServiceBillStatus.Draft
        ? "service_bill.draft"
        : "service_bill.issued",
    slices: ["serviceBills"],
    orgId: validated.orgId,
  });

  sendJson(res, 201, toServiceBill(row));
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} billId
 * @param {"view" | "checkout"} mode
 */
async function loadReadableBill(req, res, billId, mode) {
  const caller = await requireCaller(req, res);
  if (!caller) return null;

  const row = await findServiceBillById(billId);
  if (!row) {
    sendError(res, 404, "not_found", "Service bill not found");
    return null;
  }

  const org = await findOrgById(row.org_id);
  if (!org) {
    sendError(res, 404, "not_found", "Service bill not found");
    return null;
  }

  const scope = serviceBillListScope(caller);
  if (scope.kind === "none") {
    sendError(res, 403, "forbidden", "Cashiers cannot view service bills");
    return null;
  }

  /** @type {Set<string> | undefined} */
  let visible;
  if (scope.kind === "scoped") {
    const expanded = await expandServiceBillOrgIds(scope);
    visible = new Set(expanded.orgIds);
  }

  if (!canViewServiceBill(caller, org, visible)) {
    sendError(res, 403, "forbidden", "Outside service-bill scope");
    return null;
  }

  if (mode === "checkout" && !canCheckoutServiceBill(caller, org)) {
    sendError(res, 403, "forbidden", "Not allowed to open service-bill checkout");
    return null;
  }

  if (mode === "checkout" && !checkoutAllowedForBillStatus(row.status)) {
    sendError(
      res,
      422,
      "bill_not_payable",
      "Service bill cannot be paid in its current status",
    );
    return null;
  }

  return { caller, org, row };
}

/**
 * GET /v1/service-bills/{billId}
 */
export async function handleGetServiceBill(req, res, billId) {
  const loaded = await loadReadableBill(req, res, billId, "view");
  if (!loaded) return;
  const bill = toServiceBill(loaded.row);
  // Receipt / invoice remittance: snapshotted rx, else live platform fee wallet.
  const remittancePayTo =
    (typeof loaded.row.rx_address === "string" && loaded.row.rx_address.trim()) ||
    (await resolvePlatformBillingPayTo());
  if (remittancePayTo) {
    bill.remittancePayTo = remittancePayTo;
  }
  bill.invoiceSeller = await resolvePlatformInvoiceSeller();
  sendJson(res, 200, bill);
}

/**
 * GET /v1/service-bills/{billId}/checkout
 */
export async function handleGetServiceBillCheckout(req, res, billId) {
  const loaded = await loadReadableBill(req, res, billId, "checkout");
  if (!loaded) return;
  const payTo = await resolvePlatformBillingPayTo();
  sendJson(
    res,
    200,
    toServiceBillCheckout(loaded.row, payTo ? { payTo } : {}),
  );
}

/**
 * PATCH /v1/service-bills/{billId} — platform operator only (v0.3.2).
 */
export async function handleUpdateServiceBill(req, res, billId) {
  const caller = await requireCaller(req, res);
  if (!caller) return;

  if (!canUpdateServiceBill(caller)) {
    sendError(res, 403, "forbidden", "Only platform operators may update service bills");
    return;
  }

  const row = await findServiceBillById(billId);
  if (!row) {
    sendError(res, 404, "not_found", "Service bill not found");
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "invalid_json", "Request body must be JSON");
    return;
  }

  const validated = validateUpdateServiceBillBody(body, row.status);
  if (!validated.ok) {
    sendError(res, validated.status, validated.code, validated.message);
    return;
  }

  /** @type {object | null} */
  let updated = null;

  if (validated.action === ServiceBillUpdateAction.Send) {
    const calendar = await getBillingCalendarSettings();
    const dueAt = merchantInvoiceDueAt(calendar.activationPayDays);
    updated = await sendServiceBill(billId, dueAt);
    if (updated && validated.opsNote !== undefined) {
      updated = (await setServiceBillOpsNote(billId, validated.opsNote)) ?? updated;
    }
    if (updated) {
      await insertAuditEvent({
        actorUserId: caller.userId,
        orgId: row.org_id,
        action: AUDIT_ACTIONS.serviceBillSend,
        metadata: { billId, dueAt, opsNote: validated.opsNote ?? null },
      });
      emitDashboardLive({
        type: "service_bill.issued",
        slices: ["serviceBills"],
        orgId: row.org_id,
      });
    }
  } else if (validated.action === ServiceBillUpdateAction.Waive) {
    updated = await waiveServiceBill(billId, validated.reason);
    if (updated && validated.opsNote !== undefined) {
      updated = (await setServiceBillOpsNote(billId, validated.opsNote)) ?? updated;
    }
    if (updated) {
      const isActivation = row.bill_kind === ServiceBillKind.Activation;
      // Waived activation = activated today; monthly billing starts one month later.
      if (isActivation) {
        await setBillingAnchorFromActivationPaid(row.org_id, new Date());
      }
      await insertAuditEvent({
        actorUserId: caller.userId,
        orgId: row.org_id,
        action: AUDIT_ACTIONS.serviceBillWaive,
        metadata: {
          billId,
          billKind: row.bill_kind ?? ServiceBillKind.Monthly,
          reason: validated.reason,
          opsNote: validated.opsNote ?? null,
        },
      });
      await resumeOrgPausedByBill(row);
      emitDashboardLive({
        type: "service_bill.waived",
        slices: ["serviceBills"],
        orgId: row.org_id,
      });
    }
  } else if (validated.action === ServiceBillUpdateAction.Cancel) {
    updated = await cancelServiceBill(billId, validated.reason);
    if (updated && validated.opsNote !== undefined) {
      updated = (await setServiceBillOpsNote(billId, validated.opsNote)) ?? updated;
    }
    if (updated) {
      await insertAuditEvent({
        actorUserId: caller.userId,
        orgId: row.org_id,
        action: AUDIT_ACTIONS.serviceBillCancel,
        metadata: {
          billId,
          billKind: row.bill_kind ?? ServiceBillKind.Monthly,
          reason: validated.reason,
          opsNote: validated.opsNote ?? null,
        },
      });
      await resumeOrgPausedByBill(row);
      // Wrong activation bill: merchant stays unactivated; issue the corrected one.
      if (row.bill_kind === ServiceBillKind.Activation) {
        await maybeCreateActivationForMerchantOrg(row.org_id);
      }
      emitDashboardLive({
        type: "service_bill.cancelled",
        slices: ["serviceBills"],
        orgId: row.org_id,
      });
    }
  } else if (validated.action === ServiceBillUpdateAction.GrantCredit) {
    const credited = await addMerchantServiceBillCredit(
      row.org_id,
      validated.creditAmount,
    );
    if (!credited) {
      sendError(
        res,
        422,
        "commercial_missing",
        "Merchant commercial settings required to grant credit",
      );
      return;
    }
    if (validated.opsNote !== undefined) {
      updated = await setServiceBillOpsNote(billId, validated.opsNote);
    } else {
      updated = row;
    }
    await insertAuditEvent({
      actorUserId: caller.userId,
      orgId: row.org_id,
      action: AUDIT_ACTIONS.serviceBillGrantCredit,
      metadata: {
        billId,
        creditAmount: validated.creditAmount,
        reason: validated.reason,
        serviceBillCreditUsd: credited.service_bill_credit_usd,
      },
    });
    updated = updated ?? row;
  } else if (validated.action === ServiceBillUpdateAction.MarkPaid) {
    let rxAddress = validated.rxAddress;
    if (!rxAddress) {
      rxAddress = (await resolvePlatformBillingPayTo()) || null;
    }
    updated = await markServiceBillPaid(billId, {
      paymentReference: validated.paymentReference,
      rxAddress,
      txAddress: validated.txAddress,
    });
    if (updated) {
      await insertAuditEvent({
        actorUserId: caller.userId,
        orgId: row.org_id,
        action: AUDIT_ACTIONS.serviceBillMarkPaid,
        metadata: {
          billId,
          paymentReference: validated.paymentReference,
          rxAddress,
          txAddress: validated.txAddress,
        },
      });
      const org = await findOrgById(row.org_id);
      const billKind = row.bill_kind ?? ServiceBillKind.Monthly;
      const paidAt = new Date();
      if (billKind === ServiceBillKind.Activation) {
        await setBillingAnchorFromActivationPaid(row.org_id, paidAt);
      } else if (
        org?.status === "paused" &&
        (String(org.status_reason_bill_id ?? "") === billId ||
          org.status_reason === "Unpaid service bill")
      ) {
        await resetBillingAnchorAfterLatePay(row.org_id, paidAt);
      }
      if (
        org?.status === "paused" &&
        (String(org.status_reason_bill_id ?? "") === billId ||
          org.status_reason === "Unpaid service bill")
      ) {
        await updateOrgStatus(row.org_id, "active");
      }
      emitDashboardLive({
        type: "service_bill.paid",
        slices: ["serviceBills"],
        orgId: row.org_id,
      });
    }
  } else if (validated.action === ServiceBillUpdateAction.Adjust) {
    if (validated.mode === "lines") {
      const subscriptionAmount =
        validated.subscriptionAmount ?? String(row.subscription_amount);
      const volumeFeeAmount =
        validated.volumeFeeAmount ?? String(row.volume_fee_amount);
      let nextTotal;
      try {
        nextTotal = addUsdAmounts(subscriptionAmount, volumeFeeAmount);
      } catch {
        sendError(res, 400, "invalid_request", "Invalid line amounts");
        return;
      }
      updated = await adjustServiceBillLines(billId, {
        subscriptionAmount,
        volumeFeeAmount,
        totalAmount: nextTotal,
        reason: validated.reason,
        adjustmentAmount: "0.00",
        opsNote: validated.opsNote,
      });
      if (updated) {
        await insertAuditEvent({
          actorUserId: caller.userId,
          orgId: row.org_id,
          action: AUDIT_ACTIONS.serviceBillAdjust,
          metadata: {
            billId,
            mode: "lines",
            subscriptionAmount,
            volumeFeeAmount,
            totalAmount: nextTotal,
            opsNote: validated.opsNote ?? null,
          },
        });
      }
    } else {
      let nextTotal;
      try {
        nextTotal = applyUsdAdjustment(row.total_amount, validated.adjustmentAmount);
      } catch {
        sendError(res, 400, "invalid_request", "Invalid adjustmentAmount");
        return;
      }
      updated = await adjustServiceBill(
        billId,
        nextTotal,
        validated.reason,
        validated.adjustmentAmount,
      );
      if (updated && validated.opsNote !== undefined) {
        updated =
          (await setServiceBillOpsNote(billId, validated.opsNote)) ?? updated;
      }
      if (updated) {
        await insertAuditEvent({
          actorUserId: caller.userId,
          orgId: row.org_id,
          action: AUDIT_ACTIONS.serviceBillAdjust,
          metadata: {
            billId,
            mode: "total",
            adjustmentAmount: validated.adjustmentAmount,
            totalAmount: nextTotal,
            opsNote: validated.opsNote ?? null,
          },
        });
      }
    }
  }

  if (!updated) {
    sendError(
      res,
      422,
      "invalid_transition",
      "Service bill cannot transition in its current status",
    );
    return;
  }

  sendJson(res, 200, toServiceBill(updated));
}
