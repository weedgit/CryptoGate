/**
 * Resolve FX quote for an invoice (USD/EUR fiat or exact crypto) + asset pair.
 */
import { amountToMinor } from "../orders/order-rules.mjs";
import { getUsdPrice } from "./usd-price.mjs";
import { getEurUsdPrice } from "./eur-usd.mjs";
import { buildLockedQuote, multiplyDecimals } from "./pricing.mjs";
import {
  getMerchantPricingSettings,
  getPlatformPricingSettings,
} from "./pricing-settings-store.mjs";

/**
 * @param {{
 *   orgId: string,
 *   amountUsd?: string,
 *   invoiceAmount?: string,
 *   invoiceCurrency?: string,
 *   invoiceDenomination?: 'fiat' | 'crypto',
 *   amountCrypto?: string,
 *   asset: string,
 *   network: string,
 *   decimals: number,
 *   minAmount: string,
 * }} args
 */
export async function resolveOrderQuote(args) {
  const merchant = await getMerchantPricingSettings(args.orgId);
  const platform = await getPlatformPricingSettings();
  const eff = merchant.effective;
  if (!eff.ratesEnabled) {
    return {
      ok: false,
      status: 503,
      code: "rates_unavailable",
      message: "FX rates are temporarily disabled by the platform",
    };
  }
  if (!eff.modeAvailable) {
    return {
      ok: false,
      status: 422,
      code: "pricing_mode_unavailable",
      message:
        "Merchant pricing mode is disabled by the platform; choose another mode in settings when re-enabled",
    };
  }

  const denomination =
    args.invoiceDenomination === "crypto" || args.amountCrypto
      ? "crypto"
      : "fiat";
  const invoiceCurrency =
    args.invoiceCurrency === "EUR" ? "EUR" : "USD";

  let price;
  try {
    price = await getUsdPrice(args.asset, {
      minSources: platform.minRateSources,
      venues: platform.rateVenues,
      chainlinkReferenceEnabled: platform.chainlinkReferenceEnabled,
      referenceDeviationBps: platform.referenceDeviationBps,
    });
  } catch (err) {
    const code =
      err?.code === "rate_reference_rejected"
        ? "rate_reference_rejected"
        : "rates_unavailable";
    return {
      ok: false,
      status: code === "rate_reference_rejected" ? 422 : 503,
      code,
      message: err instanceof Error ? err.message : "Unable to fetch USD price",
    };
  }

  if (denomination === "crypto") {
    const amountCrypto = String(args.amountCrypto ?? args.invoiceAmount ?? "").trim();
    if (!amountCrypto || !/^\d+(\.\d+)?$/.test(amountCrypto) || Number(amountCrypto) <= 0) {
      return {
        ok: false,
        status: 400,
        code: "invalid_amount",
        message: "amountCrypto must be a positive decimal string",
      };
    }
    const quote = buildLockedQuote({
      invoiceUsd: "0",
      invoiceDenomination: "crypto",
      exactPayAmount: amountCrypto,
      asset: args.asset,
      decimals: args.decimals,
      merchantMode: /** @type {'pegged_1to1' | 'market'} */ (
        eff.pricingMode === "pegged_1to1" ? "pegged_1to1" : "market"
      ),
      marketRate: price.rate,
      rateSource: price.source,
      rateFetchedAt: price.fetchedAt,
      rateSources: price.sources,
      referenceRate: price.referenceRate ?? null,
      referenceSource: price.referenceSource ?? null,
      rateWarning: price.rateWarning ?? null,
      depegThresholdBps: eff.depegThresholdBps,
      quoteLockSeconds: eff.quoteLockSeconds,
    });
    const minor = amountToMinor(quote.payAmount, args.decimals);
    const minMinor = amountToMinor(args.minAmount, args.decimals);
    if (minor === null || minMinor === null || minor < minMinor) {
      return {
        ok: false,
        status: 400,
        code: "invalid_amount",
        message: `Pay amount is below minimum ${args.minAmount} ${args.asset}`,
      };
    }
    return { ok: true, quote };
  }

  // Fiat path: normalize invoice to USD
  const invoiceAmount = String(
    args.invoiceAmount ?? args.amountUsd ?? "",
  ).trim();
  if (!invoiceAmount || !/^\d+(\.\d+)?$/.test(invoiceAmount) || Number(invoiceAmount) <= 0) {
    return {
      ok: false,
      status: 400,
      code: "invalid_amount",
      message: "invoice amount must be a positive decimal string",
    };
  }

  let invoiceUsd = invoiceAmount;
  let fxWarning = null;
  if (invoiceCurrency === "EUR") {
    try {
      const eur = await getEurUsdPrice({
        minSources: Math.min(2, platform.minRateSources),
      });
      invoiceUsd = multiplyDecimals(invoiceAmount, eur.rate);
      fxWarning = `eurusd:${eur.source}`;
    } catch (err) {
      return {
        ok: false,
        status: 503,
        code: "rates_unavailable",
        message:
          err instanceof Error ? err.message : "Unable to fetch EUR/USD rate",
      };
    }
  }

  const quote = buildLockedQuote({
    invoiceUsd,
    invoiceAmount,
    invoiceCurrency,
    invoiceDenomination: "fiat",
    asset: args.asset,
    decimals: args.decimals,
    merchantMode: /** @type {'pegged_1to1' | 'market'} */ (
      eff.pricingMode === "pegged_1to1" ? "pegged_1to1" : "market"
    ),
    marketRate: price.rate,
    rateSource: price.source,
    rateFetchedAt: price.fetchedAt,
    rateSources: price.sources,
    referenceRate: price.referenceRate ?? null,
    referenceSource: price.referenceSource ?? null,
    rateWarning: price.rateWarning ?? fxWarning,
    depegThresholdBps: eff.depegThresholdBps,
    quoteLockSeconds: eff.quoteLockSeconds,
  });

  const minor = amountToMinor(quote.payAmount, args.decimals);
  const minMinor = amountToMinor(args.minAmount, args.decimals);
  if (minor === null || minMinor === null || minor < minMinor) {
    return {
      ok: false,
      status: 400,
      code: "invalid_amount",
      message: `Quoted pay amount is below minimum ${args.minAmount} ${args.asset}`,
    };
  }

  return { ok: true, quote };
}
