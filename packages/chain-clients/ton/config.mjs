/** Archived — not a Phase 1 rail. */
function readInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return fallback;
  return n;
}

export function getTonRuntimeConfig(asset = "USDT") {
  const raw = (process.env.TON_RPC_URL ?? "").trim();
  const baseUrl = raw.replace(/\/+$/, "");
  return {
    baseUrl,
    apiKey: (process.env.TON_API_KEY ?? "").trim(),
    jettonMaster: "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs",
    decimals: 6,
    requiredConfirmations: 5,
    asset,
    network: "ton",
    eventLimit: readInt("TON_EVENT_LIMIT", 30),
    configured: baseUrl.length > 0,
    pairEnabled: false,
  };
}
