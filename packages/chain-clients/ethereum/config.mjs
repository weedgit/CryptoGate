/**
 * Ethereum JSON-RPC runtime config (M3-32).
 * Contract + confirmations from @cryptogate/domain USDT_ETHEREUM — not hardcoded.
 */

import { USDT_ETHEREUM } from "@cryptogate/domain";

/** keccak256("Transfer(address,address,uint256)") */
export const ERC20_TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

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
export function getEthereumRuntimeConfig() {
  const raw = (process.env.ETH_RPC_URL ?? "").trim();
  const rpcUrl = raw.replace(/\/+$/, "");
  return {
    rpcUrl,
    apiKey: (process.env.ETH_API_KEY ?? "").trim(),
    usdtContractAddress: USDT_ETHEREUM.contractAddress,
    decimals: USDT_ETHEREUM.decimals,
    requiredConfirmations: USDT_ETHEREUM.requiredConfirmations,
    asset: USDT_ETHEREUM.asset,
    network: USDT_ETHEREUM.network,
    blockLookback: readInt("ETH_BLOCK_LOOKBACK", 2000),
    configured: rpcUrl.length > 0,
  };
}
