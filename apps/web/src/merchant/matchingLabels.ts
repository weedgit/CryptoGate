import {
  isMatchingModeSelectable,
  MatchingMode,
  MODE_D_PHASE1_UNAVAILABLE_REASON,
} from "@paymentgate/domain";

export const MATCHING_LABELS: Record<string, string> = {
  B: "Standard",
  C: "Amount fingerprint",
  D: "Memo tag",
  S: "Smart address",
};

export const MATCHING_MODE_CARDS = [
  {
    mode: "B",
    label: MATCHING_LABELS.B,
    blurb: "One open ticket per amount on the main address; second create is blocked until the first clears.",
  },
  {
    mode: "C",
    label: MATCHING_LABELS.C,
    blurb: "Unique payable amounts (fingerprints) among open orders — best for concurrent same-amount cashiers.",
  },
  {
    mode: "D",
    label: MATCHING_LABELS.D,
    blurb: "Requires guest memo/tag. Hidden on networks without memo support.",
  },
  {
    mode: "S",
    label: MATCHING_LABELS.S,
    blurb: "Main address unless same-amount conflict; then HD pool from xPub — also fits concurrent same amounts.",
  },
] as const;

/** True when the mode cannot be chosen in Phase 1 (currently Mode D only). */
export function matchingModeCardDisabled(mode: string): boolean {
  if (!(mode in MATCHING_LABELS)) return false;
  return !isMatchingModeSelectable(mode as MatchingMode);
}

/** Tooltip when a mode card is disabled; undefined when selectable. */
export function matchingModeDisabledReason(mode: string): string | undefined {
  if (!matchingModeCardDisabled(mode)) return undefined;
  if (mode === MatchingMode.D) return MODE_D_PHASE1_UNAVAILABLE_REASON;
  return undefined;
}

/** Tooltip — concurrent same-amount cashiers (merchant settlement). */
export const MATCHING_CONCURRENT_HELP =
  "Helping multiple cashiers at once: Standard mode allows only one open order per amount on your main receive address. If a second cashier needs the same amount while the first ticket is still open, they must wait until it is completed or cancelled. For busier desks, Amount fingerprint or Smart address handle this better — Smart address also needs an xPub configured on this page.";

/** Tooltip — Mode B underpay tolerance (merchant settlement). */
export const MATCHING_UNDERPAY_TOLERANCE_HELP =
  "How much less than the order amount you will still accept as paid. Example: 0.01 means a guest may be up to 0.01 short and the order can still complete. Use 0 to require the exact amount. If two open orders share the same amount, staff must review that case separately — this setting does not auto-choose between them.";

export function matchingModeLabel(mode: string | null | undefined): string {
  if (!mode) return MATCHING_LABELS.B;
  return MATCHING_LABELS[mode] ?? mode;
}

/** One-line summary for the create-order form (merchant-facing, no internal jargon). */
export function matchingModeCreateSummary(
  mode: string | null | undefined,
): string {
  const key = mode && MATCHING_LABELS[mode] ? mode : "B";
  const card = MATCHING_MODE_CARDS.find((c) => c.mode === key);
  return card?.blurb ?? MATCHING_MODE_CARDS[0].blurb;
}

export function matchingModeHint(mode: string | null | undefined): string {
  switch (mode) {
    case "C":
      return "Payable amount may differ slightly (fingerprint). Guest must send the exact amount shown on the payment page.";
    case "D":
      return "Guest must include the memo/tag shown on the payment page.";
    case "S":
      return "Uses the main settlement address unless a same-amount conflict requires an HD pool address.";
    default:
      return "Only one open order per amount on the main address. A second create is blocked until the first finishes or is cancelled; residual match collisions still become Payment Anomaly — never auto-completed.";
  }
}

/**
 * Plain-language tooltip for platform/merchant Matching “Mode” label.
 * Explains what matching is and what the current mode does for cashiers/ops.
 */
export function matchingModeTooltip(mode: string | null | undefined): string {
  const intro =
    "Matching decides how a guest’s on-chain payment is linked to an open payment order.";
  switch (mode) {
    case "C":
      return `${intro} Amount fingerprint: each open order gets a slightly unique payable amount so several cashiers can collect the same ticket price at once. Guests must send the exact amount shown.`;
    case "D":
      if (matchingModeCardDisabled("D")) {
        return MODE_D_PHASE1_UNAVAILABLE_REASON;
      }
      return `${intro} Memo tag: guests must include the memo/tag from the payment page (only on networks that support it). Wrong or missing memo is not auto-completed.`;
    case "S":
      return `${intro} Smart address: normally uses the merchant’s main receive address; if two open orders would collide on the same amount, PaymentGate assigns a temporary HD address from the merchant’s watch-only xPub.`;
    default:
      return `${intro} Standard (default): guests pay the merchant’s fixed receive address for the exact order amount. Only one open order per amount on that address — if two share the same amount, staff see a Payment Anomaly instead of PaymentGate guessing which order was paid.`;
  }
}

/** Short scope line for platform merchant settlement readout. */
export function matchingModeScope(mode: string | null | undefined): string {
  switch (mode) {
    case "C":
      return "Merchant receive · unique payable amounts among open orders";
    case "D":
      return "Merchant receive · memo or tag on supported networks";
    case "S":
      return "Merchant receive · main address, HD pool on same-amount conflict";
    default:
      return "Merchant receive · fixed settlement address only";
  }
}

export const VALIDITY_OPTIONS = [
  { label: "15 Minutes", seconds: 900 },
  { label: "30 Minutes (Recommended)", seconds: 1800 },
  { label: "60 Minutes", seconds: 3600 },
] as const;
