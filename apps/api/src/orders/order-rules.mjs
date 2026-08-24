import { getAssetNetworkConfig } from "@cryptogate/domain";

const ALLOWED_KEYS = new Set([
  "amount",
  "asset",
  "network",
  "validitySeconds",
  "merchantMetadata",
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
export const STUB_RECEIVE_ADDRESS = "TCryptoGateStubReceiveAddress00001";

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
  const amount = typeof body?.amount === "string" ? body.amount.trim() : "";
  const asset = typeof body?.asset === "string" ? body.asset : "";
  const network = typeof body?.network === "string" ? body.network : "";
  const validitySeconds = body?.validitySeconds;
  const orgId =
    typeof body?.orgId === "string" && body.orgId.trim() ? body.orgId.trim() : null;

  if (!amount || !asset || !network) {
    return {
      ok: false,
      status: 400,
      code: "invalid_request",
      message: "amount, asset, and network are required",
    };
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

  const minor = amountToMinor(amount, config.decimals);
  const minMinor = amountToMinor(config.minAmount, config.decimals);
  if (minor === null || minMinor === null || minor < minMinor) {
    return {
      ok: false,
      status: 400,
      code: "invalid_amount",
      message: `Amount must be a decimal string of at least ${config.minAmount} ${asset}`,
    };
  }

  return {
    ok: true,
    parsed: {
      amount,
      asset,
      network,
      validitySeconds,
      orgId,
      merchantMetadata:
        body.merchantMetadata && typeof body.merchantMetadata === "object"
          ? body.merchantMetadata
          : null,
      config,
    },
  };
}

/**
 * Stub assign until M2-12 wires `@cryptogate/matching`.
 * Locks the merchant default mode onto the order; address/payable stay stub.
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
    amount: parsed.amount,
    asset: parsed.asset,
    network: parsed.network,
    validitySeconds: parsed.validitySeconds,
    orgId: parsed.orgId,
    merchantMetadata: parsed.merchantMetadata,
  });
}
