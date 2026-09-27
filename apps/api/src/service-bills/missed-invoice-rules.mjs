const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export const MISSED_INVOICE_MAX_RANGE_DAYS = 92;

/** @param {unknown} v */
function isYmd(v) {
  if (typeof v !== "string" || !YMD_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/**
 * GET /v1/service-bills/missed?from=&to= — UTC dates, to ≤ today, ≤ 92 days.
 * @param {string | null} from
 * @param {string | null} to
 * @param {string} today YYYY-MM-DD
 */
export function validateMissedInvoiceRange(from, to, today) {
  if (!isYmd(from) || !isYmd(to)) {
    return {
      ok: false,
      status: 422,
      code: "validation_error",
      message: "from and to must be YYYY-MM-DD dates",
    };
  }
  if (to > today) {
    return {
      ok: false,
      status: 422,
      code: "validation_error",
      message: "End date cannot be after today; later invoices are created automatically",
    };
  }
  if (from > to) {
    return {
      ok: false,
      status: 422,
      code: "validation_error",
      message: "Start date must be on or before end date",
    };
  }
  const days =
    (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) /
    86_400_000;
  if (days > MISSED_INVOICE_MAX_RANGE_DAYS) {
    return {
      ok: false,
      status: 422,
      code: "validation_error",
      message: `Search at most ${MISSED_INVOICE_MAX_RANGE_DAYS} days at a time`,
    };
  }
  return { ok: true, from, to };
}

/**
 * POST /v1/service-bills/missed body: { orgId, periodStart }.
 * @param {unknown} body
 */
export function validateCreateMissedInvoiceBody(body) {
  const b = body && typeof body === "object" ? /** @type {Record<string, unknown>} */ (body) : {};
  const orgId = typeof b.orgId === "string" ? b.orgId.trim() : "";
  const periodStart = typeof b.periodStart === "string" ? b.periodStart.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orgId)) {
    return { ok: false, status: 422, code: "validation_error", message: "orgId is required" };
  }
  if (!isYmd(periodStart)) {
    return {
      ok: false,
      status: 422,
      code: "validation_error",
      message: "periodStart must be a YYYY-MM-DD date",
    };
  }
  return { ok: true, orgId, periodStart };
}

/** @type {Record<string, string>} */
const BLOCKER_MESSAGES = {
  paused: "Merchant is suspended",
  no_commercial: "Merchant has no commercial settings",
  earlier_first: "Create the earlier missed invoice for this merchant first",
};

/** @param {string} blocker */
export function missedInvoiceBlockerMessage(blocker) {
  return BLOCKER_MESSAGES[blocker] ?? "This invoice cannot be created yet";
}
