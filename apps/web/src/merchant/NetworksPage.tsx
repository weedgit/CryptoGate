import { useMemo } from "react";
import {
  resolveChainEnvironment,
  ChainEnvironment,
  type AssetNetworkConfig,
} from "@cryptogate/domain";
import { NetworkIcon } from "../platform/cryptoIcons";
import { StatusBadge } from "../shared/StatusBadge";
import {
  networkShortLabel,
  pairAvailability,
  pairAvailabilityLabel,
  summarizeNetworks,
  visibleRegistry,
} from "../shared/assetNetworks";

function shortContract(addr: string | null): string {
  if (!addr) return "Native";
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function PairStatusBadge({ row }: { row: AssetNetworkConfig }) {
  const tone = pairAvailability(row) === "live" ? "ok" : "muted";
  return <StatusBadge tone={tone}>{pairAvailabilityLabel(row)}</StatusBadge>;
}

/** Merchant view of Phase 1 asset/network catalog (read-only). */
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

  const liveCount = pairs.filter((p) => p.enabled).length;
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
            {liveCount} live pair{liveCount === 1 ? "" : "s"}
            {pairs.length > liveCount
              ? `, ${pairs.length - liveCount} coming soon`
              : ""}
            . Only live pairs accept payment orders.
          </p>
        </div>
      </header>

      <section className="panel merchant-networks__chains">
        <h2>Networks</h2>
        <div className="merchant-networks__chain-grid">
          {chains.map((chain) => (
            <article key={chain.network} className="merchant-networks__chain-card">
              <span className="merchant-networks__chain-icon" aria-hidden="true">
                <NetworkIcon network={chain.network} />
              </span>
              <div>
                <h3>{chain.title}</h3>
                <p className="muted">
                  {chain.liveCount}/{chain.assetCount} asset
                  {chain.assetCount === 1 ? "" : "s"} live
                </p>
              </div>
              <StatusBadge tone={chain.liveCount > 0 ? "ok" : "muted"}>
                {chain.liveCount > 0 ? "Active" : "Catalogued"}
              </StatusBadge>
            </article>
          ))}
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
                    <PairStatusBadge row={row} />
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
