export type OrderChannelValue = "web" | "pos" | "api";
export type OrderChannelFilter = OrderChannelValue | "unknown" | "";

export const ORDER_CHANNEL_FILTERS: readonly OrderChannelFilter[] = [
  "",
  "pos",
  "web",
  "api",
  "unknown",
];

export function orderChannelLabel(via: OrderChannelValue | null | undefined): string {
  if (via === "pos") return "POS";
  if (via === "web") return "Web";
  if (via === "api") return "API";
  return "Unknown";
}

export function orderChannelFilterLabel(value: OrderChannelFilter): string {
  if (value === "") return "All channels";
  if (value === "unknown") return "Unknown";
  return orderChannelLabel(value);
}

export function parseOrderChannelFilter(raw: string | null | undefined): OrderChannelFilter {
  const v = (raw ?? "").trim().toLowerCase();
  return v === "pos" || v === "web" || v === "api" || v === "unknown" ? v : "";
}
