import { BillingCurrency, ServiceBillStatus } from "@cryptogate/domain";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const AMOUNT_RE = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

/**
 * Add two non-negative USD decimal strings without float.
 * @param {string} a
 * @param {string} b
 */
export function addUsdAmounts(a, b) {
  const toCents = (s) => {
    const [whole, frac = ""] = s.split(".");
    return BigInt(whole) * 100n + BigInt((frac + "00").slice(0, 2));
  };
  const cents = toCents(a) + toCents(b);
  const whole = cents / 100n;
  const frac = (cents % 100n).toString().padStart(2, "0");
  return `${whole}.${frac}`;
}

/**
 * @param {string} amount
 */
export function isUsdAmount(amount) {
  return typeof amount === "string" && AMOUNT_RE.test(amount);
}

/**
 * @param {unknown} body
 */
export function validateIssueServiceBillBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, status: 400, code: "invalid_request", message: "Invalid body" };
  }
  const orgId = typeof body.orgId === "string" ? body.orgId.trim() : "";
  const periodStart =
    typeof body.periodStart === "string" ? body.periodStart.trim() : "";
  const periodEnd = typeof body.periodEnd === "string" ? body.periodEnd.trim() : "";
  const subscriptionAmount =
    typeof body.subscriptionAmount === "string" ? body.subscriptionAmount.trim() : "";
  const volumeFeeAmount =
    typeof body.volumeFeeAmount === "string" ? body.volumeFeeAmount.trim() : "";
  const dueAt = typeof body.dueAt === "string" ? body.dueAt.trim() : "";

  if (!orgId) {
    return { ok: false, status: 400, code: "invalid_request", message: "orgId is required" };
  }
  if (!DATE_RE.test(periodStart) || !DATE_RE.test(periodEnd)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "periodStart and periodEnd must be YYYY-MM-DD",
    };
  }
  if (periodEnd < periodStart) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "periodEnd must be on or after periodStart",
    };
  }
  if (!isUsdAmount(subscriptionAmount) || !isUsdAmount(volumeFeeAmount)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Amounts must be USD decimal strings (max 2 fractional digits)",
    };
  }
  const due = Date.parse(dueAt);
  if (!Number.isFinite(due)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "dueAt must be an ISO date-time",
    };
  }

  return {
    ok: true,
    orgId,
    periodStart,
    periodEnd,
    subscriptionAmount,
    volumeFeeAmount,
    totalAmount: addUsdAmounts(subscriptionAmount, volumeFeeAmount),
    dueAt: new Date(due).toISOString(),
  };
}

/**
 * @param {string | null} status
 */
export function parseServiceBillStatusFilter(status) {
  if (status == null || status === "") return { ok: true, status: null };
  const allowed = Object.values(ServiceBillStatus);
  if (!allowed.includes(status)) {
    return { ok: false, status: 400, code: "invalid_request", message: "Invalid status" };
  }
  return { ok: true, status };
}

/**
 * @param {object} row
 */
export function toServiceBill(row) {
  const periodStart =
    row.period_start instanceof Date
      ? row.period_start.toISOString().slice(0, 10)
      : String(row.period_start).slice(0, 10);
  const periodEnd =
    row.period_end instanceof Date
      ? row.period_end.toISOString().slice(0, 10)
      : String(row.period_end).slice(0, 10);
  return {
    id: row.id,
    orgId: row.org_id,
    periodStart,
    periodEnd,
    subscriptionAmount: row.subscription_amount,
    volumeFeeAmount: row.volume_fee_amount,
    totalAmount: row.total_amount,
    currency: row.currency ?? BillingCurrency.USD,
    status: row.status,
    dueAt:
      row.due_at instanceof Date ? row.due_at.toISOString() : String(row.due_at),
  };
}

/**
 * Checkout payload — not PaymentDetails / guest pay page.
 * @param {object} billRow
 * @param {{ payTo?: string }} [opts]
 */
export function toServiceBillCheckout(billRow, opts = {}) {
  const payTo =
    opts.payTo ??
    process.env.PLATFORM_BILLING_PAY_TO ??
    "Configure PLATFORM_BILLING_PAY_TO";
  const totalAmount = billRow.total_amount;
  const currency = billRow.currency ?? BillingCurrency.USD;
  return {
    billId: billRow.id,
    totalAmount,
    currency,
    payTo,
    qrPayload: null,
    instructions:
      `Pay platform service bill ${billRow.id} for ${totalAmount} ${currency} to ${payTo}. ` +
      "This is not a merchant payment order and must not use the guest payment page.",
  };
}
