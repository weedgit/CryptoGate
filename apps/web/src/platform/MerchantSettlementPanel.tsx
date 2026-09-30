import { useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { OrgEditWaves } from "../shared/OrgEditWaves";
import { ChainEnvironment, isTronReceiveAddress } from "@paymentgate/domain";
import { ApiError, type SettlementAddress } from "./api";
import { putSettlement, type Session } from "../merchant/api";
import { MfaStepUpGate } from "../auth/MfaStepUpGate";
import { CopyableChainValue } from "../shared/CopyableChainValue";
import { CopyGlyph } from "../shared/CopyGlyph";
import { enabledRegistry, networkShortLabel } from "../shared/assetNetworks";
import { FieldControl } from "../ui/FieldControl";
import { NetworkIcon } from "./cryptoIcons";

/** One settlement wallet per network; it receives every listed asset. */
export type SettlementNetworkRow = {
  network: string;
  label: string;
  placeholder: string;
  assets: string[];
  testnetBadge?: boolean;
};

const NETWORK_PLACEHOLDER: Record<string, string> = {
  tron: "Tron address (starts with T)",
  tron_nile: "Tron Nile address (starts with T)",
  ethereum: "Ethereum address (starts with 0x)",
  solana: "Solana address",
};

/** Native coin first, then tokens A–Z (ETH · USDC · USDT). */
const NATIVE_ASSETS = new Set(["ETH", "TRX", "SOL"]);

function compareAssets(a: string, b: string): number {
  const na = NATIVE_ASSETS.has(a) ? 0 : 1;
  const nb = NATIVE_ASSETS.has(b) ? 0 : 1;
  return na - nb || a.localeCompare(b);
}

/** Live networks (4 on testnet with Tron Nile, 3 on mainnet), each with its assets. */
export function settlementNetworkRows(): SettlementNetworkRow[] {
  const byNetwork = new Map<string, SettlementNetworkRow>();
  for (const row of enabledRegistry()) {
    const existing = byNetwork.get(row.network);
    if (existing) {
      if (!existing.assets.includes(row.asset)) existing.assets.push(row.asset);
      continue;
    }
    byNetwork.set(row.network, {
      network: row.network,
      label: networkShortLabel(row.network).replace(/\s*\(testnet\)$/i, ""),
      placeholder: NETWORK_PLACEHOLDER[row.network] ?? "Wallet address",
      assets: [row.asset],
      testnetBadge: row.chainEnv === ChainEnvironment.Testnet,
    });
  }
  return [...byNetwork.values()].map((row) => ({
    ...row,
    assets: [...row.assets].sort(compareAssets),
  }));
}

type NetworkWallet = {
  address: string;
  pendingAddress: string;
  pending: boolean;
  mixed: boolean;
};

/** Collapses the per-asset rows of one network into its single wallet. */
function networkWallet(settlement: SettlementAddress[], network: string): NetworkWallet {
  const entries = settlement.filter((row) => row.network === network);
  const active = [...new Set(entries.map((row) => row.address?.trim() ?? "").filter(Boolean))];
  const pendingEntry = entries.find(
    (row) => row.status === "pending_cool_down" && row.pendingAddress?.trim(),
  );
  return {
    address: active[0] ?? "",
    pendingAddress: pendingEntry?.pendingAddress?.trim() ?? "",
    pending: Boolean(pendingEntry),
    mixed: active.length > 1,
  };
}

function walletAddressOk(network: string, value: string): boolean {
  const address = value.trim();
  if (!address) return false;
  if (network === "tron" || network === "tron_nile") {
    return isTronReceiveAddress(address);
  }
  if (network === "ethereum") return /^0x[a-fA-F0-9]{40}$/.test(address);
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

function ConfigureGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
      <path
        d="M3 12.5h2.8L12.8 5.5 10.5 3.2 3 10.7v1.8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      <path
        d="M8.8 4l2.8 2.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
    </svg>
  );
}

function EditGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
      <path
        d="M9.2 3.2 12.8 6.8 5.5 14.1 2 14.6 2.5 11.1 9.2 3.2Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M8.2 4.2 11.8 7.8" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function SettlementCopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const address = value.trim();

  async function copy() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      className={`b3-settlement__icon-btn${copied ? " is-copied" : ""}`}
      disabled={!address}
      onClick={() => void copy()}
      aria-label={copied ? "Address copied" : "Copy wallet address"}
      title={copied ? "Copied" : "Copy"}
    >
      <CopyGlyph copied={copied} />
    </button>
  );
}

function SettlementHeadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect
        x="2.2"
        y="4"
        width="11.6"
        height="8.2"
        rx="1.6"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M2.2 6.8h11.6M5 9.4h3.2"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function WalletModalMarkIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="3.5"
        y="6.5"
        width="17"
        height="12"
        rx="2.2"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M3.5 10h17"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="16.2" cy="14.2" r="1.35" fill="currentColor" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 5.5A1.5 1.5 0 0 1 6.5 4h9.2L19.5 7.8V18.5A1.5 1.5 0 0 1 18 20H6.5A1.5 1.5 0 0 1 5 18.5v-13Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M8 4.5V9h6" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M8 20v-5.2h8V20" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function ModalCloseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
    </svg>
  );
}

type EditTarget = {
  network: string;
  address: string;
  mode: "configure" | "edit";
};

type Props = {
  orgId: string;
  session: Session;
  canManage: boolean;
  settlement: SettlementAddress[];
  loading: boolean;
  onSettlementChange: (rows: SettlementAddress[]) => void;
  onSaved?: (saved: SettlementAddress) => void;
};

