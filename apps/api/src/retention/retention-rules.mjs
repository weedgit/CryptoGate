import { DEFAULT_ORDER_DELETE_DAYS } from "@paymentgate/domain";

export const MIN_ORDER_DELETE_DAYS = 7;
/**
 * Completed orders stay at least this long after confirmation, whatever orderDeleteDays says:
 * monthly service bills sum them, and a short retention must not delete billable volume
 * before the bill is drawn (H10). Covers a full month plus generation slack.
 */
export const BILLABLE_ORDER_HOLD_DAYS = 62;
export const MAX_ORDER_DELETE_DAYS = 3650;

/**
 * @param {unknown} body
 */
export function validateRetentionBody(body) {
  const days = Number(body?.orderDeleteDays);
  if (!Number.isInteger(days) || days < MIN_ORDER_DELETE_DAYS || days > MAX_ORDER_DELETE_DAYS) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "orderDeleteDays must be an integer from 7 to 3650",
    };
  }
  return { ok: true, parsed: { orderDeleteDays: days } };
}

/**
 * @param {{ org_id: string, order_delete_days: number } | null} row
 * @param {string} requestedOrgId
 * @param {{ source?: string, parentOrgId?: string | null, orgId?: string }} lookup
 */
export function toRetentionSettings(row, requestedOrgId, lookup = {}) {
  return {
    orgId: requestedOrgId,
    orderDeleteDays: row?.order_delete_days ?? DEFAULT_ORDER_DELETE_DAYS,
    source: lookup.source ?? "merchant",
    parentOrgId: lookup.parentOrgId ?? null,
    effectiveOrgId: lookup.orgId ?? requestedOrgId,
  };
}
