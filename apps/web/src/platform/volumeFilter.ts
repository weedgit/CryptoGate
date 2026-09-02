import { NetworkId, type AssetCode } from "@paymentgate/domain";
import type { PaymentOrder } from "./api";

export type VolumeScope = "total" | "asset";

/** User pick from the network status table — one active at a time. */
export type VolumeSelection =
  | { kind: "pair"; asset: AssetCode; network: NetworkId }
  | { kind: "network"; network: NetworkId }
  | { kind: "asset"; asset: AssetCode };

export type VolumeChartFilter =
  | { scope: "all" }
  | { scope: "asset"; asset: AssetCode }
  | { scope: "network"; network: NetworkId }
  | { scope: "pair"; asset: AssetCode; network: NetworkId };

const NETWORK_LABEL: Record<string, string> = {
  [NetworkId.Ethereum]: "Ethereum",
  [NetworkId.Tron]: "Tron",
  [NetworkId.BnbSmartChain]: "BNB Smart Chain",
  [NetworkId.Polygon]: "Polygon PoS",
  [NetworkId.ArbitrumOne]: "Arbitrum One",
  [NetworkId.Solana]: "Solana",
  [NetworkId.Ton]: "TON",
  [NetworkId.Base]: "Base",
  [NetworkId.Bitcoin]: "Bitcoin",
};

export function networkChartLabel(network: NetworkId | string): string {
  return NETWORK_LABEL[network] ?? network;
}

export function volumeFilterFromSelection(
  scope: VolumeScope,
  selection: VolumeSelection | null,
): VolumeChartFilter {
  if (scope !== "asset" || !selection) return { scope: "all" };
  if (selection.kind === "asset") return { scope: "asset", asset: selection.asset };
  if (selection.kind === "network") return { scope: "network", network: selection.network };
  return {
    scope: "pair",
    asset: selection.asset,
    network: selection.network,
  };
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

export function selectionSummary(selection: VolumeSelection | null): string | null {
  if (!selection) return null;
  if (selection.kind === "asset") return selection.asset;
  if (selection.kind === "network") return networkChartLabel(selection.network);
  return `${selection.asset} · ${networkChartLabel(selection.network)}`;
}

export function isSameSelection(a: VolumeSelection, b: VolumeSelection): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "asset" && b.kind === "asset") return a.asset === b.asset;
  if (a.kind === "network" && b.kind === "network") return a.network === b.network;
  if (a.kind === "pair" && b.kind === "pair") {
    return a.asset === b.asset && a.network === b.network;
  }
  return false;
}

export type RowHighlight = {
  pairActive: boolean;
  matchActive: boolean;
  networkPick: boolean;
  assetPick: boolean;
};

export function rowHighlight(
  row: { asset: AssetCode; network: NetworkId },
  selection: VolumeSelection | null,
  scope: VolumeScope,
): RowHighlight {
  if (!selection) {
    return { pairActive: false, matchActive: false, networkPick: false, assetPick: false };
  }

  const filtering = scope === "asset";

  if (selection.kind === "pair") {
    const hit = row.asset === selection.asset && row.network === selection.network;
    return {
      pairActive: filtering && hit,
      matchActive: filtering && hit,
      networkPick: hit,
      assetPick: hit,
    };
  }

  if (selection.kind === "network") {
    const hit = row.network === selection.network;
    return {
      pairActive: false,
      matchActive: filtering && hit,
      networkPick: hit,
      assetPick: false,
    };
  }

  const hit = row.asset === selection.asset;
  return {
    pairActive: false,
    matchActive: filtering && hit,
    networkPick: false,
    assetPick: hit,
  };
}
