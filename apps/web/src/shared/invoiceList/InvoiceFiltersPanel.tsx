import { useMemo } from "react";
import type { OrgAccount } from "../../merchant/api";
import { AssetIcon, NetworkIcon } from "../../platform/cryptoIcons";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "../../ui/SearchableSelect";
import { enabledRegistry, NETWORK_SHORT_LABEL } from "../assetNetworks";
import type { InvoiceListVariant, InvoicePeriodId } from "../invoiceListModel";

type Props = {
  variant: InvoiceListVariant;
  cashierOnly: boolean;
  period: InvoicePeriodId;
  periodSelectOptions: SearchableSelectOption[];
  applyPeriod: (next: InvoicePeriodId) => void;
  utcDays: boolean;
  customFrom: string;
  customTo: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  agents: OrgAccount[];
  agentFilter: string;
  setAgentFilter: (id: string) => void;
  merchants: OrgAccount[];
  merchantFilter: string;
  setMerchantFilter: (id: string) => void;
  sitesForSelect: OrgAccount[];
  siteFilter: string;
  setSiteFilter: (id: string) => void;
  cashiers: { id: string; name: string }[];
  cashierOrgId: string | null;
  cashierFilter: string;
  setCashierFilter: (id: string) => void;
  assetFilter: string;
  setAssetFilter: (id: string) => void;
  networkFilter: string;
  setNetworkFilter: (id: string) => void;
  resetFilters: () => void;
};

