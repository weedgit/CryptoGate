import { BillingCurrency, ServiceBillStatus, ServiceBillUpdateAction } from "@cryptogate/domain";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const AMOUNT_RE = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
const SIGNED_AMOUNT_RE = /^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

/**
 * Add two non-negative USD decimal strings without float.
 * @param {string} a
 * @param {string} b
 */
export function addUsdAmounts(a, b) {
  return applyUsdAdjustment(a, b);
}

/**
 * Apply signed USD delta to base amount without float.
 * @param {string} base
 * @param {string} delta
 */
export function applyUsdAdjustment(base, delta) {
  const toCents = (s) => {
    const neg = s.startsWith("-");
    const abs = neg ? s.slice(1) : s;
    if (!AMOUNT_RE.test(abs)) {
      throw new Error("invalid amount");
    }
    const [whole, frac = ""] = abs.split(".");
    const cents = BigInt(whole) * 100n + BigInt((frac + "00").slice(0, 2));
    return neg ? -cents : cents;
  };
  const toUsd = (cents) => {
    const neg = cents < 0n;
    const abs = neg ? -cents : cents;
    const whole = abs / 100n;
    const frac = (abs % 100n).toString().padStart(2, "0");
    return `${neg ? "-" : ""}${whole}.${frac}`;
  };
  const result = toCents(base) + toCents(delta);
  if (result < 0n) {
    throw new Error("negative total");
  }
  return toUsd(result);
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

  const TIER_OK = new Set(["small", "mid", "enterprise"]);
  const tierRaw = typeof body.tier === "string" ? body.tier.trim() : "";
  const tier = tierRaw && TIER_OK.has(tierRaw) ? tierRaw : null;
  if (tierRaw && !tier) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "tier must be small, mid, or enterprise",
    };
  }
  const volumeFeePercent =
    typeof body.volumeFeePercent === "string" ? body.volumeFeePercent.trim() : "";
  const billedVolumeUsd =
    typeof body.billedVolumeUsd === "string" ? body.billedVolumeUsd.trim() : "";
  if (volumeFeePercent && !/^\d+(\.\d{1,4})?$/.test(volumeFeePercent)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "volumeFeePercent must be a decimal percent string",
    };
  }
  if (billedVolumeUsd && !isUsdAmount(billedVolumeUsd)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "billedVolumeUsd must be a USD decimal string",
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
    tier,
    volumeFeePercent: volumeFeePercent || null,
    billedVolumeUsd: billedVolumeUsd || null,
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
  /** @type {Record<string, unknown>} */
  const bill = {
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
  if (row.paid_at) {
    bill.paidAt =
      row.paid_at instanceof Date ? row.paid_at.toISOString() : String(row.paid_at);
  }
  if (row.voided_at) {
    bill.voidedAt =
      row.voided_at instanceof Date ? row.voided_at.toISOString() : String(row.voided_at);
  }
  if (row.last_adjustment_reason) {
    bill.lastAdjustmentReason = row.last_adjustment_reason;
  }
  if (row.last_adjustment_amount != null && row.last_adjustment_amount !== "") {
    bill.lastAdjustmentAmount = String(row.last_adjustment_amount);
  }
  if (row.payment_reference) {
    bill.paymentReference = row.payment_reference;
  }
  if (row.created_at) {
    bill.createdAt =
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at);
  }
  if (row.tier) {
    bill.tier = row.tier;
  }
  if (row.volume_fee_percent != null && row.volume_fee_percent !== "") {
    bill.volumeFeePercent = String(row.volume_fee_percent);
  }
  if (row.billed_volume_usd != null && row.billed_volume_usd !== "") {
    bill.billedVolumeUsd = String(row.billed_volume_usd);
  }
  return bill;
}

/**
 * @param {unknown} body
 * @param {string} currentStatus
 */
