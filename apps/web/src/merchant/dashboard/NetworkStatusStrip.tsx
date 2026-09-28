import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { ActiveNetworkMaintenance, NetworkOrderabilityLamp } from "../api";
import { AssetIcon, NetworkIcon } from "../../platform/cryptoIcons";
import { networkShortLabel, visibleRegistry } from "../../shared/assetNetworks";
import { NetworkStatusLamp } from "../../shared/NetworkStatusLamp";
import {
  computeOrderabilityLamp,
  pendingOrderabilityLamp,
  type NetworkLamp,
} from "../../shared/networkLamp";
import { merchantRoute } from "../../shared/portalRouting";

type Props = {
  /** null while network status is still loading. */
  lampByPair: Map<string, NetworkOrderabilityLamp> | null;
  maintenance: ActiveNetworkMaintenance[];
  /** Omit the "View networks" link when the route is not available. */
  showNetworksLink?: boolean;
};

export function NetworkStatusStrip({
  lampByPair,
  maintenance,
  showNetworksLink = true,
}: Props) {
  const networkPairs = useMemo(() => {
    return [...visibleRegistry()]
      .filter((p) => p.enabled)
      .sort((a, b) =>
        networkShortLabel(a.network).localeCompare(networkShortLabel(b.network)),
      );
  }, []);

  if (networkPairs.length === 0) return null;

  return (
    <section className="merchant-dash__networks" aria-label="Network status">
      <div className="plat-dash-merchants__head">
        <h2>Network status</h2>
        {showNetworksLink ? (
          <Link className="plat-dash-merchants__all" to={merchantRoute("networks")}>
            View networks
          </Link>
        ) : null}
      </div>
      <div className="merchant-dash__net-strip">
        {networkPairs.map((pair) => {
          const lamp: NetworkLamp = lampByPair
            ? ((lampByPair.get(`${pair.asset}:${pair.network}`) ??
                computeOrderabilityLamp({
                  enabled: pair.enabled,
                  maintenanceActive: maintenance.some(
                    (m) => m.network === pair.network,
                  ),
                  ingestStatus: "unknown",
                })) as NetworkLamp)
            : pendingOrderabilityLamp(pair.enabled);
          return (
            <div
              key={`${pair.asset}:${pair.network}`}
              className="merchant-dash__net-chip"
            >
              <span className="merchant-dash__net-chip-icons">
                <AssetIcon asset={pair.asset} />
                <NetworkIcon network={pair.network} />
              </span>
              <span className="merchant-dash__net-chip-text">
                <span className="merchant-dash__net-chip-title">
                  {pair.asset} · {networkShortLabel(pair.network)}
                </span>
                <NetworkStatusLamp lamp={lamp} />
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
