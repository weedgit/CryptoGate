import type { DashboardReports } from "../../shared/dashboardApi";
import { orderChannelLabel, type OrderChannelValue } from "../../shared/orderChannel";

export type ChannelRow = {
  key: OrderChannelValue | "unknown";
  label: string;
  count: number;
  volumeUsd: number;
  sharePct: number;
};

const ORDER: ChannelRow["key"][] = ["pos", "web", "api", "unknown"];

/** Channel breakdown in a fixed order; empty when nothing has a recorded channel. */
export function channelRows(byChannel: DashboardReports["byChannel"]): ChannelRow[] {
  const stats = byChannel ?? [];
  const total = stats.reduce((n, s) => n + s.count, 0);
  if (total === 0 || stats.every((s) => s.channel == null)) return [];
  const byKey = new Map<ChannelRow["key"], { count: number; volumeUsd: number }>();
  for (const s of stats) {
    const key = s.channel ?? "unknown";
    const prev = byKey.get(key) ?? { count: 0, volumeUsd: 0 };
    byKey.set(key, { count: prev.count + s.count, volumeUsd: prev.volumeUsd + s.volumeUsd });
  }
  return ORDER.filter((k) => byKey.has(k)).map((key) => {
    const s = byKey.get(key)!;
    return {
      key,
      label: orderChannelLabel(key === "unknown" ? null : key),
      count: s.count,
      volumeUsd: s.volumeUsd,
      sharePct: Math.round((s.count / total) * 100),
    };
  });
}
