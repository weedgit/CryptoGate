import { getAssetNetworkConfig, MatchingMode } from "@cryptogate/domain";

export const SITE_OVERRIDE_KINDS = [
  "settlement",
  "xpub",
  "matching_mode",
  "order_retention",
];

const KIND_SET = new Set(SITE_OVERRIDE_KINDS);
const MODE_SET = new Set(Object.values(MatchingMode));

/**
 * @param {{ type?: string, parent_id?: string | null, parentId?: string | null }} org
 */
export function parentIdOf(org) {
  return org.parent_id ?? org.parentId ?? null;
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
      message: "settingKind must be settlement, xpub, matching_mode, or order_retention",
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
    return { ok: true, parsed: { matchingMode } };
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

  const asset = typeof payload.asset === "string" ? payload.asset.trim() : "";
  const network = typeof payload.network === "string" ? payload.network.trim() : "";
  if (!asset || !network) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "payload.asset and payload.network are required",
    };
  }
  const config = getAssetNetworkConfig(asset, network);
  if (!config) {
    return {
      ok: false,
      status: 422,
      code: "asset_network_disabled",
      message: "Asset and network are not enabled",
    };
  }

  if (kind === "settlement") {
    const address = typeof payload.address === "string" ? payload.address.trim() : "";
    if (!address || /\s/.test(address)) {
      return {
        ok: false,
        status: 400,
        code: "invalid_address",
        message: "payload.address is required and must not contain whitespace",
      };
    }
    return { ok: true, parsed: { asset, network, address } };
  }

  const xPub = typeof payload.xPub === "string" ? payload.xPub.trim() : "";
  if (!xPub || /\s/.test(xPub) || xPub.length < 20) {
    return {
      ok: false,
      status: 400,
      code: "invalid_xpub",
      message: "payload.xPub is required (watch-only, min 20 chars, no whitespace)",
    };
  }
  return { ok: true, parsed: { asset, network, xPub } };
}

/**
 * @param {unknown} body
 */
export function validateOverrideDecideBody(body, settingKind) {
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
  const mfaCode = typeof body?.mfaCode === "string" ? body.mfaCode.trim() : "";
  const needsMfa =
    decision === "approve" && (settingKind === "settlement" || settingKind === "xpub");
  if (needsMfa && (mfaCode.length < 6 || mfaCode.length > 8)) {
    return {
      ok: false,
      status: 400,
      code: "mfa_required",
      message: "mfaCode is required to approve settlement or xPub overrides",
    };
  }
  return {
    ok: true,
    parsed: { decision, reason: reason || null, mfaCode: mfaCode || null },
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
