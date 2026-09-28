import {
  getNetworksStatus,
  listActiveNetworkMaintenance,
  type ActiveNetworkMaintenance,
  type NetworkOrderabilityLamp,
} from "../api";

export async function loadNetworkMaintenance(): Promise<ActiveNetworkMaintenance[]> {
  try {
    return (await listActiveNetworkMaintenance()).items ?? [];
  } catch {
    return [];
  }
}

/** Keyed `${asset}:${network}`; empty map when status is unavailable. */
export async function loadNetworkLamps(): Promise<Map<string, NetworkOrderabilityLamp>> {
  const byPair = new Map<string, NetworkOrderabilityLamp>();
  try {
    const status = await getNetworksStatus();
    for (const net of status.items) {
      for (const pair of net.pairs) {
        byPair.set(`${pair.asset}:${net.network}`, pair.lamp);
      }
    }
  } catch {
    /* strip falls back to computed lamps */
  }
  return byPair;
}
