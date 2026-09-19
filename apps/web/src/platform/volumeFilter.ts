import { NetworkId, type AssetCode } from "@paymentgate/domain";
import type { PaymentOrder } from "./api";

/**
 * Chart filter picks from the two volume dropdowns (and table row clicks).
 * Either field may be null — both null = Total Volume.
 */
export type VolumeSelection = {
  network: NetworkId | null;
  asset: AssetCode | null;
};

export type VolumeChartFilter =
  | { scope: "all" }
  | { scope: "asset"; asset: AssetCode }
  | { scope: "network"; network: NetworkId }
  | { scope: "pair"; asset: AssetCode; network: NetworkId };

const NETWORK_LABEL: Record<string, string> = {
  [NetworkId.Ethereum]: "Ethereum",
  [NetworkId.Tron]: "Tron",
  [NetworkId.TronNile]: "Tron Nile",
  [NetworkId.Solana]: "Solana",
};

export function networkChartLabel(network: NetworkId | string): string {
  return NETWORK_LABEL[network] ?? network;
}

export function emptyVolumeSelection(): VolumeSelection {
  return { network: null, asset: null };
}

export function isEmptyVolumeSelection(selection: VolumeSelection | null): boolean {
  return !selection || (!selection.network && !selection.asset);
}

export function volumeFilterFromSelection(
  selection: VolumeSelection | null,
): VolumeChartFilter {
  if (isEmptyVolumeSelection(selection)) return { scope: "all" };
  const { network, asset } = selection!;
  if (network && asset) return { scope: "pair", asset, network };
  if (network) return { scope: "network", network };
  return { scope: "asset", asset: asset! };
}

export function matchesVolumeFilter(
  order: PaymentOrder,
  filter: VolumeChartFilter,
): boolean {
  if (filter.scope === "all") return true;
  if (filter.scope === "asset") return order.asset === filter.asset;
  if (filter.scope === "network") return order.network === filter.network;
  return order.asset === filter.asset && order.network === filter.network;
}

/** Full title for maximize overlay / aria — e.g. "Volume" or "Volume (USDT · Tron)". */
export function chartTitleFromFilter(filter: VolumeChartFilter): string {
  const detail = chartFilterDetail(filter);
  return detail ? `Volume (${detail})` : "Volume";
}

/** Filter fragment only — shown under the Volume heading in the panel. */
export function chartFilterDetail(filter: VolumeChartFilter): string | null {
  if (filter.scope === "all") return null;
  if (filter.scope === "asset") return filter.asset;
  if (filter.scope === "network") return networkChartLabel(filter.network);
  return `${filter.asset} · ${networkChartLabel(filter.network)}`;
}

/** Asset code when filter pins a single asset (asset or pair). */
export function chartFilterAsset(
  filter: VolumeChartFilter,
): AssetCode | null {
  if (filter.scope === "asset" || filter.scope === "pair") return filter.asset;
  return null;
}

export function selectionSummary(selection: VolumeSelection | null): string | null {
  if (isEmptyVolumeSelection(selection)) return null;
  const { network, asset } = selection!;
  if (network && asset) return `${asset} · ${networkChartLabel(network)}`;
  if (network) return networkChartLabel(network);
  return asset;
}

export function isSameSelection(a: VolumeSelection, b: VolumeSelection): boolean {
  return a.network === b.network && a.asset === b.asset;
}

export type RowHighlight = {
  pairActive: boolean;
  matchActive: boolean;
};

export function rowHighlight(
  row: { asset: AssetCode; network: NetworkId },
  selection: VolumeSelection | null,
): RowHighlight {
  if (isEmptyVolumeSelection(selection)) {
    return { pairActive: false, matchActive: false };
  }
  const { network, asset } = selection!;
  const networkOk = !network || row.network === network;
  const assetOk = !asset || row.asset === asset;
  const hit = networkOk && assetOk;
  const pairHit = Boolean(network && asset && hit);
  return {
    pairActive: pairHit,
    matchActive: hit,
  };
}
