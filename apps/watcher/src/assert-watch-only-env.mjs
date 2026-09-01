/**
 * Watcher never imports apps/api. Same watch-only env refuse list.
 */
const ENV_SPEND_KEYS = [
  "PRIVATE_KEY",
  "WALLET_PRIVATE_KEY",
  "ETH_PRIVATE_KEY",
  "TRON_PRIVATE_KEY",
  "BTC_WIF",
  "MNEMONIC",
  "SEED_PHRASE",
  "WALLET_SEED",
  "HD_XPRV",
  "XPPRIV",
  "XPRV",
];

const PRIVATE_EXTENDED = /^(xprv|tprv|yprv|zprv|uprv|vprv)/i;

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function assertWatchOnlyEnv(env = process.env) {
  const hits = [];
  for (const key of ENV_SPEND_KEYS) {
    if (typeof env[key] === "string" && env[key].trim()) hits.push(key);
  }
  for (const [key, val] of Object.entries(env)) {
    if (typeof val === "string" && PRIVATE_EXTENDED.test(val.trim())) hits.push(key);
  }
  if (hits.length > 0) {
    throw new Error(
      `Watch-only invariant: refuse spend-key env (${[...new Set(hits)].join(", ")}).`,
    );
  }
}
