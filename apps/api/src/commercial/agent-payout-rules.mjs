import { getAssetNetworkConfig } from "@cryptogate/domain";

const AGENT_TYPES = new Set(["agent", "agent_sub"]);

/**
 * @param {string} orgType
 */
export function agentPayoutAllowedOnOrgType(orgType) {
  return AGENT_TYPES.has(orgType);
}

/**
 * @param {unknown} body
 * @returns {{ ok: true, parsed: { asset: string, network: string, address: string } } | { ok: false, status: number, code: string, message: string }}
 */
export function validateAgentPayoutBody(body) {
  const asset = typeof body?.asset === "string" ? body.asset.trim() : "";
  const network = typeof body?.network === "string" ? body.network.trim() : "";
  const address = typeof body?.address === "string" ? body.address.trim() : "";

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

  const config = getAssetNetworkConfig(asset, network);
  if (!config) {
    return {
      ok: false,
      status: 422,
      code: "asset_network_disabled",
      message: "Asset and network are not enabled",
    };
  }

  return { ok: true, parsed: { asset, network, address } };
}

/**
 * @param {{
 *   org_id: string,
 *   asset: string,
 *   network: string,
 *   address: string,
 *   updated_at?: Date | string,
 * }} row
 */
export function toAgentPayoutAddress(row) {
  return {
    orgId: row.org_id,
    asset: row.asset,
    network: row.network,
    address: row.address,
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : row.updated_at
          ? new Date(row.updated_at).toISOString()
          : undefined,
  };
}
