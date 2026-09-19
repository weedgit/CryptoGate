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
    contractAddress: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
    decimals: 6,
    requiredConfirmations: 64,
  },
  USDC: {
    contractAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    decimals: 6,
    requiredConfirmations: 64,
  },
};

export function getPolygonRuntimeConfig(asset = "USDT") {
  const raw = (process.env.POLYGON_RPC_URL ?? "").trim();
  const rpcUrl = raw.replace(/\/+$/, "");
  const row = PAIRS[asset] ?? PAIRS.USDT;
  return {
    rpcUrl,
    apiKey: (process.env.POLYGON_API_KEY ?? "").trim(),
    usdtContractAddress: row.contractAddress,
    decimals: row.decimals,
    requiredConfirmations: row.requiredConfirmations,
    asset,
    network: "polygon",
    blockLookback: readInt("POLYGON_BLOCK_LOOKBACK", 4000),
    configured: rpcUrl.length > 0,
    pairEnabled: false,
  };
}
