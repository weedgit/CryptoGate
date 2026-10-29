import { isEvmNetwork } from "@paymentgate/domain";

/**
 * SQL test that `column` holds the same account as `param`; EVM hex compares
 * case-insensitively (checksummed vs lowercase spellings, H1).
 * @param {string} column
 * @param {string} param
 * @param {string} network
 */
export function sameAddressSql(column, param, network) {
  return isEvmNetwork(network)
    ? `lower(${column}) = lower(${param})`
    : `${column} = ${param}`;
}
