/**
 * Quote math: invoice USD → token major + base units.
 * Uses string/BigInt math — no IEEE float for amounts.
 */

import { isStablecoinAsset } from "@paymentgate/domain";

/**
 * @param {string} s
 * @returns {bigint}
 */
function parseDecimalToScaled(s, scale) {
  const t = String(s ?? "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(t)) {
    throw Object.assign(new Error("invalid_decimal"), { code: "invalid_request" });
  }
  const neg = t.startsWith("-");
  const [whole, frac = ""] = (neg ? t.slice(1) : t).split(".");
  const fracPadded = (frac + "0".repeat(scale)).slice(0, scale);
  const n = BigInt(whole || "0") * 10n ** BigInt(scale) + BigInt(fracPadded || "0");
  return neg ? -n : n;
}

/**
 * @param {bigint} n
 * @param {number} scale
 * @returns {string}
 */
function scaledToDecimal(n, scale) {
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const base = 10n ** BigInt(scale);
  const whole = abs / base;
  const frac = abs % base;
  const fracStr = frac.toString().padStart(scale, "0").replace(/0+$/, "");
  const body = fracStr ? `${whole}.${fracStr}` : `${whole}`;
  return neg ? `-${body}` : body;
}

/**
 * Divide a/b with `outScale` decimal places (floor).
 * @param {bigint} a
 * @param {bigint} b
 * @param {number} outScale
 */
function divScaled(a, b, outScale) {
  if (b === 0n) throw new Error("divide_by_zero");
  const factor = 10n ** BigInt(outScale);
  return (a * factor) / b;
}

/**
 * @param {string} major
 * @param {number} decimals
 * @returns {string} integer base units as decimal string
 */
export function toBaseUnits(major, decimals) {
  const d = Number(decimals);
  if (!Number.isInteger(d) || d < 0 || d > 36) {
    throw Object.assign(new Error("invalid_decimals"), { code: "invalid_request" });
  }
  const scaled = parseDecimalToScaled(major, d);
  if (scaled < 0n) {
    throw Object.assign(new Error("negative_amount"), { code: "invalid_request" });
  }
  return scaled.toString();
}

/**
 * @param {string} invoiceUsd
 * @param {string} pricingRate USD per 1 token
 * @param {number} decimals
 * @returns {{ payAmount: string, payAmountBaseUnits: string }}
 */
export function quotePayAmount(invoiceUsd, pricingRate, decimals) {
  // pay = invoice / rate. Work in 18 fixed decimals then trim to asset decimals.
  const WORK = 18;
  const inv = parseDecimalToScaled(invoiceUsd, WORK);
  const rate = parseDecimalToScaled(pricingRate, WORK);
  if (inv <= 0n) {
    throw Object.assign(new Error("invoice_must_be_positive"), { code: "invalid_request" });
  }
  if (rate <= 0n) {
    throw Object.assign(new Error("rate_must_be_positive"), { code: "invalid_request" });
  }
  // inv/rate in WORK scale: (inv * 10^WORK) / rate → still WORK scale
  const payWork = divScaled(inv, rate, WORK);
  const payMajor = scaledToDecimal(payWork, WORK);
  // Quantize to asset decimals (floor)
  const base = parseDecimalToScaled(payMajor, decimals);
  const quantized = scaledToDecimal(base, decimals);
  return {
    payAmount: quantized,
    payAmountBaseUnits: base.toString(),
  };
}

/**
 * @param {{
 *   asset: string,
 *   merchantMode: 'pegged_1to1' | 'market',
 *   marketRate: string,
 *   depegThresholdBps?: number,
 * }} args
 */
export function applyPricingPolicy(args) {
  const marketRate = String(args.marketRate);
  const thresholdBps = Number.isFinite(args.depegThresholdBps)
    ? args.depegThresholdBps
    : 100;
  const threshold = thresholdBps / 10_000;

  if (args.merchantMode === "market" || !isStablecoinAsset(args.asset)) {
    return {
      pricingRate: marketRate,
      pricingMode: "market",
      rateSourceApplied: "market",
    };
  }

  // pegged_1to1 for stables
  const rateNum = Number(marketRate);
  const deviation = Math.abs(rateNum - 1);
  if (Number.isFinite(rateNum) && deviation < threshold) {
    return {
      pricingRate: "1",
      pricingMode: "pegged_1to1",
      rateSourceApplied: "peg",
    };
  }
  return {
    pricingRate: marketRate,
    pricingMode: "depeg_market",
    rateSourceApplied: "market",
  };
}

