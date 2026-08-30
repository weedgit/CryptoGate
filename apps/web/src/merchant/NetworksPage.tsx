import { useEffect, useMemo, useState } from "react";
import {
  resolveChainEnvironment,
  ChainEnvironment,
  type AssetNetworkConfig,
} from "@cryptogate/domain";
import { NetworkIcon } from "../platform/cryptoIcons";
import { NetworkStatusLamp } from "../shared/NetworkStatusLamp";
import {
  computeOrderabilityLamp,
  type NetworkLamp,
} from "../shared/networkLamp";
import {
  networkShortLabel,
  summarizeNetworks,
  visibleRegistry,
} from "../shared/assetNetworks";
import {
  getNetworksStatus,
  type NetworkOrderabilityLamp,
} from "./api";

function shortContract(addr: string | null): string {
  if (!addr) return "Native";
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function asLamp(raw: NetworkOrderabilityLamp | NetworkLamp | undefined, row: AssetNetworkConfig): NetworkLamp {
  if (raw) return raw as NetworkLamp;
  return computeOrderabilityLamp({
    enabled: row.enabled,
    maintenanceActive: false,
    ingestStatus: "unknown",
  });
}

/** Merchant view of Phase 1 asset/network catalog with orderability lamps. */
export function NetworksPage() {
  const chains = useMemo(() => summarizeNetworks(), []);
  const pairs = useMemo(
    () =>
      [...visibleRegistry()].sort((a, b) => {
        const liveA = a.enabled ? 0 : 1;
        const liveB = b.enabled ? 0 : 1;
        if (liveA !== liveB) return liveA - liveB;
        return networkShortLabel(a.network).localeCompare(networkShortLabel(b.network));
      }),
    [],
  );

  const [lampByNetwork, setLampByNetwork] = useState<Map<
    string,
    NetworkOrderabilityLamp
  > | null>(null);
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
        const byNet = new Map<string, NetworkOrderabilityLamp>();
        const byPair = new Map<string, NetworkOrderabilityLamp>();
        for (const net of status.items) {
          byNet.set(net.network, net.lamp);
          for (const pair of net.pairs) {
            byPair.set(`${pair.asset}:${net.network}`, pair.lamp);
          }
        }
        setLampByNetwork(byNet);
        setLampByPair(byPair);
      } catch {
        if (!cancelled) {
          setLampByNetwork(null);
          setLampByPair(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openCount = pairs.filter((p) => {
    const lamp = lampByPair?.get(`${p.asset}:${p.network}`);
    return (lamp?.code ?? (p.enabled ? "down" : "off")) === "open";
  }).length;
  const isTestnet = resolveChainEnvironment() === ChainEnvironment.Testnet;

  return (
    <div className="dash-page merchant-networks">
      <header className="dash-head">
        <div>
          <h1>Blockchain networks</h1>
          <p className="muted">
            {isTestnet
              ? "Local testnet catalog — not used in product builds. "
              : "Phase 1 mainnet catalog. "}
            Orderability lamp: Open can take payments; Paused is maintenance or degraded
            ingest; Down means watcher unhealthy; Off is not enabled.
            {lampByPair
              ? ` ${openCount} open pair${openCount === 1 ? "" : "s"} now.`
              : ""}
          </p>
        </div>
      </header>

      <section className="panel merchant-networks__chains">
        <h2>Networks</h2>
        <div className="merchant-networks__chain-grid">
          {chains.map((chain) => {
            const lamp =
              (lampByNetwork?.get(chain.network) as NetworkLamp | undefined) ??
              computeOrderabilityLamp({
                enabled: chain.liveCount > 0,
                maintenanceActive: false,
                ingestStatus: "unknown",
              });
            return (
              <article key={chain.network} className="merchant-networks__chain-card">
                <span className="merchant-networks__chain-icon" aria-hidden="true">
                  <NetworkIcon network={chain.network} />
                </span>
                <div>
                  <h3>{chain.title}</h3>
                  <p className="muted">
                    {chain.liveCount}/{chain.assetCount} asset
                    {chain.assetCount === 1 ? "" : "s"} enabled
                  </p>
                </div>
                <NetworkStatusLamp lamp={lamp} />
              </article>
            );
          })}
        </div>
      </section>

      <section className="panel merchant-networks__table-wrap">
        <h2>Asset pairs</h2>
        <div className="table-scroll">
          <table className="data-table merchant-networks__table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Network</th>
                <th>Guest label</th>
                <th>Status</th>
                <th>Min amount</th>
                <th>Confirmations</th>
                <th>Contract</th>
              </tr>
            </thead>
            <tbody>
              {pairs.map((row) => (
                <tr key={`${row.asset}:${row.network}`}>
                  <td>{row.asset}</td>
                  <td>
                    <span className="merchant-networks__net-cell">
                      <NetworkIcon network={row.network} />
                      {networkShortLabel(row.network)}
                    </span>
                  </td>
                  <td>{row.displayNetwork}</td>
                  <td>
                    <NetworkStatusLamp
                      lamp={asLamp(
                        lampByPair?.get(`${row.asset}:${row.network}`),
                        row,
                      )}
                    />
                  </td>
                  <td>
                    {row.minAmount} {row.asset}
                  </td>
                  <td>{row.requiredConfirmations}</td>
                  <td className="mono" title={row.contractAddress ?? undefined}>
                    {shortContract(row.contractAddress)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
