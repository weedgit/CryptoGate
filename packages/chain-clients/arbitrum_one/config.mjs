/** Archived — not a Phase 1 rail. */
function readInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return fallback;
  return n;
}

const PAIRS = {
  USDT: {
    contractAddress: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
    decimals: 6,
    requiredConfirmations: 12,
  },
  USDC: {
    contractAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    decimals: 6,
    requiredConfirmations: 12,
  },
};

export function getArbitrumOneRuntimeConfig(asset = "USDT") {
  const raw = (process.env.ARBITRUM_RPC_URL ?? "").trim();
  const rpcUrl = raw.replace(/\/+$/, "");
  const row = PAIRS[asset] ?? PAIRS.USDT;
  return {
    rpcUrl,
    apiKey: (process.env.ARBITRUM_API_KEY ?? "").trim(),
    usdtContractAddress: row.contractAddress,
    decimals: row.decimals,
    requiredConfirmations: row.requiredConfirmations,
    asset,
    network: "arbitrum_one",
    blockLookback: readInt("ARBITRUM_BLOCK_LOOKBACK", 5000),
    configured: rpcUrl.length > 0,
    pairEnabled: false,
  };
}
