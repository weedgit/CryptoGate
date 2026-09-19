import { useMemo } from "react";
import { NetworkId, type AssetCode } from "@paymentgate/domain";
import { SearchableSelect, type SearchableSelectOption } from "../../ui/SearchableSelect";
import { AssetIcon, NetworkIcon } from "../cryptoIcons";
import { networkShortLabel, visibleRegistry } from "../../shared/assetNetworks";
import {
  emptyVolumeSelection,
  type VolumeSelection,
} from "../volumeFilter";

const ALL_NETWORKS = "all-networks";
const ALL_ASSETS = "all-assets";

type Props = {
  selection: VolumeSelection | null;
  onChange: (selection: VolumeSelection | null) => void;
};

function currentSelection(selection: VolumeSelection | null): VolumeSelection {
  return selection ?? emptyVolumeSelection();
}

function pairExists(
  rows: ReturnType<typeof visibleRegistry>,
  network: NetworkId | null,
  asset: AssetCode | null,
): boolean {
  if (!network || !asset) return true;
  return rows.some((row) => row.network === network && row.asset === asset);
}

/**
 * Cascading Network + Asset filters (exchange-style).
 * Choosing a network only lists assets that exist on it (no Ethereum + TRX).
 * Choosing an asset only lists networks that carry it.
 */
export function VolumeFilterSelect({ selection, onChange }: Props) {
  const sel = currentSelection(selection);
  const rows = useMemo(() => [...visibleRegistry()], []);

  const networkOptions = useMemo((): SearchableSelectOption[] => {
    const scoped = sel.asset
      ? rows.filter((row) => row.asset === sel.asset)
      : rows;
    const networks = new Map<NetworkId, string>();
    for (const row of scoped) {
      if (!networks.has(row.network)) {
        networks.set(row.network, networkShortLabel(row.network));
      }
    }
    const opts = [...networks.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, label]) => ({
        id,
        label,
        icon: <NetworkIcon network={id} />,
      }));
    return [{ id: ALL_NETWORKS, label: "All networks" }, ...opts];
  }, [rows, sel.asset]);

  const assetOptions = useMemo((): SearchableSelectOption[] => {
    const scoped = sel.network
      ? rows.filter((row) => row.network === sel.network)
      : rows;
    const byAsset = new Map<AssetCode, string[]>();
    for (const row of scoped) {
      const nets = byAsset.get(row.asset) ?? [];
      nets.push(networkShortLabel(row.network));
      byAsset.set(row.asset, nets);
    }
    const opts = [...byAsset.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([asset, nets]) => {
        const uniqueNets = [...new Set(nets)];
        return {
          id: asset,
          label: asset,
          hint:
            uniqueNets.length === 1
              ? uniqueNets[0]
              : `${uniqueNets.length} networks`,
          icon: <AssetIcon asset={asset} />,
        };
      });
    return [{ id: ALL_ASSETS, label: "Total Volume" }, ...opts];
  }, [rows, sel.network]);

  const emit = (next: VolumeSelection) => {
    if (!next.network && !next.asset) onChange(null);
    else onChange(next);
  };

  return (
    <div className="plat-volume-filter" role="group" aria-label="Volume filters">
      <SearchableSelect
        value={sel.network ?? ALL_NETWORKS}
        options={networkOptions}
        allowEmpty={false}
        ariaLabel="Network"
        menuMinWidth={200}
        onChange={(id) => {
          const network = id === ALL_NETWORKS ? null : (id as NetworkId);
          const asset =
            sel.asset && pairExists(rows, network, sel.asset) ? sel.asset : null;
          emit({ network, asset });
        }}
      />
      <SearchableSelect
        value={sel.asset ?? ALL_ASSETS}
        options={assetOptions}
        allowEmpty={false}
        ariaLabel="Asset"
        menuMinWidth={200}
        onChange={(id) => {
          const asset = id === ALL_ASSETS ? null : (id as AssetCode);
          const network =
            sel.network && pairExists(rows, sel.network, asset)
              ? sel.network
              : null;
          emit({ network, asset });
        }}
      />
    </div>
  );
}
