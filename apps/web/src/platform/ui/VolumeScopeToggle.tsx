import { AssetIcon, NetworkIcon } from "../cryptoIcons";
import {
  selectionSummary,
  type VolumeScope,
  type VolumeSelection,
} from "../volumeFilter";

type Props = {
  scope: VolumeScope;
  selection: VolumeSelection | null;
  onScopeChange: (scope: VolumeScope) => void;
};

function SelectionIcons({ selection }: { selection: VolumeSelection }) {
  if (selection.kind === "asset") {
    return <AssetIcon asset={selection.asset} />;
  }
  if (selection.kind === "network") {
    return <NetworkIcon network={selection.network} />;
  }
  return (
    <>
      <AssetIcon asset={selection.asset} />
      <NetworkIcon network={selection.network} />
    </>
  );
}

/** Total / Asset scope toggle + optional table selection chip. */
export function VolumeScopeToggle({ scope, selection, onScopeChange }: Props) {
  const selectionLabel = selectionSummary(selection);

  return (
    <div className="plat-volume-scope">
      <div className="plat-volume-scope__toggle" role="group" aria-label="Volume scope">
        <button
          type="button"
          className={`plat-volume-scope__btn${scope === "total" ? " is-on" : ""}`}
          aria-pressed={scope === "total"}
          onClick={() => onScopeChange("total")}
        >
          Total
        </button>
        <button
          type="button"
          className={`plat-volume-scope__btn${scope === "asset" ? " is-on" : ""}`}
          aria-pressed={scope === "asset"}
          title={
            selectionLabel
              ? `Filtered volume: ${selectionLabel}`
              : "Pick Network, Asset, or a row in the table"
          }
          onClick={() => onScopeChange("asset")}
        >
          Asset
        </button>
      </div>
      {scope === "asset" && selection && selectionLabel ? (
        <span
          className="plat-volume-scope__filter is-active"
          title={selectionLabel}
        >
          <SelectionIcons selection={selection} />
          <span className="plat-volume-scope__filter-text">{selectionLabel}</span>
        </span>
      ) : null}
    </div>
  );
}
