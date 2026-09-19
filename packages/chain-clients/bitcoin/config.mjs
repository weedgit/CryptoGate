/** Archived — not a Phase 1 rail. */
function readInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return fallback;
  return n;
}

export function getBitcoinRuntimeConfig(asset = "BTC") {
  const raw = (process.env.BITCOIN_RPC_URL ?? "").trim();
  const baseUrl = raw.replace(/\/+$/, "");
  return {
    baseUrl,
    apiKey: (process.env.BITCOIN_API_KEY ?? "").trim(),
    decimals: 8,
    requiredConfirmations: 3,
    asset,
    network: "bitcoin",
    txLimit: readInt("BITCOIN_TX_LIMIT", 25),
    configured: baseUrl.length > 0,
    pairEnabled: false,
  };
}
