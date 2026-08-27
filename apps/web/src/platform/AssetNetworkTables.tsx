import { useMemo, useState, type MouseEvent } from "react";
import {
  ASSET_NETWORK_REGISTRY,
  NetworkId,
  type AssetCode,
  type AssetNetworkConfig,
} from "@cryptogate/domain";
import { NetworkIcon } from "./cryptoIcons";
import {
  rowHighlight,
  type VolumeScope,
  type VolumeSelection,
} from "./volumeFilter";

/** Short network names for catalog tables (Plan §VI / M3-04). */
const NETWORK_SHORT_LABEL: Record<string, string> = {
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

type SortKey = "network" | "asset" | "status";
type SortDir = "asc" | "desc";

type SortState = {
  key: SortKey;
  dir: SortDir;
};

type PairStatus = {
  label: string;
  tone: "ok" | "warn" | "muted";
};

function networkLabel(row: AssetNetworkConfig): string {
  return NETWORK_SHORT_LABEL[row.network] ?? row.displayNetwork;
}

function rowKey(row: AssetNetworkConfig): string {
  return `${row.asset}:${row.network}`;
}

/** Watcher / checkout posture from registry — no fake uptime for unbuilt chains. */
function pairStatus(row: AssetNetworkConfig): PairStatus {
  if (row.enabled) return { label: "Live", tone: "ok" };
  if (row.asset === "USDT" && row.network === NetworkId.Ethereum) {
    return { label: "Staging", tone: "warn" };
  }
  return { label: "Catalogued", tone: "muted" };
}

const STATUS_SORT_RANK: Record<string, number> = {
  Live: 0,
  Staging: 1,
  Catalogued: 2,
};

function sortRows(rows: readonly AssetNetworkConfig[], sort: SortState | null): AssetNetworkConfig[] {
  if (!sort) return [...rows];

  const dir = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (sort.key === "network") {
      return dir * networkLabel(a).localeCompare(networkLabel(b));
    }
    if (sort.key === "asset") {
      return dir * a.asset.localeCompare(b.asset);
    }
    const rankA = STATUS_SORT_RANK[pairStatus(a).label] ?? 99;
    const rankB = STATUS_SORT_RANK[pairStatus(b).label] ?? 99;
    if (rankA !== rankB) return dir * (rankA - rankB);
    return dir * networkLabel(a).localeCompare(networkLabel(b));
  });
}

function ArrangeIcon({ dir }: { dir: SortDir | null }) {
  const showUp = dir === null || dir === "asc";
  const showDown = dir === null || dir === "desc";

  return (
    <span
      className={`plat-pair-table__arrange${dir ? " is-active" : " is-idle"}`}
      aria-hidden="true"
    >
      {showUp ? (
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
      ) : null}
      {showDown ? (
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
      ) : null}
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
  align?: "end";
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
      ]
        .filter(Boolean)
        .join(" ")}
      aria-sort={ariaSort}
    >
      <button
        type="button"
        className={`plat-pair-table__th-btn${active ? " is-active" : ""}`}
        onClick={(event) => {
          event.stopPropagation();
          onSort(sortKey);
        }}
      >
        <span>{label}</span>
        <ArrangeIcon dir={active ? sort!.dir : null} />
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

/** Single §VI catalog table: network, asset, status (one style for all pairs). */
export function AssetNetworkTables({
  compact,
  selection = null,
  volumeScope = "total",
  onSelect,
}: Props) {
  const [sort, setSort] = useState<SortState | null>({ key: "status", dir: "asc" });
  const selectable = Boolean(onSelect);

  const rows = useMemo(
    () => sortRows(ASSET_NETWORK_REGISTRY, sort),
    [sort],
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
            <SortHeader label="Asset" sortKey="asset" sort={sort} onSort={onSort} />
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
            const status = pairStatus(row);
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
                  <span
                    className={`plat-pair-status${
                      status.label === "Live" ? " plat-pair-status--live" : ""
                    }`}
                  >
                    <span
                      className={`plat-pair-status__label${
                        status.label === "Live" ? " plat-pair-status__label--live" : ""
                      }`}
                    >
                      {status.label}
                    </span>
                    <span
                      className={`health-dot ${status.tone === "muted" ? "" : status.tone}`}
                      aria-hidden="true"
                    />
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