export function InvoiceFiltersPanel({
  variant,
  cashierOnly,
  period,
  periodSelectOptions,
  applyPeriod,
  utcDays,
  customFrom,
  customTo,
  onFromChange,
  onToChange,
  agents,
  agentFilter,
  setAgentFilter,
  merchants,
  merchantFilter,
  setMerchantFilter,
  sitesForSelect,
  siteFilter,
  setSiteFilter,
  cashiers,
  cashierOrgId,
  cashierFilter,
  setCashierFilter,
  assetFilter,
  setAssetFilter,
  networkFilter,
  setNetworkFilter,
  resetFilters,
}: Props) {
  const assetSelectOptions = useMemo((): SearchableSelectOption[] => {
    const assets = [
      ...new Set(enabledRegistry().map((r) => r.asset)),
    ].sort();
    return [
      { id: "", label: "All assets" },
      ...assets.map((a) => ({
        id: a,
        label: a,
        icon: <AssetIcon asset={a} />,
      })),
    ];
  }, []);

  const networkSelectOptions = useMemo((): SearchableSelectOption[] => {
    const rows = enabledRegistry().filter((r) =>
      assetFilter ? r.asset === assetFilter : true,
    );
    const networks = [...new Set(rows.map((r) => r.network))].sort();
    return [
      { id: "", label: "All networks" },
      ...networks.map((n) => ({
        id: n,
        label: NETWORK_SHORT_LABEL[n] ?? n,
        icon: <NetworkIcon network={n} />,
      })),
    ];
  }, [assetFilter]);

  return (
    <aside className="invoice-list__filters-panel">
      <div className="invoice-list__filters-head">
        <span>Filters</span>
        <button
          type="button"
          className="invoice-list__filters-reset"
          onClick={resetFilters}
        >
          Reset
        </button>
      </div>
      <label className="invoice-list__field">
        <span>Period</span>
        <SearchableSelect
          value={period}
          options={periodSelectOptions}
          allowEmpty={false}
          ariaLabel="Period"
          menuMinWidth={200}
          menuClassName="invoice-list__select-menu"
          onChange={(id) => applyPeriod(id as InvoicePeriodId)}
        />
      </label>
      <label className="invoice-list__field">
        <span>From{utcDays ? " (UTC)" : ""}</span>
        <span className="invoice-list__date-wrap">
          <input
            className="invoice-list__select invoice-list__date"
            type="date"
            value={customFrom}
            max={customTo || undefined}
            onChange={(e) => onFromChange(e.target.value)}
            onWheel={(e) => e.currentTarget.blur()}
            aria-label="From date"
          />
          <span className="invoice-list__date-icon" aria-hidden>
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
              <rect
                x="2"
                y="3.5"
                width="12"
                height="10.5"
                rx="1.5"
                stroke="currentColor"
                strokeWidth="1.25"
              />
              <path
                d="M5 2v2.5M11 2v2.5M2 7h12"
                stroke="currentColor"
                strokeWidth="1.25"
                strokeLinecap="round"
              />
            </svg>
          </span>
        </span>
      </label>
      <label className="invoice-list__field">
        <span>To{utcDays ? " (UTC)" : ""}</span>
        <span className="invoice-list__date-wrap">
          <input
            className="invoice-list__select invoice-list__date"
            type="date"
            value={customTo}
            min={customFrom || undefined}
            onChange={(e) => onToChange(e.target.value)}
            onWheel={(e) => e.currentTarget.blur()}
            aria-label="To date"
          />
          <span className="invoice-list__date-icon" aria-hidden>
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
              <rect
                x="2"
                y="3.5"
                width="12"
                height="10.5"
                rx="1.5"
                stroke="currentColor"
                strokeWidth="1.25"
              />
              <path
                d="M5 2v2.5M11 2v2.5M2 7h12"
                stroke="currentColor"
                strokeWidth="1.25"
                strokeLinecap="round"
              />
            </svg>
          </span>
        </span>
      </label>
      <hr className="invoice-list__filters-rule" />
      {variant === "platform" ? (
        <label className="invoice-list__field">
          <span>Agent</span>
          <SearchableSelect
            value={agentFilter}
            options={[
              { id: "", label: "All agents" },
              ...agents.map((a) => ({ id: a.id, label: a.name })),
            ]}
            allowEmpty={false}
            ariaLabel="Agent"
            menuMinWidth={220}
            menuClassName="invoice-list__select-menu"
            onChange={(id) => {
              setAgentFilter(id);
              if (id) {
                setMerchantFilter("");
                setSiteFilter("");
                setCashierFilter("");
              }
            }}
          />
        </label>
      ) : null}
      {variant === "platform" ? (
        <label className="invoice-list__field">
          <span>Merchant</span>
          <SearchableSelect
            value={merchantFilter}
            options={[
              { id: "", label: "All merchants" },
              ...merchants.map((m) => ({ id: m.id, label: m.name })),
            ]}
            allowEmpty={false}
            ariaLabel="Merchant"
            menuMinWidth={220}
            menuClassName="invoice-list__select-menu"
            onChange={(id) => {
              setMerchantFilter(id);
              if (id) setAgentFilter("");
              setSiteFilter("");
              setCashierFilter("");
            }}
          />
        </label>
      ) : null}
      {variant !== "cashier" ? (
        <label className="invoice-list__field">
          <span>Site</span>
          <SearchableSelect
            value={siteFilter}
            options={[
              { id: "", label: "All sites" },
              ...sitesForSelect.map((s) => ({ id: s.id, label: s.name })),
            ]}
            allowEmpty={false}
            ariaLabel="Site"
            menuMinWidth={220}
            menuClassName="invoice-list__select-menu"
            onChange={(id) => {
              setSiteFilter(id);
              setCashierFilter("");
            }}
          />
        </label>
      ) : null}
      {!cashierOnly ? (
        <label className="invoice-list__field">
          <span>Cashier</span>
          <SearchableSelect
            value={cashierFilter}
            options={[
              {
                id: "",
                label:
                  variant === "platform" && !cashierOrgId
                    ? "None"
                    : "All cashiers",
              },
              ...cashiers.map((c) => ({ id: c.id, label: c.name })),
            ]}
            allowEmpty={false}
            ariaLabel="Cashier"
            disabled={!cashierOrgId && variant === "platform"}
            menuMinWidth={200}
            menuClassName="invoice-list__select-menu"
            onChange={(id) => setCashierFilter(id)}
          />
        </label>
      ) : null}
      {!cashierOnly ? (
        <hr className="invoice-list__filters-rule" />
      ) : null}
      <label className="invoice-list__field">
        <span>Asset</span>
        <SearchableSelect
          value={assetFilter}
          options={assetSelectOptions}
          allowEmpty={false}
          ariaLabel="Asset"
          menuMinWidth={200}
          menuClassName="invoice-list__select-menu"
          onChange={(id) => {
            setAssetFilter(id);
            setNetworkFilter("");
          }}
        />
      </label>
      <label className="invoice-list__field">
        <span>Network</span>
        <SearchableSelect
          value={networkFilter}
          options={networkSelectOptions}
          allowEmpty={false}
          ariaLabel="Network"
          menuMinWidth={220}
          menuClassName="invoice-list__select-menu"
          onChange={(id) => setNetworkFilter(id)}
        />
      </label>
    </aside>
  );
}