export function MerchantSettlementPanel({
  orgId,
  session,
  canManage,
  settlement,
  loading,
  onSettlementChange,
  onSaved,
}: Props) {
  const rows = useMemo(() => settlementNetworkRows(), []);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [draftAddress, setDraftAddress] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [pendingSave, setPendingSave] = useState<EditTarget | null>(null);
  const [saving, setSaving] = useState(false);
  const titleId = useId();

  const walletByNetwork = useMemo(() => {
    const map = new Map<string, NetworkWallet>();
    for (const row of rows) map.set(row.network, networkWallet(settlement, row.network));
    return map;
  }, [rows, settlement]);

  const configuredCount = rows.filter((row) =>
    Boolean(walletByNetwork.get(row.network)?.address),
  ).length;

  function openEditor(row: SettlementNetworkRow, mode: EditTarget["mode"]) {
    const current = walletByNetwork.get(row.network)?.address ?? "";
    setEditTarget({ network: row.network, address: current, mode });
    setDraftAddress(current);
    setDraftError(null);
  }

  function requestSave() {
    if (!editTarget) return;
    const next = draftAddress.trim();
    if (!walletAddressOk(editTarget.network, next)) {
      setDraftError("Enter a valid wallet address for this network.");
      return;
    }
    const prev = editTarget.address.trim();
    if (next === prev && !walletByNetwork.get(editTarget.network)?.mixed) {
      setEditTarget(null);
      return;
    }
    setDraftError(null);
    setPendingSave({ ...editTarget, address: next });
    setEditTarget(null);
  }

  async function saveWithMfa(mfaCode: string) {
    if (!pendingSave) return;
    setSaving(true);
    setDraftError(null);
    try {
      const { items, ...saved } = await putSettlement(orgId, {
        network: pendingSave.network,
        address: pendingSave.address.trim(),
        mfaCode,
      });
      const savedRows = items?.length ? items : [saved];
      const savedKeys = new Set(savedRows.map((row) => `${row.asset}:${row.network}`));
      onSettlementChange([
        ...settlement.filter((row) => !savedKeys.has(`${row.asset}:${row.network}`)),
        ...savedRows,
      ]);
      setPendingSave(null);
      onSaved?.(saved);
    } catch (err) {
      setDraftError(
        err instanceof ApiError ? err.message : "Failed to save wallet address",
      );
      setEditTarget(pendingSave);
      setDraftAddress(pendingSave.address);
      setPendingSave(null);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="b3-agent-detail__empty" role="status">
        <div className="b3-agent-detail__empty-mark is-busy" aria-hidden>
          <span className="cg-spinner cg-spinner--sm b3-agent-detail__activity-empty-spinner" />
        </div>
        <p className="b3-agent-detail__empty-title">Loading settlement</p>
        <p className="b3-agent-detail__empty-copy">
          Fetching receive addresses.
        </p>
      </div>
    );
  }

  const editDef =
    editTarget != null
      ? rows.find((row) => row.network === editTarget.network) ?? null
      : null;

  return (
    <div className="b3-settlement">
      <section className="b3-card b3-card--section b3-card--flat">
        <div className="b3-profile__head b3-settlement__head">
          <span className="b3-profile__head-icon" aria-hidden>
            <SettlementHeadIcon />
          </span>
          <div className="b3-profile__head-copy">
            <h3 className="b3-card__heading">Settlement addresses</h3>
          </div>
          <div className="b3-settlement__head-actions">
            <span className="b3-settlement__configured-cap">
              {configuredCount} configured
            </span>
          </div>
        </div>

        <table className="data-table b3-settlement__table">
          <thead>
            <tr>
              <th>Network</th>
              <th>Wallet address</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const wallet = walletByNetwork.get(row.network);
              const address = wallet?.address ?? "";
              const configured = address.length > 0;
              const pending = wallet?.pending ?? false;
              const pendingAddress = wallet?.pendingAddress ?? "";
              return (
                <tr key={row.network}>
                  <td>
                    <span className="b3-settlement__network-cell">
                      <NetworkIcon network={row.network} />
                      <span className="b3-settlement__network-name">
                        {row.label}
                      </span>
                      {row.assets.map((asset) => (
                        <span key={asset} className="b3-settlement__asset-badge">
                          {asset}
                        </span>
                      ))}
                      {row.testnetBadge ? (
                        <span className="b3-settlement__testnet-badge">
                          Testnet
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td>
                    {configured ? (
                      <CopyableChainValue
                        className="b3-settlement__addr-value"
                        value={address}
                        network={row.network}
                        kind="address"
                      />
                    ) : (
                      <span className="b3-settlement__empty-addr">
                        Not configured
                      </span>
                    )}
                    {pendingAddress ? (
                      <span className="b3-settlement__pending-addr">
                        Pending
                        <CopyableChainValue
                          className="b3-settlement__addr-value"
                          value={pendingAddress}
                          network={row.network}
                          kind="address"
                        />
                      </span>
                    ) : null}
                    {wallet?.mixed ? (
                      <span className="b3-settlement__mixed-note">
                        Assets on this network use different addresses. Save once to
                        use one wallet for all.
                      </span>
                    ) : null}
                  </td>
                  <td>
                    {configured ? (
                      <span
                        className={`status-badge b3-settlement__status-badge ${
                          pending || wallet?.mixed ? "tone-warn" : "tone-ok"
                        }`}
                      >
                        {pending ? "COOL-DOWN" : wallet?.mixed ? "MIXED" : "ACTIVE"}
                      </span>
                    ) : (
                      <span className="b3-settlement__status-dash">—</span>
                    )}
                  </td>
                  <td>
                    <div className="b3-settlement__actions">
                      {configured ? (
                        <>
                          <SettlementCopyButton value={address} />
                          {canManage ? (
                            <button
                              type="button"
                              className="b3-settlement__icon-btn"
                              aria-label={`Edit ${row.label} wallet address`}
                              title="Edit"
                              onClick={() => openEditor(row, "edit")}
                            >
                              <EditGlyph />
                            </button>
                          ) : null}
                        </>
                      ) : canManage ? (
                        <button
                          type="button"
                          className="b3-agent-detail__onboard b3-settlement__configure"
                          onClick={() => openEditor(row, "configure")}
                        >
                          <ConfigureGlyph />
                          Configure
                        </button>
                      ) : (
                        <span className="b3-settlement__status-dash">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {editTarget && editDef
        ? createPortal(
            <div
              className="b3-commission-modal-backdrop"
              role="presentation"
              onClick={() => {
                if (!saving) setEditTarget(null);
              }}
            >
              <div
                className="b3-commission-modal b3-settlement-edit-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onClick={(e) => e.stopPropagation()}
              >
                <header className="org-edit__head b3-settlement-edit-modal__head">
                  <span className="org-edit__head-icon" aria-hidden>
                    <WalletModalMarkIcon />
                  </span>
                  <div className="org-edit__head-copy">
                    <h3 id={titleId}>
                      {editTarget.mode === "edit"
                        ? "Edit wallet address"
                        : "Configure wallet address"}
                    </h3>
                    <p>
                      One {editDef.label}
                      {editDef.testnetBadge ? " (testnet)" : ""} wallet receives{" "}
                      {editDef.assets.join(", ")}.
                    </p>
                  </div>
                  <OrgEditWaves />
                  <button
                    type="button"
                    className="org-edit__close"
                    aria-label="Close"
                    disabled={saving}
                    onClick={() => setEditTarget(null)}
                  >
                    <ModalCloseIcon />
                  </button>
                </header>
                <div className="b3-settlement-edit-modal__body">
                  <label className="b3-settlement-edit-modal__field">
                    <span className="b3-settlement-edit-modal__label">
                      Network
                    </span>
                    <FieldControl
                      leading={<NetworkIcon network={editTarget.network} />}
                    >
                      <input
                        className="field-control"
                        value={`${editDef.label}${
                          editDef.testnetBadge ? " · Testnet" : ""
                        } · ${editDef.assets.join(" · ")}`}
                        readOnly
                        tabIndex={-1}
                        aria-readonly="true"
                      />
                    </FieldControl>
                  </label>
                  <label className="b3-settlement-edit-modal__field">
                    <span className="b3-settlement-edit-modal__label">
                      Wallet address
                    </span>
                    <FieldControl
                      leading={<NetworkIcon network={editTarget.network} />}
                      trailing={<SettlementCopyButton value={draftAddress} />}
                      shellClassName="field-shell--wallet"
                    >
                      <input
                        className="field-control"
                        value={draftAddress}
                        maxLength={128}
                        disabled={saving}
                        spellCheck={false}
                        autoComplete="off"
                        placeholder={editDef.placeholder}
                        aria-label={`${editDef.label} wallet address`}
                        onChange={(e) => setDraftAddress(e.target.value)}
                      />
                    </FieldControl>
                  </label>
                  {draftError ? (
                    <p className="b3-settlement-edit-modal__error">{draftError}</p>
                  ) : (
                    <p className="b3-settlement-edit-modal__hint">
                      Authenticator code required to save.
                    </p>
                  )}
                </div>
                <footer className="org-edit__foot b3-settlement-edit-modal__foot">
                  <button
                    type="button"
                    className="org-edit__cancel"
                    disabled={saving}
                    onClick={() => setEditTarget(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="org-edit__save"
                    disabled={saving || !draftAddress.trim()}
                    onClick={requestSave}
                  >
                    <SaveIcon />
                    {saving ? "Saving…" : "Save"}
                  </button>
                </footer>
              </div>
            </div>,
            document.body,
          )
        : null}

      {pendingSave ? (
        <MfaStepUpGate
          session={session}
          actionLabel="save settlement address"
          onClose={() => {
            if (!saving) {
              setEditTarget(pendingSave);
              setDraftAddress(pendingSave.address);
              setPendingSave(null);
            }
          }}
          onVerify={(mfaCode) => saveWithMfa(mfaCode)}
        />
      ) : null}
    </div>
  );
}
