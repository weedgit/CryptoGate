/** Archived — not a Phase 1 rail. */
function readInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return fallback;
  return n;
}

export function getBaseRuntimeConfig(asset = "USDC") {
  const raw = (process.env.BASE_RPC_URL ?? "").trim();
  const rpcUrl = raw.replace(/\/+$/, "");
  return {
    rpcUrl,
    apiKey: (process.env.BASE_API_KEY ?? "").trim(),
    usdtContractAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    decimals: 6,
    requiredConfirmations: 12,
    asset,
    network: "base",
    blockLookback: readInt("BASE_BLOCK_LOOKBACK", 4000),
    configured: rpcUrl.length > 0,
    pairEnabled: false,
  };
}
