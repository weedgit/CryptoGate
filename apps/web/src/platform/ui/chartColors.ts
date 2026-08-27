/** Metric spark accents — distinct on dark dashboard; volume chart stays teal. */
export const METRIC_CHART_COLORS = {
  accounts: "#38bdf8",
  invoices: "#818cf8",
  fees: "#fbbf24",
  agent: "#2dd4bf",
  merchant: "#fb923c",
} as const;

const ORG_PALETTE = [
  "#2dd4bf",
  "#fb923c",
  "#38bdf8",
  "#f472b6",
  "#a3e635",
  "#22d3ee",
  "#e879f9",
  "#60a5fa",
  "#facc15",
  "#f87171",
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
  if (!Number.isFinite(n)) return `rgba(52, 211, 153, ${alpha})`;
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
  return ORG_PALETTE[idx] ?? (kind === "agent"
    ? METRIC_CHART_COLORS.agent
    : METRIC_CHART_COLORS.merchant);
}
