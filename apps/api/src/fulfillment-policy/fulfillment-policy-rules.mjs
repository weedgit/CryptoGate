import { FulfillmentPolicy } from "@paymentgate/domain";

const MERCHANT_TYPES = new Set(["merchant", "merchant_site"]);
const ALLOWED = new Set(Object.values(FulfillmentPolicy));

/** Phase 1 default — fulfill only after chain Completed. */
export const DEFAULT_FULFILLMENT_POLICY = FulfillmentPolicy.OnCompleted;

/**
 * @param {string} orgType
 */
export function fulfillmentPolicyAllowedOnOrgType(orgType) {
  return MERCHANT_TYPES.has(orgType);
}

/**
 * @param {unknown} body
 */
export function validateFulfillmentPolicyBody(body) {
  const fulfillmentPolicy =
    typeof body?.fulfillmentPolicy === "string"
      ? body.fulfillmentPolicy.trim()
      : "";
  if (!fulfillmentPolicy) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "fulfillmentPolicy is required",
    };
  }
  if (!ALLOWED.has(fulfillmentPolicy)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_fulfillment_policy",
      message: "fulfillmentPolicy must be on_completed or on_verifying",
    };
  }
  return { ok: true, parsed: { fulfillmentPolicy } };
}

/**
 * @param {{ org_id: string, fulfillment_policy: string } | null} row
 * @param {string} orgId
 * @param {{ source?: string, parentOrgId?: string | null, orgId?: string }} [lookup]
 */
export function toFulfillmentPolicySettings(row, orgId, lookup = {}) {
  return {
    orgId,
    fulfillmentPolicy: row?.fulfillment_policy ?? DEFAULT_FULFILLMENT_POLICY,
    source: lookup.source ?? "merchant",
    parentOrgId: lookup.parentOrgId ?? null,
    effectiveOrgId: lookup.orgId ?? orgId,
  };
}
