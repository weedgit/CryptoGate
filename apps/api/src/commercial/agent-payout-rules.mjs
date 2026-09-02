import {
  getAssetNetworkConfig,
  isPlatformFeePair,
  isTronReceiveAddress,
  PLATFORM_FEE_ASSET,
  resolvePlatformFeeNetwork,
} from "@paymentgate/domain";

const AGENT_TYPES = new Set(["agent", "agent_sub"]);

/** Default 24h — same bar as settlement; override with AGENT_PAYOUT_COOLDOWN_MS. */
export const DEFAULT_AGENT_PAYOUT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * @param {string} orgType
 */
export function agentPayoutAllowedOnOrgType(orgType) {
  return AGENT_TYPES.has(orgType);
}

/**
 * @returns {number}
 */
export function agentPayoutCooldownMs() {
  const raw = Number(process.env.AGENT_PAYOUT_COOLDOWN_MS);
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return DEFAULT_AGENT_PAYOUT_COOLDOWN_MS;
}

/**
 * @param {unknown} body
 * @returns {{ ok: true, parsed: { asset: string, network: string, address: string, mfaCode: string } } | { ok: false, status: number, code: string, message: string }}
 */
export function validateAgentPayoutBody(body) {
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
  if (!isPlatformFeePair(asset, network)) {
    return {
      ok: false,
      status: 422,
      code: "asset_network_disabled",
      message: `Platform fees and commission payouts are ${PLATFORM_FEE_ASSET} on ${resolvePlatformFeeNetwork()} only`,
    };
  }
  if (!isTronReceiveAddress(address)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_address",
      message: "Payout address must be a Tron (TRC-20) receive address",
    };
  }
  if (mfaCode.length < 6 || mfaCode.length > 8) {
    return {
      ok: false,
      status: 400,
      code: "mfa_required",
      message: "mfaCode is required to change agent payout address",
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
 *   updated_at?: Date | string,
 * }} row
 */
export function toAgentPayoutAddress(row) {
  return {
    orgId: row.org_id,
    asset: row.asset,
    network: row.network,
    address: row.address,
    pendingAddress: row.pending_address ?? null,
    pendingActivatesAt: row.pending_activates_at
      ? new Date(row.pending_activates_at).toISOString()
      : null,
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : row.updated_at
          ? new Date(row.updated_at).toISOString()
          : undefined,
  };
}
