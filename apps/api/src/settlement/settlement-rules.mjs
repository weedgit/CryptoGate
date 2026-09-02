import { getAssetNetworkConfig } from "@paymentgate/domain";

const MERCHANT_TYPES = new Set(["merchant", "merchant_site"]);

/** Default 24h — covers late-payment window; override with SETTLEMENT_COOLDOWN_MS. */
export const DEFAULT_SETTLEMENT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * @param {string} orgType
 */
export function settlementAllowedOnOrgType(orgType) {
  return MERCHANT_TYPES.has(orgType);
}

/**
 * @returns {number}
 */
export function settlementCooldownMs() {
  const raw = Number(process.env.SETTLEMENT_COOLDOWN_MS);
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return DEFAULT_SETTLEMENT_COOLDOWN_MS;
}

/**
 * @param {unknown} body
 * @returns {{ ok: true, parsed: { asset: string, network: string, address: string, mfaCode: string } } | { ok: false, status: number, code: string, message: string }}
 */
export function validateSettlementBody(body) {
  const asset = typeof body?.asset === "string" ? body.asset.trim() : "";
  const network = typeof body?.network === "string" ? body.network.trim() : "";
  const address = typeof body?.address === "string" ? body.address.trim() : "";
  const mfaCode = typeof body?.mfaCode === "string" ? body.mfaCode.trim() : "";

  if (!asset || !network || !address) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "asset, network, and address are required",
    };
  }
  if (/\s/.test(address)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_address",
      message: "Address must not contain whitespace",
    };
  }
  if (mfaCode.length < 6 || mfaCode.length > 8) {
    return {
      ok: false,
      status: 400,
      code: "mfa_required",
      message: "mfaCode is required to change settlement address",
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

  return { ok: true, parsed: { asset, network, address, mfaCode } };
}

/**
 * @param {{
 *   org_id: string,
 *   asset: string,
 *   network: string,
 *   address: string,
 *   pending_address?: string | null,
 *   pending_activates_at?: Date | string | null,
 * }} row
 */
export function toSettlementAddress(row) {
  const pendingAddress = row.pending_address ?? null;
  const pendingActivatesAt = row.pending_activates_at
    ? new Date(row.pending_activates_at).toISOString()
    : null;
  return {
    orgId: row.org_id,
    asset: row.asset,
    network: row.network,
    address: row.address,
    pendingAddress,
    pendingActivatesAt,
    status: pendingAddress ? "pending_cool_down" : "active",
  };
}
