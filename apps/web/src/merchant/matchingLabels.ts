export const MATCHING_LABELS: Record<string, string> = {
  B: "Standard",
  C: "Amount fingerprint",
  D: "Memo tag",
  S: "Smart address",
};

export function matchingModeLabel(mode: string | null | undefined): string {
  if (!mode) return MATCHING_LABELS.B;
  return MATCHING_LABELS[mode] ?? mode;
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
      return "Fixed settlement address. Same-amount collisions become Payment Anomaly — never auto-completed.";
  }
}

export const VALIDITY_OPTIONS = [
  { label: "15 Minutes", seconds: 900 },
  { label: "30 Minutes (Recommended)", seconds: 1800 },
  { label: "60 Minutes", seconds: 3600 },
] as const;
