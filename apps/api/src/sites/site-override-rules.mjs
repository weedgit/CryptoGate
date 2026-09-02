import { FulfillmentPolicy, MatchingMode } from "@paymentgate/domain";
import { validateMatchingSettings } from "@paymentgate/matching";

/** No site-level overrides — wallet and ops settings always inherit. */
export const SITE_OVERRIDE_KINDS = [];

/** Sites always use the parent merchant wallet — these cannot be overridden. */
export const SITE_WALLET_KINDS = ["settlement", "xpub"];

const KIND_SET = new Set(SITE_OVERRIDE_KINDS);
const WALLET_KIND_SET = new Set(SITE_WALLET_KINDS);
const MODE_SET = new Set(Object.values(MatchingMode));
const FULFILLMENT_SET = new Set(Object.values(FulfillmentPolicy));

/**
 * @param {{ type?: string, parent_id?: string | null, parentId?: string | null }} org
 */
export function parentIdOf(org) {
  return org.parent_id ?? org.parentId ?? null;
}

export function isSiteWalletKind(kind) {
  return typeof kind === "string" && WALLET_KIND_SET.has(kind);
}

/**
 * @param {unknown} kind
 */
export function isSiteOverrideKind(kind) {
  return typeof kind === "string" && KIND_SET.has(kind);
}

/**
 * @param {unknown} body
 */
export function validateOverrideRequestBody(body) {
  const settingKind =
    typeof body?.settingKind === "string" ? body.settingKind.trim() : "";
  if (!isSiteOverrideKind(settingKind)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "Merchant (site) inherits parent settings; overrides are not available",
    };
  }
  const payload = body?.payload && typeof body.payload === "object" ? body.payload : {};
  const parsedPayload = validateOverridePayload(settingKind, payload);
  if (!parsedPayload.ok) return parsedPayload;
  return {
    ok: true,
    parsed: { settingKind, payload: parsedPayload.parsed },
  };
}

/**
 * @param {string} kind
 * @param {unknown} payload
 */
export function validateOverridePayload(kind, payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "payload is required",
    };
  }

  if (kind === "matching_mode") {
    const matchingMode =
      typeof payload.matchingMode === "string" ? payload.matchingMode.trim() : "";
    if (!MODE_SET.has(matchingMode)) {
      return {
        ok: false,
        status: 400,
        code: "invalid_matching_mode",
        message: "payload.matchingMode must be one of B, C, D, S",
      };
    }
    const policy = validateMatchingSettings({ mode: matchingMode });
    if (!policy.ok) {
      return {
        ok: false,
        status: 400,
        code: policy.code,
        message: policy.message,
      };
    }
    return { ok: true, parsed: { matchingMode } };
  }

  if (kind === "fulfillment_policy") {
    const fulfillmentPolicy =
      typeof payload.fulfillmentPolicy === "string"
        ? payload.fulfillmentPolicy.trim()
        : "";
    if (!FULFILLMENT_SET.has(fulfillmentPolicy)) {
      return {
        ok: false,
        status: 400,
        code: "invalid_fulfillment_policy",
        message: "payload.fulfillmentPolicy must be on_completed or on_verifying",
      };
    }
    return { ok: true, parsed: { fulfillmentPolicy } };
  }

  if (kind === "order_retention") {
    const days = Number(payload.orderDeleteDays);
    if (!Number.isInteger(days) || days < 7 || days > 3650) {
      return {
        ok: false,
        status: 400,
        code: "invalid_request",
        message: "payload.orderDeleteDays must be an integer from 7 to 3650",
      };
    }
    return { ok: true, parsed: { orderDeleteDays: days } };
  }

  return {
    ok: false,
    status: 400,
    code: "invalid_request",
    message: "Unknown settingKind",
  };
}

/**
 * @param {unknown} body
 */
export function validateOverrideDecideBody(body, _settingKind) {
  const decision = body?.decision;
  if (decision !== "approve" && decision !== "deny") {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "decision must be approve or deny",
    };
  }
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (decision === "deny" && !reason) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "reason is required when denying",
    };
  }
  return {
    ok: true,
    parsed: { decision, reason: reason || null, mfaCode: null },
  };
}

/**
 * Public override row — never echo full xPub.
 * @param {object} row
 */
export function toSiteSettingOverride(row) {
  const payload = redactPayload(row.setting_kind, row.payload);
  return {
    id: row.id,
    siteOrgId: row.site_org_id,
    parentOrgId: row.parent_org_id,
    settingKind: row.setting_kind,
    status: row.status,
    payload,
    requestedBy: row.requested_by,
    decidedBy: row.decided_by ?? null,
    decidedAt: row.decided_at ? new Date(row.decided_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/**
 * @param {string} kind
 * @param {unknown} payload
 */
function redactPayload(kind, payload) {
  if (!payload || typeof payload !== "object") return {};
  if (kind === "xpub") {
    return {
      asset: payload.asset ?? null,
      network: payload.network ?? null,
      xPubConfigured: Boolean(payload.xPub),
    };
  }
  return payload;
}
