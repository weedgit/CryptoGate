const AMOUNT_RE = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

/**
 * @param {unknown} n
 * @param {number} min
 * @param {number} max
 */
function dayInRange(n, min, max) {
  return Number.isInteger(n) && n >= min && n <= max;
}

/**
 * End of UTC calendar day for year-month-day.
 * @param {number} year
 * @param {number} monthIndex0
 * @param {number} day
 */
export function utcEndOfDay(year, monthIndex0, day) {
  return new Date(Date.UTC(year, monthIndex0, day, 23, 59, 59, 999)).toISOString();
}

/**
 * Merchant pay-by timestamp for the calendar month that follows a billing period.
 * Previous-month bill generated in March → due on March merchant_pay_day_end.
 * @param {string} periodEnd YYYY-MM-DD (last day of billed month)
 * @param {number} merchantPayDayEnd
 * @param {Date} [now]
 */
export function merchantPayDueAtForPeriod(periodEnd, merchantPayDayEnd, now = new Date()) {
  const end = new Date(`${periodEnd}T12:00:00.000Z`);
  if (Number.isNaN(end.getTime())) {
    return defaultActivationDueAt(7, now);
  }
  // Invoice month = month after periodEnd
  const invoice = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 1));
  const day = Math.min(
    merchantPayDayEnd,
    daysInUtcMonth(invoice.getUTCFullYear(), invoice.getUTCMonth()),
  );
  return utcEndOfDay(invoice.getUTCFullYear(), invoice.getUTCMonth(), day);
}

/**
 * @param {number} year
 * @param {number} monthIndex0
 */
function daysInUtcMonth(year, monthIndex0) {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

/**
 * Merchant invoice due_at (activation + monthly): send/create time + pay-within days.
 * Same clock for daily job, Confirm & send, Create Bill, and month backfill.
 * Legacy merchantPayDayStart/End are display-only and must not drive due_at.
 * @param {number} payDays
 * @param {Date} [from]
 */
export function merchantInvoiceDueAt(payDays, from = new Date()) {
  return defaultActivationDueAt(payDays, from);
}

/**
 * @param {number} payDays
 * @param {Date} [from]
 */
export function defaultActivationDueAt(payDays, from = new Date()) {
  const d = new Date(from.getTime());
  d.setUTCDate(d.getUTCDate() + Math.max(1, payDays));
  d.setUTCHours(23, 59, 59, 999);
  return d.toISOString();
}

/**
 * @param {unknown} body
 */
export function validateUpdateBillingCalendarBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Request body must be a JSON object",
    };
  }

  const merchantPayDayStart = Number(body.merchantPayDayStart);
  const merchantPayDayEnd = Number(body.merchantPayDayEnd);
  const agentPayDayStart = Number(body.agentPayDayStart);
  const agentPayDayEnd = Number(body.agentPayDayEnd);
  const activationPayDays = Number(body.activationPayDays);
  const activationFeeUsd =
    typeof body.activationFeeUsd === "string"
      ? body.activationFeeUsd.trim()
      : "";
  const autoSendInvoices = body.autoSendInvoices;

  if (!dayInRange(merchantPayDayStart, 1, 28) || !dayInRange(merchantPayDayEnd, 1, 28)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "merchantPayDayStart/End must be integers 1–28",
    };
  }
  if (merchantPayDayEnd < merchantPayDayStart) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "merchantPayDayEnd must be on or after merchantPayDayStart",
    };
  }
  if (!dayInRange(agentPayDayStart, 1, 28) || !dayInRange(agentPayDayEnd, 1, 28)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "agentPayDayStart/End must be integers 1–28",
    };
  }
  if (agentPayDayEnd < agentPayDayStart) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "agentPayDayEnd must be on or after agentPayDayStart",
    };
  }
  if (!dayInRange(activationPayDays, 1, 90)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "activationPayDays must be an integer 1–90",
    };
  }
  if (!AMOUNT_RE.test(activationFeeUsd)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "activationFeeUsd must be a USD decimal string (max 2 fractional digits)",
    };
  }
  if (typeof autoSendInvoices !== "boolean") {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "autoSendInvoices must be a boolean",
    };
  }

  return {
    ok: true,
    merchantPayDayStart,
    merchantPayDayEnd,
    agentPayDayStart,
    agentPayDayEnd,
    activationFeeUsd,
    activationPayDays,
    autoSendInvoices,
  };
}
