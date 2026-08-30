import { useEffect, useMemo, useState, type MouseEvent } from "react";
import {
  NetworkId,
  type AssetCode,
  type AssetNetworkConfig,
} from "@cryptogate/domain";
import { NetworkIcon } from "./cryptoIcons";
import { visibleRegistry } from "../shared/assetNetworks";
import { NetworkStatusLamp } from "../shared/NetworkStatusLamp";
import {
  computeOrderabilityLamp,
  NETWORK_LAMP_SORT_RANK,
  type NetworkLamp,
} from "../shared/networkLamp";
import { getNetworksStatus, type NetworkOrderabilityLamp } from "./api";
import {
  rowHighlight,
  type VolumeScope,
  type VolumeSelection,
} from "./volumeFilter";

/** Short network names for catalog tables (Plan §VI / M3-04). */
const NETWORK_SHORT_LABEL: Record<string, string> = {
  [NetworkId.Ethereum]: "Ethereum",
  [NetworkId.Tron]: "Tron",
  [NetworkId.TronNile]: "Tron Nile",
  [NetworkId.BnbSmartChain]: "BNB Smart Chain",
  [NetworkId.Polygon]: "Polygon PoS",
  [NetworkId.ArbitrumOne]: "Arbitrum One",
  [NetworkId.Solana]: "Solana",
  [NetworkId.Ton]: "TON",
  [NetworkId.Base]: "Base",
  [NetworkId.Bitcoin]: "Bitcoin",
};

type SortKey = "network" | "asset" | "status";
type SortDir = "asc" | "desc";

type SortState = {
  key: SortKey;
  dir: SortDir;
};

function networkLabel(row: AssetNetworkConfig): string {
  return NETWORK_SHORT_LABEL[row.network] ?? row.displayNetwork;
}

function rowKey(row: AssetNetworkConfig): string {
  return `${row.asset}:${row.network}`;
}

function fallbackLamp(row: AssetNetworkConfig): NetworkLamp {
  // Until /networks/status loads: enabled → Down (unknown ingest), else Off.
  return computeOrderabilityLamp({
    enabled: row.enabled,
    maintenanceActive: false,
    ingestStatus: "unknown",
  });
}

function lampForRow(
  row: AssetNetworkConfig,
  byPair: Map<string, NetworkOrderabilityLamp> | null,
): NetworkLamp {
  const fromApi = byPair?.get(rowKey(row));
  if (fromApi) return fromApi as NetworkLamp;
  return fallbackLamp(row);
}

function sortRows(
  rows: readonly AssetNetworkConfig[],
  sort: SortState | null,
  byPair: Map<string, NetworkOrderabilityLamp> | null,
): AssetNetworkConfig[] {
  if (!sort) return [...rows];

  const dir = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (sort.key === "network") {
      return dir * networkLabel(a).localeCompare(networkLabel(b));
    }
    if (sort.key === "asset") {
      return dir * a.asset.localeCompare(b.asset);
    }
    const rankA =
      NETWORK_LAMP_SORT_RANK[lampForRow(a, byPair).code] ?? 99;
    const rankB =
      NETWORK_LAMP_SORT_RANK[lampForRow(b, byPair).code] ?? 99;
    if (rankA !== rankB) return dir * (rankA - rankB);
    return dir * networkLabel(a).localeCompare(networkLabel(b));
  });
}

