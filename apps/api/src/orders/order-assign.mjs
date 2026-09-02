/**
 * Map `@paymentgate/matching` assign failures to API errors.
 * @param {unknown} err
 * @returns {{ status: number, code: string, message: string }}
 */
export function mapAssignError(err) {
  const message = err instanceof Error ? err.message : String(err);

  if (message.includes("memo not supported") || message.includes("memoSupported=false")) {
    return {
      status: 422,
      code: "matching_mode_unavailable",
      message:
        "Mode D requires a network that supports memo/tag; USDT on Tron does not",
    };
  }
  if (message.includes("no free Mode C") || message.includes("fingerprint slot")) {
    return {
      status: 409,
      code: "matching_exhausted",
      message: "Could not find a unique payable amount; try again later",
    };
  }
  if (message.includes("no free Mode D") || message.includes("memo/tag within")) {
    return {
      status: 409,
      code: "matching_exhausted",
      message: "Could not find a unique memo/tag; try again later",
    };
  }
  if (message.includes("mainSettlementAddress")) {
    return {
      status: 422,
      code: "settlement_address_required",
      message: "Configure a settlement address for this asset and network",
    };
  }
  if (message.includes("not implemented") || message.includes("M2-43")) {
    return {
      status: 422,
      code: "matching_mode_unavailable",
      message: "Matching mode is not available yet",
    };
  }
  if (
    message.includes("not a valid BIP32") ||
    message.includes("could not derive a public key")
  ) {
    return {
      status: 422,
      code: "invalid_xpub",
      message: "Configured xPub cannot derive a Tron receive address",
    };
  }
  if (
    message.includes("HD pool") ||
    message.includes("only available for tron")
  ) {
    return {
      status: 422,
      code: "hd_pool_unavailable",
      message: "Could not assign an HD pool address for Mode S",
    };
  }
  if (message.includes("claimHdPoolAddress") || message.includes("xPub")) {
    return {
      status: 422,
      code: "matching_mode_unavailable",
      message: "Mode S HD pool is not configured for this merchant",
    };
  }
  if (message.includes("below minAmount") || message.includes("requestedAmount")) {
    return {
      status: 400,
      code: "invalid_amount",
      message: message,
    };
  }

  return {
    status: 422,
    code: "matching_failed",
    message: "Could not assign payment details for this order",
  };
}
