import { FormEvent, useState } from "react";
import { MfaStepUpGate } from "../../auth/MfaStepUpGate";
import { NetworkIcon } from "../../platform/cryptoIcons";
import { CopyableChainValue } from "../../shared/CopyableChainValue";
import { displayNetworkForPair } from "../../shared/assetNetworks";
import { SettlementSectionHead } from "../SettlementSectionHead";
import {
  ApiError,
  getSession,
  putSettlement,
  type Session,
  type SettlementAddress,
} from "../api";
import { truncateAddress } from "../org";
import { AssetNetworkFields, useAssetNetworkPicker } from "./AssetNetworkFields";
import type { SettlementNotify } from "./useSettlementData";

type PendingAddress = { asset: string; network: string; address: string };

type Props = {
  orgId: string;
  session: Session;
  addresses: SettlementAddress[];
  locked: boolean;
  notify: SettlementNotify;
  reloadAddresses: () => Promise<void>;
  onSessionRefresh?: (session: Session) => void;
};

function statusTone(status: string): string {
  return status === "pending_cool_down" ? "warn" : "ok";
}

function statusLabel(status: string): string {
  return status === "pending_cool_down" ? "Cool-down" : "Active";
}

export function SettlementAddressesCard({
  orgId,
  session,
  addresses,
  locked,
  notify,
  reloadAddresses,
  onSessionRefresh,
}: Props) {
  const picker = useAssetNetworkPicker();
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<PendingAddress | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const address = value.trim();
    if (locked || !address) return;
    notify.clear();
    setPending({ asset: picker.asset, network: picker.network, address });
  }

  async function verify(mfaCode: string) {
    if (!pending) return;
    setSaving(true);
    try {
      await putSettlement(orgId, { ...pending, mfaCode });
    } catch (err) {
      throw new Error(err instanceof ApiError ? err.message : "Save address failed");
    } finally {
      setSaving(false);
    }
    setValue("");
    notify.success("Settlement address saved — cool-down may apply");
    if (onSessionRefresh) {
      try {
        onSessionRefresh(await getSession());
      } catch {
        /* ignore */
      }
    }
    try {
      await reloadAddresses();
    } catch {
      notify.error("Address saved, but the list could not refresh — reload the page.");
    }
  }

  return (
    <section className="plat-settings__card plat-settlement__card plat-settlement__card--addresses">
      <SettlementSectionHead
        icon="wallet"
        title="Settlement addresses"
        subtitle="The wallet each asset and network pays out to."
      >
        <span className="plat-card-help plat-settlement__form-badge-help">
          <span className="plat-settings__badge plat-settlement__step-badge">
            MFA + cool-down
          </span>
          <span className="plat-card-help__tip" role="tooltip">
            Authenticator MFA required on save. Changes enter a cool-down before they
            become active.
          </span>
        </span>
      </SettlementSectionHead>
      <div className={`plat-settings__card-body${locked ? " is-readonly" : ""}`}>
        {!locked ? (
          <form
            className="plat-settings__payout-form plat-settlement__form"
            onSubmit={onSubmit}
          >
            <h3 className="plat-settlement__form-title">Add or change a wallet</h3>
            <AssetNetworkFields picker={picker} idPrefix="settlement" disabled={saving} />
            <label className="plat-settings__field">
              <span>Receive address</span>
              <input
                className="plat-settings__input mono"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
                disabled={saving}
                spellCheck={false}
                placeholder={`${picker.asset} address on selected network`}
              />
            </label>
            <div className="plat-settlement__form-actions">
              <button
                type="submit"
                className="btn-primary plat-settings__submit"
                disabled={saving || !picker.live}
              >
                Save settlement address
              </button>
            </div>
          </form>
        ) : null}

        <div className="plat-settlement__address-table">
          <h3 className="plat-settlement__form-title">
            Wallet addresses
            <span className="stl-count">{addresses.length}</span>
          </h3>
          <div className="plat-bills__table-wrap plat-settlement__table-wrap">
            {addresses.length === 0 ? (
              <p className="plat-bills__empty">No settlement addresses yet.</p>
            ) : (
              <table className="plat-bills__table plat-settlement__table">
                <thead>
                  <tr>
                    <th className="plat-settlement__table-idx" aria-hidden="true">
                      #
                    </th>
                    <th>Network</th>
                    <th>Active address</th>
                    <th>Pending</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {addresses.map((row, index) => (
                    <tr key={`${row.asset}-${row.network}`}>
                      <td className="plat-settlement__table-idx">{index + 1}</td>
                      <td>
                        <span className="plat-settlement__net">
                          <NetworkIcon network={row.network} />
                          <span>
                            <strong>{displayNetworkForPair(row.asset, row.network)}</strong>
                            <em>{row.asset}</em>
                          </span>
                        </span>
                      </td>
                      <td className="plat-settlement__addr plat-settlement__addr-value">
                        <CopyableChainValue
                          value={row.address}
                          network={row.network}
                          kind="address"
                          display={truncateAddress(row.address, 10, 8)}
                        />
                      </td>
                      <td className="plat-settlement__addr plat-settlement__addr-value muted">
                        {row.status === "pending_cool_down" && row.pendingAddress ? (
                          <CopyableChainValue
                            value={row.pendingAddress}
                            network={row.network}
                            kind="address"
                            display={truncateAddress(row.pendingAddress, 10, 8)}
                          />
                        ) : (
                          <span className="mono">—</span>
                        )}
                      </td>
                      <td>
                        <span className={`plat-bills__badge tone-${statusTone(row.status)}`}>
                          {statusLabel(row.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {pending ? (
        <MfaStepUpGate
          session={session}
          actionLabel="save settlement address"
          onClose={() => setPending(null)}
          onVerify={verify}
        />
      ) : null}
    </section>
  );
}
