export const RATE_VENUES = ["binance", "coingecko", "kraken", "coinbase", "bitstamp"] as const;

export const VENUE_LABEL: Record<string, string> = {
  binance: "Binance",
  coingecko: "CoinGecko",
  kraken: "Kraken",
  coinbase: "Coinbase",
  bitstamp: "Bitstamp",
};

/** Assets each venue can price in USD (mirrors the API feed). */
const VENUE_ASSETS: Record<string, readonly string[]> = {
  binance: ["ETH", "TRX", "USDC"],
  coingecko: ["ETH", "TRX", "USDT", "USDC"],
  kraken: ["ETH", "TRX", "USDT", "USDC"],
  coinbase: ["ETH", "USDT"],
  bitstamp: ["ETH", "TRX", "USDT", "USDC"],
};

const ASSETS = ["ETH", "TRX", "USDT", "USDC"] as const;

/** The asset with the fewest enabled venues, and how many it has. */
export function thinnestAsset(venues: readonly string[]): { asset: string; count: number } {
  let best = { asset: ASSETS[0] as string, count: Infinity };
  for (const asset of ASSETS) {
    const count = venues.filter((v) => VENUE_ASSETS[v]?.includes(asset)).length;
    if (count < best.count) best = { asset, count };
  }
  return best;
}
