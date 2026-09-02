/**
 * Non-custodial guard: reject spend keys / mnemonics anywhere they could be stored.
 * PaymentGate is watch-only SaaS — receive addresses and xPubs only.
 */

const PRIVATE_EXTENDED = /^(xprv|tprv|yprv|zprv|uprv|vprv|Yprv|Zprv)/i;
const HEX_PRIV = /^(0x)?[0-9a-fA-F]{64}$/;
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

/**
 * @param {string} value
 */
export function looksLikeSpendKey(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  if (PRIVATE_EXTENDED.test(raw)) return true;
  if (HEX_PRIV.test(raw.replace(/\s/g, ""))) return true;
  const words = raw.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length >= 12 && words.length <= 24 && words.every((w) => /^[a-z]+$/.test(w))) {
    return true;
  }
  if (/\b(private key|mnemonic|seed phrase|spend key)\b/i.test(raw)) return true;
  return false;
}

/**
 * @param {string} xpub
 */
export function isWatchOnlyXpub(xpub) {
  const raw = String(xpub ?? "").trim();
  if (!raw) return false;
  if (looksLikeSpendKey(raw)) return false;
  return /^(xpub|tpub|ypub|zpub|upub|vpub|Ypub|Zpub)/i.test(raw);
}

/**
 * Refuse process start if an operator pasted a spend key into env.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function assertWatchOnlyEnv(env = process.env) {
  const hits = [];
  for (const key of ENV_SPEND_KEYS) {
    const val = env[key];
    if (typeof val === "string" && val.trim()) hits.push(key);
  }
  for (const [key, val] of Object.entries(env)) {
    if (typeof val !== "string" || !val.trim()) continue;
    if (looksLikeSpendKey(val)) hits.push(key);
  }
  if (hits.length > 0) {
    const unique = [...new Set(hits)];
    throw new Error(
      `Watch-only invariant: refuse spend-key env (${unique.join(", ")}). PaymentGate never stores private keys or mnemonics.`,
    );
  }
}