export function validateUpdateServiceBillBody(body, currentStatus) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, status: 400, code: "invalid_request", message: "Invalid body" };
  }
  const action = typeof body.action === "string" ? body.action : "";
  if (!Object.values(ServiceBillUpdateAction).includes(action)) {
    return { ok: false, status: 400, code: "invalid_request", message: "Invalid action" };
  }

  if (action === ServiceBillUpdateAction.MarkPaid) {
    if (
      currentStatus !== ServiceBillStatus.Issued &&
      currentStatus !== ServiceBillStatus.Overdue
    ) {
      return invalidTransition();
    }
    const paymentReference =
      typeof body.paymentReference === "string" ? body.paymentReference.trim() : "";
    if (paymentReference.length > 256) {
      return {
        ok: false,
        status: 400,
        code: "invalid_request",
        message: "paymentReference too long",
      };
    }
    return {
      ok: true,
      action,
      paymentReference: paymentReference || null,
    };
  }

  if (action === ServiceBillUpdateAction.Void) {
    if (currentStatus !== ServiceBillStatus.Issued) {
      return invalidTransition();
    }
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!reason || reason.length > 500) {
      return {
        ok: false,
        status: 400,
        code: "invalid_request",
        message: "reason is required (max 500 chars)",
      };
    }
    return { ok: true, action, reason };
  }

  if (action === ServiceBillUpdateAction.Adjust) {
    if (
      currentStatus !== ServiceBillStatus.Issued &&
      currentStatus !== ServiceBillStatus.Overdue
    ) {
      return invalidTransition();
    }
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const adjustmentAmount =
      typeof body.adjustmentAmount === "string" ? body.adjustmentAmount.trim() : "";
    if (!reason || reason.length > 500) {
      return {
        ok: false,
        status: 400,
        code: "invalid_request",
        message: "reason is required (max 500 chars)",
      };
    }
    if (!SIGNED_AMOUNT_RE.test(adjustmentAmount) || adjustmentAmount === "-0" || adjustmentAmount === "-0.00") {
      return {
        ok: false,
        status: 400,
        code: "invalid_request",
        message: "adjustmentAmount must be a signed USD decimal string",
      };
    }
    return { ok: true, action, reason, adjustmentAmount };
  }

  return { ok: false, status: 400, code: "invalid_request", message: "Invalid action" };
}

function invalidTransition() {
  return {
    ok: false,
    status: 422,
    code: "invalid_transition",
    message: "Service bill cannot transition in its current status",
  };
}

/**
 * Checkout payload — not PaymentDetails / guest pay page.
 * @param {object} billRow
 * @param {{ payTo?: string }} [opts]
 */
export function serviceBillQrPayload(payTo, totalAmount) {
  if (typeof payTo !== "string" || !payTo.startsWith("T") || payTo.length < 30) {
    return null;
  }
  const q = new URLSearchParams({
    amount: totalAmount,
    asset: "USDT",
    network: "tron",
  });
  return `tron:${payTo}?${q.toString()}`;
}

/**
 * Issued and overdue bills may open checkout; paid/voided may not.
 * @param {string} status
 */
export function checkoutAllowedForBillStatus(status) {
  return (
    status === ServiceBillStatus.Issued || status === ServiceBillStatus.Overdue
  );
}

/**
 * Checkout payload — not PaymentDetails / guest pay page.
 * @param {object} billRow
 * @param {{ payTo?: string }} [opts]
 */
export function toServiceBillCheckout(billRow, opts = {}) {
  const payTo =
    opts.payTo ??
    process.env.PLATFORM_BILLING_PAY_TO?.trim() ??
    "Configure PLATFORM_BILLING_PAY_TO";
  const totalAmount = billRow.total_amount;
  const currency = billRow.currency ?? BillingCurrency.USD;
  return {
    billId: billRow.id,
    totalAmount,
    currency,
    payTo,
    qrPayload: serviceBillQrPayload(payTo, totalAmount),
    instructions:
      `Pay platform service bill ${billRow.id} for ${totalAmount} ${currency} to ${payTo}. ` +
      "This is not a merchant payment order and must not use the guest payment page.",
  };
}
