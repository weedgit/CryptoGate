import { useEffect, useMemo, useState } from "react";
import { type AssetNetworkConfig } from "@paymentgate/domain";
import { AssetIcon, NetworkIcon } from "../platform/cryptoIcons";
import { NetworkStatusLamp } from "../shared/NetworkStatusLamp";
import {
  computeOrderabilityLamp,
  pendingOrderabilityLamp,
  type NetworkLamp,
} from "../shared/networkLamp";
import { networkShortLabel, visibleRegistry } from "../shared/assetNetworks";
import {
  getNetworksStatus,
  type NetworkOrderabilityLamp,
} from "./api";

function shortContract(addr: string | null): string {
  if (!addr) return "Native";
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function asLamp(
  raw: NetworkOrderabilityLamp | NetworkLamp | undefined,
  row: AssetNetworkConfig,
  loaded: boolean,
): NetworkLamp {
  if (raw) return raw as NetworkLamp;
  if (!loaded) return pendingOrderabilityLamp(row.enabled);
  return computeOrderabilityLamp({
    enabled: row.enabled,
    maintenanceActive: false,
    ingestStatus: "unknown",
  });
}

/** Merchant view of Phase 1 asset/network catalog with orderability lamps. */
export function NetworksPage() {
  const pairs = useMemo(
    () =>
      [...visibleRegistry()].sort((a, b) => {
        const liveA = a.enabled ? 0 : 1;
        const liveB = b.enabled ? 0 : 1;
        if (liveA !== liveB) return liveA - liveB;
        return networkShortLabel(a.network).localeCompare(
          networkShortLabel(b.network),
        );
      }),
    [],
  );

  const [lampByPair, setLampByPair] = useState<Map<
    string,
    NetworkOrderabilityLamp
  > | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const status = await getNetworksStatus();
        if (cancelled) return;
        const byPair = new Map<string, NetworkOrderabilityLamp>();
        for (const net of status.items) {
          for (const pair of net.pairs) {
            byPair.set(`${pair.asset}:${net.network}`, pair.lamp);
          }
        }
        setLampByPair(byPair);
      } catch {
        if (!cancelled) setLampByPair(new Map());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="merchant-networks">
      <section className="merchant-networks__card">
        <header className="merchant-networks__card-head">
          <h2 className="merchant-networks__card-title">Asset pairs</h2>
          <span className="merchant-networks__card-pill">
            {pairs.length} pair{pairs.length === 1 ? "" : "s"}
          </span>
        </header>
        <div className="merchant-networks__table" role="table">
          <div className="merchant-networks__thead" role="row">
            <span>Asset</span>
            <span>Network</span>
            <span>Guest label</span>
            <span className="merchant-networks__status-head">Status</span>
            <span>Min amount</span>
            <span>Confirmations</span>
            <span>Contract</span>
          </div>
          {pairs.map((row) => {
            const lamp = asLamp(
              lampByPair?.get(`${row.asset}:${row.network}`),
              row,
              lampByPair !== null,
            );
            const dimmed = lamp.code === "off";
            return (
              <div
                key={`${row.asset}:${row.network}`}
                className={`merchant-networks__row${dimmed ? " is-dimmed" : ""}`}
                role="row"
              >
                <span className="merchant-networks__asset">
                  <AssetIcon asset={row.asset} />
                  {row.asset}
                </span>
                <span className="merchant-networks__net-cell">
                  <NetworkIcon network={row.network} />
                  {networkShortLabel(row.network)}
                </span>
                <span className="merchant-networks__guest">
                  {row.displayNetwork}
                </span>
                <span className="merchant-networks__status">
                  <NetworkStatusLamp lamp={lamp} />
                </span>
                <span className="merchant-networks__amount">
                  {row.minAmount} {row.asset}
                </span>
                <span className="merchant-networks__meta">
                  {row.requiredConfirmations}
                </span>
                <span
                  className="mono merchant-networks__contract"
                  title={row.contractAddress ?? undefined}
                >
                  {shortContract(row.contractAddress)}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