/**
 * Multiply two positive decimal strings (WORK=18 scale, floor).
 * @param {string} a
 * @param {string} b
 * @returns {string}
 */
export function multiplyDecimals(a, b) {
  const WORK = 18;
  const x = parseDecimalToScaled(a, WORK);
  const y = parseDecimalToScaled(b, WORK);
  if (x < 0n || y < 0n) {
    throw Object.assign(new Error("negative_amount"), { code: "invalid_request" });
  }
  const prod = (x * y) / 10n ** BigInt(WORK);
  return scaledToDecimal(prod, WORK);
}

/**
 * Build a locked fiat→crypto quote, or crypto-exact quote.
 * @param {{
 *   invoiceUsd: string,
 *   invoiceAmount?: string,
 *   invoiceCurrency?: string,
 *   invoiceDenomination?: 'fiat' | 'crypto',
 *   asset: string,
 *   decimals: number,
 *   merchantMode: 'pegged_1to1' | 'market',
 *   marketRate: string,
 *   rateSource: string,
 *   rateFetchedAt: string,
 *   rateSources?: Array<{ source: string, rate: string }> | null,
 *   referenceRate?: string | null,
 *   referenceSource?: string | null,
 *   rateWarning?: string | null,
 *   depegThresholdBps?: number,
 *   quoteLockSeconds: number,
 *   now?: Date,
 *   exactPayAmount?: string | null,
 * }} args
 */
export function buildLockedQuote(args) {
  const denomination = args.invoiceDenomination === "crypto" ? "crypto" : "fiat";
  const invoiceCurrency = args.invoiceCurrency === "EUR" ? "EUR" : "USD";
  const now = args.now ?? new Date();
  const quoteExpiresAt = new Date(
    now.getTime() + args.quoteLockSeconds * 1000,
  ).toISOString();

  if (denomination === "crypto" && args.exactPayAmount) {
    const payAmount = String(args.exactPayAmount).trim();
    const payAmountBaseUnits = toBaseUnits(payAmount, args.decimals);
    const invoiceAmountUsd = multiplyDecimals(payAmount, args.marketRate);
    return {
      invoiceAmountUsd,
      invoiceAmount: payAmount,
      invoiceCurrency: "USD",
      invoiceDenomination: "crypto",
      marketRate: args.marketRate,
      pricingRate: args.marketRate,
      pricingMode: "crypto_exact",
      rateSource: args.rateSource,
      rateFetchedAt: args.rateFetchedAt,
      rateSources: args.rateSources ?? null,
      referenceRate: args.referenceRate ?? null,
      referenceSource: args.referenceSource ?? null,
      rateWarning: args.rateWarning ?? null,
      quoteExpiresAt,
      payAmount,
      payAmountBaseUnits,
      assetDecimals: args.decimals,
    };
  }

  const policy = applyPricingPolicy({
    asset: args.asset,
    merchantMode: args.merchantMode,
    marketRate: args.marketRate,
    depegThresholdBps: args.depegThresholdBps,
  });
  const { payAmount, payAmountBaseUnits } = quotePayAmount(
    args.invoiceUsd,
    policy.pricingRate,
    args.decimals,
  );
  return {
    invoiceAmountUsd: String(args.invoiceUsd).trim(),
    invoiceAmount: String(args.invoiceAmount ?? args.invoiceUsd).trim(),
    invoiceCurrency,
    invoiceDenomination: "fiat",
    marketRate: args.marketRate,
    pricingRate: policy.pricingRate,
    pricingMode: policy.pricingMode,
    rateSource:
      policy.rateSourceApplied === "peg" ? "peg" : args.rateSource,
    rateFetchedAt: args.rateFetchedAt,
    rateSources: args.rateSources ?? null,
    referenceRate: args.referenceRate ?? null,
    referenceSource: args.referenceSource ?? null,
    rateWarning: args.rateWarning ?? null,
    quoteExpiresAt,
    payAmount,
    payAmountBaseUnits,
    assetDecimals: args.decimals,
  };
}
