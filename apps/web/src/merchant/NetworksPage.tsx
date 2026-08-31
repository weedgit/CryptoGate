import { useEffect, useMemo, useState } from "react";
import { type AssetNetworkConfig } from "@cryptogate/domain";
import { AssetIcon, NetworkIcon } from "../platform/cryptoIcons";
import { NetworkStatusLamp } from "../shared/NetworkStatusLamp";
import {
  computeOrderabilityLamp,
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
): NetworkLamp {
  if (raw) return raw as NetworkLamp;
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
        if (!cancelled) setLampByPair(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const { openCount, pausedCount } = useMemo(() => {
    let open = 0;
    let paused = 0;
    for (const row of pairs) {
      const code = asLamp(
        lampByPair?.get(`${row.asset}:${row.network}`),
        row,
      ).code;
      if (code === "open") open += 1;
      else if (code === "paused") paused += 1;
    }
    return { openCount: open, pausedCount: paused };
  }, [pairs, lampByPair]);

  return (
    <div className="merchant-networks">
      <div className="merchant-networks__kpis">
        <article className="merchant-networks__kpi merchant-networks__kpi--total">
          <div className="merchant-networks__kpi-top">
            <span className="merchant-networks__kpi-icon" aria-hidden>
              <svg viewBox="0 0 20 20" width="20" height="20" fill="none">
                <path
                  d="M3.5 16.5V8.5l6.5-4.5 6.5 4.5v8H3.5Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
                <path
                  d="M8 16.5v-4.5h4v4.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="merchant-networks__kpi-label">Total pairs</span>
          </div>
          <p className="merchant-networks__kpi-value">{pairs.length}</p>
        </article>
        <article className="merchant-networks__kpi merchant-networks__kpi--open">
          <div className="merchant-networks__kpi-top">
            <span className="merchant-networks__kpi-icon" aria-hidden>
              <svg viewBox="0 0 20 20" width="20" height="20" fill="none">
                <circle
                  cx="10"
                  cy="10"
                  r="6.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path
                  d="M6.8 10.2 9 12.4l4.4-5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="merchant-networks__kpi-label">Open</span>
          </div>
          <p className="merchant-networks__kpi-value">{openCount}</p>
        </article>
        <article
          className={`merchant-networks__kpi merchant-networks__kpi--paused${
            pausedCount > 0 ? " is-alert" : ""
          }`}
        >
          <div className="merchant-networks__kpi-top">
            <span className="merchant-networks__kpi-icon" aria-hidden>
              <svg viewBox="0 0 20 20" width="20" height="20" fill="none">
                <circle
                  cx="10"
                  cy="10"
                  r="6.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path
                  d="M8.2 7.5v5M11.8 7.5v5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="merchant-networks__kpi-label">Paused</span>
          </div>
          <p className="merchant-networks__kpi-value">{pausedCount}</p>
        </article>
      </div>

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
