export function fulfillmentPolicyLabel(policy: string | null | undefined): string {
  return policy === "on_verifying" ? "Counter (release on verifying)" : "Standard (release on completed)";
}

export function fulfillmentPolicyScope(policy: string | null | undefined): string {
  if (policy === "on_verifying") {
    return "Staff may hand over goods when the order shows Verifying (tx detected). Chain status and webhooks stay honest — Completed still means confirmations met.";
  }
  return "Release goods only when the order is Completed (required blockchain confirmations met).";
}

export const FULFILLMENT_POLICY_CARDS = [
  {
    policy: "on_completed",
    label: "Standard",
    blurb: "Release goods when the order reaches Completed (confirmations met).",
  },
  {
    policy: "on_verifying",
    label: "Counter",
    blurb: "Release at the counter when Verifying (tx seen). Reorg risk is on the merchant.",
  },
] as const;

/** Plain-language tooltip for each fulfillment policy card. */
export function fulfillmentPolicyTooltip(policy: string): string {
  if (policy === "on_verifying") {
    return "Counter / early release: staff may hand over goods when the order shows Verifying (payment seen on chain). The order stays Verifying until confirmations complete — webhooks and chain status stay honest. If a transaction is reversed before then, the merchant bears that risk, not the payer.";
  }
  return "Standard: release goods only after the order is Completed — meaning the payment has the required blockchain confirmations. Safest default for most merchants.";
}

/** Cashier / order detail hint when policy allows early release. */
export function orderFulfillmentHint(
  policy: string | null | undefined,
  status: string | null | undefined,
): string | null {
  if (policy !== "on_verifying") return null;
  if (status === "verifying") {
    return "OK to release goods — payment detected on chain. Order stays Verifying until confirmations complete.";
  }
  if (status === "completed" || status === "confirmed") {
    return "Chain complete — safe to release goods.";
  }
  return null;
}
