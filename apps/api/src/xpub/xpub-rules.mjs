import { getAssetNetworkConfig } from "@paymentgate/domain";
import { isWatchOnlyXpub, looksLikeSpendKey } from "../security/spend-material.mjs";
import { settlementCooldownMs } from "../settlement/settlement-rules.mjs";

const MERCHANT_TYPES = new Set(["merchant", "merchant_site"]);

/**
 * @param {string} orgType
 */
export function xpubAllowedOnOrgType(orgType) {
  return MERCHANT_TYPES.has(orgType);
}

export { settlementCooldownMs as xpubCooldownMs };

/**
 * @param {unknown} body
 * @returns {{ ok: true, parsed: { asset: string, network: string, xPub: string, mfaCode: string } } | { ok: false, status: number, code: string, message: string }}
 */
export function validateXpubBody(body) {
  const asset = typeof body?.asset === "string" ? body.asset.trim() : "";
  const network = typeof body?.network === "string" ? body.network.trim() : "";
  const xPub = typeof body?.xPub === "string" ? body.xPub.trim() : "";
  const mfaCode = typeof body?.mfaCode === "string" ? body.mfaCode.trim() : "";

  if (!asset || !network || !xPub) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "asset, network, and xPub are required",
    };
  }
  if (/\s/.test(xPub)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_xpub",
      message: "xPub must not contain whitespace",
    };
  }
  if (xPub.length < 20) {
    return {
      ok: false,
      status: 400,
      code: "invalid_xpub",
      message: "xPub is too short",
    };
  }
  if (looksLikeSpendKey(xPub) || !isWatchOnlyXpub(xPub)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_xpub",
      message: "Watch-only xPub required — private keys and mnemonics are rejected",
    };
  }
  if (mfaCode.length < 6 || mfaCode.length > 8) {
    return {
      ok: false,
      status: 400,
      code: "mfa_required",
      message: "mfaCode is required to change xPub",
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

  return { ok: true, parsed: { asset, network, xPub, mfaCode } };
}

/**
 * Public shape — presence only, never the full xPub string.
 * @param {{
 *   org_id: string,
 *   asset: string,
 *   network: string,
 *   xpub: string,
 *   pending_xpub?: string | null,
 *   pending_activates_at?: Date | string | null,
 * }} row
 */
export function toXpubSettings(row) {
  const pending = Boolean(row.pending_xpub);
  return {
    orgId: row.org_id,
    asset: row.asset,
    network: row.network,
    xPubConfigured: Boolean(row.xpub),
    pendingXPub: pending,
    pendingActivatesAt: row.pending_activates_at
      ? new Date(row.pending_activates_at).toISOString()
      : null,
    status: pending ? "pending_cool_down" : "active",
  };
}
