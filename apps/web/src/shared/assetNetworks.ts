import {
  listAssetNetworkRegistry,
  NetworkId,
  type AssetCode,
  type AssetNetworkConfig,
  getAssetNetworkConfig,
  resolveChainEnvironment,
  ChainEnvironment,
} from "@cryptogate/domain";

export type PairAvailability = "live" | "catalogued";

/** Short network names for dropdowns and tables (Phase 1 §VI / M3-04). */
export const NETWORK_SHORT_LABEL: Record<string, string> = {
  [NetworkId.Ethereum]: "Ethereum",
  [NetworkId.Tron]: "Tron",
  [NetworkId.TronNile]: "Tron Nile (testnet)",
  [NetworkId.BnbSmartChain]: "BNB Smart Chain",
  [NetworkId.Polygon]: "Polygon PoS",
  [NetworkId.ArbitrumOne]: "Arbitrum One",
  [NetworkId.Solana]: "Solana",
  [NetworkId.Ton]: "TON",
  [NetworkId.Base]: "Base",
  [NetworkId.Bitcoin]: "Bitcoin",
};

/** Visible registry for current chain env (mainnet product vs local testnet). */
export function visibleRegistry(): readonly AssetNetworkConfig[] {
  return listAssetNetworkRegistry();
}

export function chainEnvironmentLabel(): string {
  return resolveChainEnvironment() === ChainEnvironment.Testnet
    ? "testnet"
    : "mainnet";
}

export function networkShortLabel(network: string): string {
  return NETWORK_SHORT_LABEL[network] ?? network.replace(/_/g, " ");
}

export function pairAvailability(row: AssetNetworkConfig): PairAvailability {
  return row.enabled ? "live" : "catalogued";
}

export function pairAvailabilityLabel(row: AssetNetworkConfig): string {
  return pairAvailability(row) === "live" ? "Live" : "Coming soon";
}

export function pairSelectLabel(row: AssetNetworkConfig): string {
  const base = `${row.asset} · ${row.displayNetwork}`;
  return row.enabled ? base : `${base} (coming soon)`;
}

export function uniqueAssetsFromRegistry(): AssetCode[] {
  const seen = new Set<AssetCode>();
  for (const row of visibleRegistry()) {
    seen.add(row.asset);
  }
  return [...seen].sort();
}

export function pairsForAsset(asset: string): AssetNetworkConfig[] {
  return visibleRegistry().filter((row) => row.asset === asset);
}

export function findRegistryRow(
  asset: string,
  network: string,
): AssetNetworkConfig | undefined {
  return visibleRegistry().find(
    (row) => row.asset === asset && row.network === network,
  );
}

export function defaultLivePair(): AssetNetworkConfig {
  const rows = visibleRegistry();
  return rows.find((row) => row.enabled) ?? rows[0]!;
}

export function isLivePair(asset: string, network: string): boolean {
  return getAssetNetworkConfig(asset as AssetCode, network as NetworkId) != null;
}

export type NetworkSummary = {
  network: string;
  title: string;
  assetCount: number;
  liveCount: number;
};

/** One row per chain — for catalog pages and network pickers grouped by chain. */
export function summarizeNetworks(): NetworkSummary[] {
  const byNet = new Map<string, AssetNetworkConfig[]>();
  for (const row of visibleRegistry()) {
    const list = byNet.get(row.network) ?? [];
    list.push(row);
    byNet.set(row.network, list);
  }

  const summaries: NetworkSummary[] = [];
  for (const [network, rows] of byNet) {
    const live = rows.filter((r) => r.enabled);
    summaries.push({
      network,
      title: networkShortLabel(network),
      assetCount: rows.length,
      liveCount: live.length,
    });
  }

  return summaries.sort((a, b) => {
    if (a.liveCount !== b.liveCount) return b.liveCount - a.liveCount;
    return a.title.localeCompare(b.title);
  });
}

export function displayNetworkForPair(asset: string, network: string): string {
  return findRegistryRow(asset, network)?.displayNetwork ?? networkShortLabel(network);
}
