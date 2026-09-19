import { getAssetNetworkConfig } from "@paymentgate/domain";

const ALLOWED_KEYS = new Set([
  "amount",
  "amountUsd",
  "amountCrypto",
  "invoiceAmount",
  "invoiceCurrency",
  "invoiceDenomination",
  "asset",
  "network",
  "validitySeconds",
  "merchantMetadata",
  "merchantReference",
  "orgId",
]);

const PRIVILEGED_KEYS = new Set([
  "matchingMode",
  "receiveAddress",
  "addressSource",
  "hdIndex",
  "memoOrTag",
  "payableAmount",
  "receivedAmount",
  "fee",
]);

/** Not a live wallet. Replaced by assignOnCreate (M2-12) + merchant settlement address. */
export const STUB_RECEIVE_ADDRESS = "TPaymentGateStubReceiveAddress00001";

/**
 * @param {unknown} body
 * @returns {{ extra: string[], privileged: string[] }}
 */
export function extraCreateOrderKeys(body) {
  const extra = [];
  const privileged = [];
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { extra: ["<body>"], privileged: [] };
  }
  for (const key of Object.keys(body)) {
    if (PRIVILEGED_KEYS.has(key)) privileged.push(key);
    else if (!ALLOWED_KEYS.has(key)) extra.push(key);
  }
  return { extra, privileged };
}

/**
 * @param {string} amount
 * @param {number} decimals
 * @returns {bigint | null}
 */
export function amountToMinor(amount, decimals) {
  if (typeof amount !== "string" || !/^\d+(\.\d+)?$/.test(amount)) return null;
  const [whole, frac = ""] = amount.split(".");
  if (frac.length > decimals) return null;
  try {
    return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, "0"));
  } catch {
    return null;
  }
}

/**
 * @param {unknown} body
 * @returns {{ ok: true, parsed: object } | { ok: false, status: number, code: string, message: string }}
 */
export function validateCreateOrderBody(body) {
  const amountUsdRaw =
    typeof body?.amountUsd === "string" ? body.amountUsd.trim() : "";
  const amountLegacy =
    typeof body?.amount === "string" ? body.amount.trim() : "";
  const amountCryptoRaw =
    typeof body?.amountCrypto === "string" ? body.amountCrypto.trim() : "";
  const invoiceAmountRaw =
    typeof body?.invoiceAmount === "string" ? body.invoiceAmount.trim() : "";
  const invoiceCurrencyRaw =
    typeof body?.invoiceCurrency === "string"
      ? body.invoiceCurrency.trim().toUpperCase()
      : "USD";
  const denominationRaw =
    typeof body?.invoiceDenomination === "string"
      ? body.invoiceDenomination.trim().toLowerCase()
      : amountCryptoRaw
        ? "crypto"
        : "fiat";
  const asset = typeof body?.asset === "string" ? body.asset : "";
  const network = typeof body?.network === "string" ? body.network : "";
  const validitySeconds = body?.validitySeconds;
  const orgId =
    typeof body?.orgId === "string" && body.orgId.trim() ? body.orgId.trim() : null;

  const invoiceDenomination =
    denominationRaw === "crypto" || amountCryptoRaw ? "crypto" : "fiat";
  const invoiceCurrency =
    invoiceCurrencyRaw === "EUR" ? "EUR" : "USD";

  if (!asset || !network) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "asset and network are required",
    };
  }

  let invoiceAmount = "";
  let amountCrypto = null;
  if (invoiceDenomination === "crypto") {
    amountCrypto = amountCryptoRaw || invoiceAmountRaw || amountLegacy;
    invoiceAmount = amountCrypto;
    if (!amountCrypto || !/^\d+(\.\d+)?$/.test(amountCrypto) || Number(amountCrypto) <= 0) {
      return {
        ok: false,
        status: 400,
        code: "invalid_amount",
        message: "amountCrypto must be a positive decimal string",
      };
    }
  } else {
    invoiceAmount =
      invoiceAmountRaw || amountUsdRaw || amountLegacy;
    if (!invoiceAmount || !/^\d+(\.\d+)?$/.test(invoiceAmount) || Number(invoiceAmount) <= 0) {
      return {
        ok: false,
        status: 400,
        code: "invalid_amount",
        message: "invoice amount (amountUsd/amount) must be a positive decimal string",
      };
    }
    if (invoiceCurrency !== "USD" && invoiceCurrency !== "EUR") {
      return {
        ok: false,
        status: 400,
        code: "invalid_request",
        message: "invoiceCurrency must be USD or EUR",
      };
    }
  }

  if (!Number.isInteger(validitySeconds) || validitySeconds < 60) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "validitySeconds must be an integer of at least 60",
    };
  }

  const config = getAssetNetworkConfig(asset, network);
  if (!config) {
    return {
      ok: false,
      status: 422,
      code: "asset_network_disabled",
      message: "Asset and network are not enabled",
    };
  }

  const merchantReference =
    typeof body?.merchantReference === "string" ? body.merchantReference.trim() : "";
  if (merchantReference.length > 200) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "merchantReference must be at most 200 characters",
    };
  }

  /** @type {Record<string, unknown> | null} */
  let merchantMetadata = null;
  if (
    body.merchantMetadata &&
    typeof body.merchantMetadata === "object" &&
    !Array.isArray(body.merchantMetadata)
  ) {
    merchantMetadata = { ...body.merchantMetadata };
  }
  if (merchantReference) {
    merchantMetadata = { ...(merchantMetadata ?? {}), reference: merchantReference };
  }

  return {
    ok: true,
    parsed: {
      /** @deprecated use invoiceAmount; kept for idempotency hash compat */
      amountUsd: invoiceDenomination === "fiat" && invoiceCurrency === "USD"
        ? invoiceAmount
        : invoiceAmount,
      invoiceAmount,
      invoiceCurrency: invoiceDenomination === "crypto" ? "USD" : invoiceCurrency,
      invoiceDenomination,
      amountCrypto,
      /** Filled after quote — token major units for matching assign. */
      amount: invoiceAmount,
      asset,
      network,
      validitySeconds,
      orgId,
      merchantReference: merchantReference || null,
      merchantMetadata,
      config,
    },
  };
}

/**
 * Stub assign retained for unit tests only. Create path uses `@paymentgate/matching`.
 * @param {{
 *   amount: string,
 *   asset: string,
 *   matchingMode: string,
 *   config: { requiredConfirmations: number },
 * }} input
 */
export function stubAssignOnCreate(input) {
  return {
    matchingMode: input.matchingMode,
    payableAmount: { amount: input.amount, currency: input.asset },
    receiveAddress: STUB_RECEIVE_ADDRESS,
    addressSource: "main",
    hdIndex: null,
    memoOrTag: null,
    requiredConfirmations: input.config.requiredConfirmations,
  };
}

/**
 * @param {{ amount: string, asset: string, network: string, validitySeconds: number, orgId: string | null, merchantMetadata: unknown }} parsed
 */
export function idempotencyBodyHashPayload(parsed) {
  return JSON.stringify({
    amountUsd: parsed.amountUsd ?? parsed.amount,
    invoiceAmount: parsed.invoiceAmount ?? null,
    invoiceCurrency: parsed.invoiceCurrency ?? "USD",
    invoiceDenomination: parsed.invoiceDenomination ?? "fiat",
    amountCrypto: parsed.amountCrypto ?? null,
    asset: parsed.asset,
    network: parsed.network,
    validitySeconds: parsed.validitySeconds,
    orgId: parsed.orgId,
    merchantReference: parsed.merchantReference ?? null,
    merchantMetadata: parsed.merchantMetadata,
  });
}
