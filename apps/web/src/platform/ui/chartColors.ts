/** Metric spark accents — matched to doc/image/dashboard-metric.png. */
export const METRIC_CHART_COLORS = {
  /** Soft indigo-violet (Invoices) */
  invoices: "#9c84f0",
  /** Bright gold (Fees) */
  fees: "#fcd818",
  /** Cyan (Account count) */
  accounts: "#30d8fc",
  /** Teal (agent fallback) */
  agent: "#2dd4bf",
  /** Lime (merchant cards in mockup) */
  merchant: "#78a848",
} as const;

const ORG_PALETTE = [
  "#78a848",
  "#f084cc",
  "#30d8fc",
  "#9c84f0",
  "#fcd818",
  "#2dd4bf",
  "#e879f9",
  "#60a5fa",
  "#f472b6",
  "#a3e635",
] as const;

export function hexToRgba(hex: string, alpha: number): string {
  const raw = hex.replace("#", "").trim();
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return `rgba(156, 132, 240, ${alpha})`;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hashHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return h;
}

/** Stable accent for org overview cards (agent / merchant). */
export function orgMetricChartColor(
  overviewId: string,
  kind: "agent" | "merchant",
): string {
  const idx = hashHue(`${kind}:${overviewId}`) % ORG_PALETTE.length;
  return (
    ORG_PALETTE[idx] ??
    (kind === "agent"
      ? METRIC_CHART_COLORS.agent
      : METRIC_CHART_COLORS.merchant)
  );
}
