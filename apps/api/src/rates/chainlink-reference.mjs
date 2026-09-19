/**
 * Chainlink Data Feed reference via eth_call (latestRoundData).
 * Never alone sets the locked quote rate — sanity band only.
 */

import { normalizeRate } from "./median.mjs";

/** Ethereum mainnet aggregators (USD, 8 decimals). */
const FEEDS = {
  ETH: {
    address: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
    decimals: 8,
  },
  BTC: {
    address: "0xF4030086522a5bEEa06167b7dafF27ABcC0D4aD3",
    decimals: 8,
  },
  USDC: {
    address: "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576414f",
    decimals: 8,
  },
  // USDT/USD on Ethereum
  USDT: {
    address: "0x3E7d1eAB13ad0104d2750B8863b489D65364e32D",
    decimals: 8,
  },
};

/** latestRoundData() */
const LATEST_ROUND_DATA = "0xfeaf968c";

function rpcUrl() {
  const fromEnv = (process.env.ETH_RPC_URL ?? process.env.CHAINLINK_ETH_RPC_URL ?? "").trim();
  return fromEnv || "https://ethereum.publicnode.com";
}

/**
 * Decode int256 answer from eth_call return (second 32-byte word of latestRoundData).
 * @param {string} hex
 * @param {number} decimals
 * @returns {string}
 */
export function decodeChainlinkAnswer(hex, decimals) {
  const h = String(hex ?? "").replace(/^0x/i, "");
  if (h.length < 128) throw new Error("chainlink_bad_payload");
  // roundId (0..63), answer (64..127), …
  const answerHex = h.slice(64, 128);
  let answer = BigInt(`0x${answerHex}`);
  // signed int256
  const signBit = 1n << 255n;
  if (answer & signBit) {
    answer -= 1n << 256n;
  }
  if (answer <= 0n) throw new Error("chainlink_non_positive");
  const base = 10n ** BigInt(decimals);
  const whole = answer / base;
  const frac = answer % base;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return normalizeRate(fracStr ? `${whole}.${fracStr}` : `${whole}`);
}

/**
 * @param {string} asset
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ rate: string, source: 'chainlink' } | null>}
 */
export async function fetchChainlinkUsd(asset, fetchImpl = fetch) {
  const code = String(asset ?? "").trim().toUpperCase();
  const feed = FEEDS[code];
  if (!feed) return null;

  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_call",
    params: [
      { to: feed.address, data: LATEST_ROUND_DATA },
      "latest",
    ],
  };
  const res = await fetchImpl(rpcUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`chainlink_rpc_http_${res.status}`);
  const json = await res.json();
  if (json?.error) throw new Error(`chainlink_rpc:${json.error.message ?? "error"}`);
  const rate = decodeChainlinkAnswer(json.result, feed.decimals);
  return { rate, source: "chainlink" };
}
