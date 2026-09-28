import { useMemo, useState } from "react";
import { AssetIcon, NetworkIcon } from "../../platform/cryptoIcons";
import { FieldControl } from "../../ui/FieldControl";
import { SearchableSelect } from "../../ui/SearchableSelect";
import {
  defaultLivePair,
  isLivePair,
  pairsForAsset,
  uniqueAssetsFromRegistry,
} from "../../shared/assetNetworks";

export type AssetNetworkPicker = ReturnType<typeof useAssetNetworkPicker>;

/** Asset + network selection that only lands on live (enabled) networks. */
export function useAssetNetworkPicker() {
  const [initial] = useState(defaultLivePair);
  const [asset, setAsset] = useState<string>(initial.asset);
  const [network, setNetwork] = useState<string>(initial.network);

  const assetOptions = useMemo(
    () =>
      uniqueAssetsFromRegistry().map((a) => ({
        id: a,
        label: a,
        icon: <AssetIcon asset={a} />,
      })),
    [],
  );
  const pairs = useMemo(() => pairsForAsset(asset), [asset]);
  const networkOptions = useMemo(
    () =>
      pairs.map((row) => ({
        id: row.network,
        label: row.displayNetwork,
        hint: row.enabled ? undefined : "coming soon",
        icon: <NetworkIcon network={row.network} />,
      })),
    [pairs],
  );

  function changeAsset(next: string) {
    setAsset(next);
    const nextPairs = pairsForAsset(next);
    const live = nextPairs.find((p) => p.enabled) ?? nextPairs[0];
    if (live) setNetwork(live.network);
  }

  function changeNetwork(next: string) {
    const row = pairs.find((p) => p.network === next);
    if (row && !row.enabled) return;
    setNetwork(next);
  }

  return {
    asset,
    network,
    assetOptions,
    networkOptions,
    changeAsset,
    changeNetwork,
    live: isLivePair(asset, network),
  };
}

type Props = {
  picker: AssetNetworkPicker;
  idPrefix: string;
  ariaPrefix?: string;
  disabled?: boolean;
};

export function AssetNetworkFields({ picker, idPrefix, ariaPrefix = "", disabled }: Props) {
  return (
    <div className="plat-settlement__field-row">
      <label className="plat-settings__field" htmlFor={`${idPrefix}-asset`}>
        <span>Asset</span>
        <FieldControl leading={<AssetIcon asset={picker.asset} />}>
          <SearchableSelect
            id={`${idPrefix}-asset`}
            value={picker.asset}
            options={picker.assetOptions}
            onChange={picker.changeAsset}
            allowEmpty={false}
            disabled={disabled}
            ariaLabel={`${ariaPrefix}Asset`.trim()}
            hideTriggerIcon
          />
        </FieldControl>
      </label>
      <label className="plat-settings__field" htmlFor={`${idPrefix}-network`}>
        <span>Network</span>
        <FieldControl leading={<NetworkIcon network={picker.network} />}>
          <SearchableSelect
            id={`${idPrefix}-network`}
            value={picker.network}
            options={picker.networkOptions}
            onChange={picker.changeNetwork}
            allowEmpty={false}
            disabled={disabled}
            ariaLabel={`${ariaPrefix}Network`.trim()}
            hideTriggerIcon
          />
        </FieldControl>
      </label>
    </div>
  );
}
