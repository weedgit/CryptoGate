/**
 * Tron / TronGrid runtime config (M3-30 / M3-31).
 * Contract + confirmations must stay aligned with @cryptogate/domain USDT_TRON.
 */

export const USDT_TRC20_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
export const USDT_DECIMALS = 6;
export const DEFAULT_REQUIRED_CONFIRMATIONS = 19;
export const DEFAULT_TRONGRID_BASE = "https://api.trongrid.io";

/**
 * @returns {{
 *   baseUrl: string,
 *   apiKey: string,
 *   usdtContractAddress: string,
 *   decimals: number,
 *   requiredConfirmations: number,
 *   configured: boolean,
 * }}
 */
export function getTronRuntimeConfig() {
  const raw = (process.env.TRON_RPC_URL ?? "").trim();
  const baseUrl = raw.replace(/\/+$/, "");
  return {
    baseUrl,
    apiKey: (process.env.TRON_API_KEY ?? "").trim(),
    usdtContractAddress: USDT_TRC20_CONTRACT,
    decimals: USDT_DECIMALS,
    requiredConfirmations: DEFAULT_REQUIRED_CONFIRMATIONS,
    configured: baseUrl.length > 0,
  };
}
