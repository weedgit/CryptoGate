/**
 * BNB Smart Chain JSON-RPC runtime config (archived — not a Phase 1 rail).
 * Values were formerly in @paymentgate/domain; kept local for optional tooling.
 */

const USDT_BNB = {
  asset: "USDT",
  network: "bnb_smart_chain",
  contractAddress: "0x55d398326f99059fF775485246999027B3197955",
  decimals: 18,
  requiredConfirmations: 15,
};

function readInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return fallback;
  return n;
}

/**
 * @returns {{
 *   rpcUrl: string,
 *   apiKey: string,
 *   usdtContractAddress: string,
 *   decimals: number,
 *   requiredConfirmations: number,
 *   asset: string,
 *   network: string,
 *   blockLookback: number,
 *   configured: boolean,
 * }}
 */
export function getBnbSmartChainRuntimeConfig() {
  const raw = (process.env.BSC_RPC_URL ?? "").trim();
  const rpcUrl = raw.replace(/\/+$/, "");
  return {
    rpcUrl,
    apiKey: (process.env.BSC_API_KEY ?? "").trim(),
    usdtContractAddress: USDT_BNB.contractAddress,
    decimals: USDT_BNB.decimals,
    requiredConfirmations: USDT_BNB.requiredConfirmations,
    asset: USDT_BNB.asset,
    network: USDT_BNB.network,
    blockLookback: readInt("BSC_BLOCK_LOOKBACK", 2000),
    configured: Boolean(rpcUrl),
  };
}