function ArrangeIcon({ dir }: { dir: SortDir | null }) {
  // Always render up + down chevrons; highlight the active direction.
  return (
    <span
      className={`plat-pair-table__arrange${dir ? " is-active" : " is-idle"}`}
      aria-hidden="true"
    >
      <svg
        className={`plat-pair-table__arrange-up${dir === "asc" ? " is-on" : ""}`}
        viewBox="0 0 8 4"
        aria-hidden="true"
      >
        <path
          d="M1.25 3.25 4 0.75 6.75 3.25"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <svg
        className={`plat-pair-table__arrange-down${dir === "desc" ? " is-on" : ""}`}
        viewBox="0 0 8 4"
        aria-hidden="true"
      >
        <path
          d="M1.25 0.75 4 3.25 6.75 0.75"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function SortHeader({
  label,
  sortKey,
  align,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  align?: "end" | "center";
  sort: SortState | null;
  onSort: (key: SortKey) => void;
}) {
  const active = sort?.key === sortKey;
  const ariaSort = active ? (sort.dir === "asc" ? "ascending" : "descending") : "none";

  return (
    <th
      className={[
        active ? "is-active" : "",
        align === "end" ? "plat-pair-table__th--end" : "",
        align === "center" ? "plat-pair-table__th--center" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-sort={ariaSort}
    >
      <button
        type="button"
        className={`plat-pair-table__th-btn${active ? " is-active" : ""}${
          align === "end" ? " plat-pair-table__th-btn--end" : ""
        }${align === "center" ? " plat-pair-table__th-btn--center" : ""}`}
        onClick={(event) => {
          event.stopPropagation();
          onSort(sortKey);
        }}
      >
        <span className="plat-pair-table__th-cluster">
          <span className="plat-pair-table__th-label">{label}</span>
          {/* Always show both chevrons so the control reads clearly when right-aligned */}
          <ArrangeIcon dir={active ? sort!.dir : null} />
        </span>
      </button>
    </th>
  );
}

type Props = {
  compact?: boolean;
  selection?: VolumeSelection | null;
  volumeScope?: VolumeScope;
  onSelect?: (selection: VolumeSelection) => void;
};

/** Single §VI catalog table: network, asset, orderability lamp. */
export function AssetNetworkTables({
  compact,
  selection = null,
  volumeScope = "total",
  onSelect,
}: Props) {
  const [sort, setSort] = useState<SortState | null>({ key: "status", dir: "asc" });
  const [lampByPair, setLampByPair] = useState<Map<
    string,
    NetworkOrderabilityLamp
  > | null>(null);
  const selectable = Boolean(onSelect);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const status = await getNetworksStatus();
        if (cancelled) return;
        const map = new Map<string, NetworkOrderabilityLamp>();
        for (const net of status.items) {
          for (const pair of net.pairs) {
            map.set(`${pair.asset}:${net.network}`, pair.lamp);
          }
        }
        setLampByPair(map);
      } catch {
        if (!cancelled) setLampByPair(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(
    () => sortRows([...visibleRegistry()], sort, lampByPair),
    [sort, lampByPair],
  );

  const onSort = (key: SortKey) => {
    setSort((prev) => {
      if (prev?.key !== key) return { key, dir: "asc" };
      return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
    });
  };

  const pickNetwork = (network: AssetNetworkConfig["network"], event: MouseEvent) => {
    event.stopPropagation();
    onSelect?.({ kind: "network", network });
  };

  const pickAsset = (asset: AssetCode, event: MouseEvent) => {
    event.stopPropagation();
    onSelect?.({ kind: "asset", asset });
  };

  const pickPair = (row: AssetNetworkConfig) => {
    onSelect?.({ kind: "pair", asset: row.asset, network: row.network });
  };

  return (
    <div
      className={`plat-pair-tables${compact ? " plat-pair-tables--compact" : ""}${
        selectable ? " plat-pair-tables--selectable" : ""
      }`}
    >
      <table className={`plat-pair-table${compact ? " plat-pair-table--compact" : ""}`}>
        <colgroup>
          <col className="plat-pair-table__col-network" />
          <col className="plat-pair-table__col-asset" />
          <col className="plat-pair-table__col-status" />
        </colgroup>
        <thead>
          <tr>
            <SortHeader label="Network" sortKey="network" sort={sort} onSort={onSort} />
            <SortHeader
              label="Asset"
              sortKey="asset"
              align="center"
              sort={sort}
              onSort={onSort}
            />
            <SortHeader
              label="Status"
              sortKey="status"
              align="end"
              sort={sort}
              onSort={onSort}
            />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const lamp = lampForRow(row, lampByPair);
            const hl = rowHighlight(row, selection, volumeScope);

            return (
              <tr
                key={rowKey(row)}
                className={[
                  selectable ? "plat-pair-row--selectable" : "",
                  hl.pairActive ? "is-active" : "",
                  hl.matchActive ? "is-match" : "",
                  hl.networkPick || hl.assetPick ? "is-picked" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={selectable ? () => pickPair(row) : undefined}
                onKeyDown={
                  selectable
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          pickPair(row);
                        }
                      }
                    : undefined
                }
                tabIndex={selectable ? 0 : undefined}
                aria-label={
                  selectable
                    ? `Filter volume for ${row.asset} on ${networkLabel(row)}`
                    : undefined
                }
              >
                <td
                  className={`plat-pair-network-cell${hl.networkPick ? " is-pick" : ""}`}
                  onClick={selectable ? (event) => pickNetwork(row.network, event) : undefined}
                  title={selectable ? `All assets on ${networkLabel(row)}` : undefined}
                >
                  <span className="plat-pair-cell">
                    <NetworkIcon network={row.network} />
                    <span>{networkLabel(row)}</span>
                  </span>
                </td>
                <td
                  className={`plat-pair-asset-cell${hl.assetPick ? " is-pick" : ""}`}
                  onClick={selectable ? (event) => pickAsset(row.asset, event) : undefined}
                  title={selectable ? `All ${row.asset} networks` : undefined}
                >
                  {row.asset}
                </td>
                <td className="plat-pair-status-cell">
                  <NetworkStatusLamp
                    lamp={lamp}
                    className="plat-pair-status-lamp"
                    title="Orderability — Open means this pair can accept payments now"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
