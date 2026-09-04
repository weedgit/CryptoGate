import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AuthToast } from "../auth/AuthToast";
import { MfaStepUpGate } from "../auth/MfaStepUpGate";
import { AssetIcon, NetworkIcon } from "../platform/cryptoIcons";
import { PagePending } from "../platform/ui/PlatformPending";
import { FieldControl } from "../ui/FieldControl";
import { SearchableSelect } from "../ui/SearchableSelect";
import {
  ApiError,
  getFulfillmentPolicy,
  getMatchingMode,
  listHdPool,
  listSettlement,
  listXpub,
  putFulfillmentPolicy,
  putMatchingMode,
  putSettlement,
  putXpub,
  type HdPoolAddress,
  type Session,
  type SettlementAddress,
  type XpubSettings,
} from "./api";
import {
  MATCHING_CONCURRENT_HELP,
  MATCHING_MODE_CARDS,
  MATCHING_UNDERPAY_TOLERANCE_HELP,
  matchingModeCardDisabled,
  matchingModeDisabledReason,
  matchingModeLabel,
  matchingModeScope,
  matchingModeTooltip,
} from "./matchingLabels";
import {
  fulfillmentPolicyLabel,
  fulfillmentPolicyScope,
  fulfillmentPolicyTooltip,
  FULFILLMENT_POLICY_CARDS,
} from "./fulfillmentLabels";
import {
  formatCountdown,
  primaryMerchantOrgId,
  truncateAddress,
} from "./org";
import {
  defaultLivePair,
  displayNetworkForPair,
  isLivePair,
  pairsForAsset,
  uniqueAssetsFromRegistry,
  xpubMaterialHint,
} from "../shared/assetNetworks";
import { CopyableChainValue } from "../shared/CopyableChainValue";
import { isMatchingModeSelectable, MatchingMode } from "@paymentgate/domain";

type Props = { session: Session };

type PendingMfa =
  | {
      kind: "address";
      asset: string;
      network: string;
      address: string;
    }
  | {
      kind: "xpub";
      asset: string;
      network: string;
      xPub: string;
    };

function settlementStatusTone(status: string): string {
  return status === "pending_cool_down" ? "warn" : "ok";
}

function settlementStatusLabel(status: string): string {
  return status === "pending_cool_down" ? "Cool-down" : "Active";
}

export function SettlementPage({ session }: Props) {
  const orgId = useMemo(() => primaryMerchantOrgId(session), [session]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [mode, setMode] = useState("B");
  const [modeSource, setModeSource] = useState<string>("merchant");
  const [draftMode, setDraftMode] = useState("B");
  const [underpayTolerance, setUnderpayTolerance] = useState("0");
  const [savedUnderpayTolerance, setSavedUnderpayTolerance] = useState("0");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [savingMode, setSavingMode] = useState(false);
  const [fulfillmentPolicy, setFulfillmentPolicy] = useState("on_completed");
  const [draftFulfillmentPolicy, setDraftFulfillmentPolicy] =
    useState("on_completed");
  const [fulfillmentSource, setFulfillmentSource] = useState<string>("merchant");
  const [fulfillmentConfirmOpen, setFulfillmentConfirmOpen] = useState(false);
  const [savingFulfillment, setSavingFulfillment] = useState(false);
  const [addresses, setAddresses] = useState<SettlementAddress[]>([]);
  const [xpubs, setXpubs] = useState<XpubSettings[]>([]);
  const [pool, setPool] = useState<HdPoolAddress[]>([]);
  const [derivePath, setDerivePath] = useState("0/{index}");

  const initialPair = defaultLivePair();
  const [addrAsset, setAddrAsset] = useState<string>(initialPair.asset);
  const [addrNetwork, setAddrNetwork] = useState<string>(initialPair.network);
  const [addrValue, setAddrValue] = useState("");
  const [savingAddr, setSavingAddr] = useState(false);

  const [xPubValue, setXPubValue] = useState("");
  const [xPubAsset, setXPubAsset] = useState<string>(initialPair.asset);
  const [xPubNetwork, setXPubNetwork] = useState<string>(initialPair.network);
  const [savingXpub, setSavingXpub] = useState(false);
  const [pendingMfa, setPendingMfa] = useState<PendingMfa | null>(null);

  const settlementAssets = useMemo(() => uniqueAssetsFromRegistry(), []);
  const settlementNetworkOptions = useMemo(
    () => pairsForAsset(addrAsset),
    [addrAsset],
  );
  const assetSelectOptions = useMemo(
    () =>
      settlementAssets.map((a) => ({
        id: a,
        label: a,
        icon: <AssetIcon asset={a} />,
      })),
    [settlementAssets],
  );
  const networkSelectOptions = useMemo(
    () =>
      settlementNetworkOptions.map((row) => ({
        id: row.network,
        label: row.displayNetwork,
        hint: row.enabled ? undefined : "coming soon",
        icon: <NetworkIcon network={row.network} />,
      })),
    [settlementNetworkOptions],
  );
  const settlementPairLive = isLivePair(addrAsset, addrNetwork);
  const readOnly = modeSource === "inherit";
  const fulfillmentReadOnly = fulfillmentSource === "inherit";
  const xPubNetworkOptions = useMemo(
    () => pairsForAsset(xPubAsset),
    [xPubAsset],
  );
  const xPubNetworkSelectOptions = useMemo(
    () =>
      xPubNetworkOptions.map((row) => ({
        id: row.network,
        label: row.displayNetwork,
        hint: row.enabled ? undefined : "coming soon",
        icon: <NetworkIcon network={row.network} />,
      })),
    [xPubNetworkOptions],
  );
  const xPubPairLive = isLivePair(xPubAsset, xPubNetwork);
  const matchingDirty =
    draftMode !== mode ||
    (draftMode === "B" &&
      underpayTolerance.trim() !== savedUnderpayTolerance.trim());
  const fulfillmentDirty = draftFulfillmentPolicy !== fulfillmentPolicy;
  const matchingDraftLabel = useMemo(() => {
    if (draftMode !== mode) return matchingModeLabel(draftMode);
    if (
      draftMode === "B" &&
      underpayTolerance.trim() !== savedUnderpayTolerance.trim()
    ) {
      return `Tolerance ${underpayTolerance.trim() || "0"}`;
    }
    return null;
  }, [draftMode, mode, underpayTolerance, savedUnderpayTolerance]);

  const load = useCallback(async () => {
    if (!orgId) {
      setError("No merchant org on this session");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      const [m, f, s, x, h] = await Promise.all([
        getMatchingMode(orgId),
        getFulfillmentPolicy(orgId),
        listSettlement(orgId),
        listXpub(orgId),
        listHdPool(orgId),
      ]);
      setMode(m.matchingMode);
      setModeSource(m.source ?? "merchant");
      const loadedMode = m.matchingMode;
      setDraftMode(
        isMatchingModeSelectable(loadedMode as MatchingMode) ? loadedMode : "B",
      );
      setFulfillmentPolicy(f.fulfillmentPolicy);
      setDraftFulfillmentPolicy(f.fulfillmentPolicy);
      setFulfillmentSource(f.source ?? "merchant");
      const tol = m.underpayTolerance ?? "0";
      setUnderpayTolerance(tol);
      setSavedUnderpayTolerance(tol);
      setAddresses(s);
      setXpubs(x);
      setPool(h.items ?? []);
      setDerivePath(h.derivationPath ?? "0/{index}");
    } catch (err) {
      if (err instanceof ApiError && err.httpStatus === 403) {
        setForbidden(true);
        setError(
          "Cashiers cannot view or change settlement address, matching mode, or xPub.",
        );
      } else {
        setError(err instanceof ApiError ? err.message : "Failed to load settlement");
      }
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const cooldownBanner = addresses.find((a) => a.status === "pending_cool_down");
  const activeXpub = xpubs.find(
    (x) => x.asset === xPubAsset && x.network === xPubNetwork,
  );
  const poolForPair = pool.filter(
    (p) => p.asset === xPubAsset && p.network === xPubNetwork,
  );
  const poolFree = poolForPair.filter((p) => p.status === "FREE").length;
  const poolInUse = poolForPair.filter((p) => p.status === "IN_USE").length;
  const poolCooldown = poolForPair.filter((p) => p.status === "COOLDOWN").length;

  async function saveMatchingMode() {
    if (!orgId) return;
    setSavingMode(true);
    setError(null);
    try {
      const saved = await putMatchingMode(orgId, draftMode, {
        underpayTolerance:
          draftMode === "B" ? underpayTolerance.trim() || "0" : "0",
      });
      setMode(saved.matchingMode);
      setDraftMode(saved.matchingMode);
      const tol = saved.underpayTolerance ?? "0";
      setUnderpayTolerance(tol);
      setSavedUnderpayTolerance(tol);
      setConfirmOpen(false);
      setSuccess("Matching mode saved");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save matching mode failed");
    } finally {
      setSavingMode(false);
    }
  }

  async function saveFulfillmentPolicy() {
    if (!orgId) return;
    setSavingFulfillment(true);
    setError(null);
    try {
      const saved = await putFulfillmentPolicy(orgId, draftFulfillmentPolicy);
      setFulfillmentPolicy(saved.fulfillmentPolicy);
      setDraftFulfillmentPolicy(saved.fulfillmentPolicy);
      setFulfillmentConfirmOpen(false);
      setSuccess("Fulfillment policy saved");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Save fulfillment policy failed",
      );
    } finally {
      setSavingFulfillment(false);
    }
  }

  function onSaveAddress(e: FormEvent) {
    e.preventDefault();
    if (!orgId || readOnly) return;
    const address = addrValue.trim();
    if (!address) return;
    setError(null);
    setSuccess(null);
    setPendingMfa({
      kind: "address",
      asset: addrAsset,
      network: addrNetwork,
      address,
    });
  }

  function onSaveXpub(e: FormEvent) {
    e.preventDefault();
    if (!orgId || readOnly) return;
    const xPub = xPubValue.trim();
    if (!xPub) return;
    setError(null);
    setSuccess(null);
    setPendingMfa({
      kind: "xpub",
      asset: xPubAsset,
      network: xPubNetwork,
      xPub,
    });
  }

  async function reloadSettlementAddresses() {
    if (!orgId) return;
    setAddresses(await listSettlement(orgId));
  }

  async function reloadXpubAndPool() {
    if (!orgId) return;
    const [x, h] = await Promise.all([listXpub(orgId), listHdPool(orgId)]);
    setXpubs(x);
    setPool(h.items ?? []);
    setDerivePath(h.derivationPath ?? "0/{index}");
  }

  async function verifyPendingMfa(mfaCode: string) {
    if (!orgId || !pendingMfa) return;
    try {
      if (pendingMfa.kind === "address") {
        setSavingAddr(true);
        await putSettlement(orgId, {
          asset: pendingMfa.asset,
          network: pendingMfa.network,
          address: pendingMfa.address,
          mfaCode,
        });
        setAddrValue("");
        setSuccess("Settlement address saved — cool-down may apply");
        try {
          await reloadSettlementAddresses();
        } catch {
          setError(
            "Address saved, but the list could not refresh — reload the page.",
          );
        }
      } else {
        setSavingXpub(true);
        await putXpub(orgId, {
          asset: pendingMfa.asset,
          network: pendingMfa.network,
          xPub: pendingMfa.xPub,
          mfaCode,
        });
        setXPubValue("");
        setSuccess("xPub saved — cool-down may apply");
        try {
          await reloadXpubAndPool();
        } catch {
          setError("xPub saved, but pool status could not refresh — reload the page.");
        }
      }
    } catch (err) {
      throw new Error(
        err instanceof ApiError
          ? err.message
          : pendingMfa.kind === "address"
            ? "Save address failed"
            : "Save xPub failed",
      );
    } finally {
      setSavingAddr(false);
      setSavingXpub(false);
    }
  }

  const toastMessage = error ?? success;
  const toastTone = error ? "error" : "ok";

  if (loading) {
    return <PagePending />;
  }

  if (forbidden) {
    return (
      <div className="plat-settings plat-settings--merchant plat-settlement">
        <AuthToast
          message={error}
          tone="error"
          onDismiss={() => setError(null)}
        />
        <section className="plat-settings__card">
          <div className="plat-settings__card-head">
            <h2 className="plat-settings__card-title">Settlement</h2>
          </div>
          <div className="plat-settings__card-body">
            <p className="muted">
              You do not have access to settlement settings.
            </p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="plat-settings plat-settings--merchant plat-settlement">
      <AuthToast
        message={toastMessage}
        tone={toastTone}
        onDismiss={() => {
          setError(null);
          setSuccess(null);
        }}
      />

      {cooldownBanner ? (
        <aside className="plat-settlement__banner" role="status">
          <div className="plat-settlement__banner-copy">
            <strong>Settlement cool-down active</strong>
            <p>
              Pending{" "}
              <code className="mono">
                {truncateAddress(
                  cooldownBanner.pendingAddress ?? cooldownBanner.address,
                  10,
                  8,
                )}
              </code>
              . New orders still use the active address until cool-down ends.
            </p>
          </div>
          <div className="plat-settlement__banner-timer" aria-label="Time remaining">
            <span className="plat-settlement__banner-timer-label">Activates in</span>
            <span className="plat-settlement__banner-timer-value">
              {formatCountdown(cooldownBanner.pendingActivatesAt) ?? "waiting"}
            </span>
          </div>
        </aside>
      ) : null}

      {readOnly || fulfillmentReadOnly ? (
        <p className="plat-settings__notice" role="status">
          Inheriting parent merchant defaults. This site uses the parent
          merchant wallet, matching mode, fulfillment, and order retention.
          Change those on the parent merchant.
        </p>
      ) : null}

      <div className="plat-settlement__layout">
        <section className="plat-settings__card plat-settlement__card plat-settlement__card--addresses">
          <div className="plat-settings__card-head">
            <h2 className="plat-settings__card-title">Settlement addresses</h2>
            <div className="plat-settlement__head-badges">
              <span className="plat-card-help plat-settlement__form-badge-help">
                <span className="plat-settings__badge plat-settlement__step-badge">
                  MFA
                </span>
                <span className="plat-card-help__tip" role="tooltip">
                  Authenticator MFA required on save. Changes enter a cool-down
                  before they become active.
                </span>
              </span>
            </div>
          </div>
          <div className="plat-settings__card-body">
            <form className="plat-settings__payout-form plat-settlement__form" onSubmit={onSaveAddress}>
              <div className="plat-settlement__field-row">
                <label className="plat-settings__field" htmlFor="settlement-asset">
                  <span>Asset</span>
                  <FieldControl leading={<AssetIcon asset={addrAsset} />}>
                    <SearchableSelect
                      id="settlement-asset"
                      value={addrAsset}
                      options={assetSelectOptions}
                      onChange={(next) => {
                        setAddrAsset(next);
                        const pairs = pairsForAsset(next);
                        const live = pairs.find((p) => p.enabled) ?? pairs[0];
                        if (live) setAddrNetwork(live.network);
                      }}
                      allowEmpty={false}
                      disabled={savingAddr || readOnly}
                      ariaLabel="Asset"
                      hideTriggerIcon
                    />
                  </FieldControl>
                </label>
                <label
                  className="plat-settings__field"
                  htmlFor="settlement-network"
                >
                  <span>Network</span>
                  <FieldControl leading={<NetworkIcon network={addrNetwork} />}>
                    <SearchableSelect
                      id="settlement-network"
                      value={addrNetwork}
                      options={networkSelectOptions}
                      onChange={(next) => {
                        const row = settlementNetworkOptions.find(
                          (p) => p.network === next,
                        );
                        if (row && !row.enabled) return;
                        setAddrNetwork(next);
                      }}
                      allowEmpty={false}
                      disabled={savingAddr || readOnly}
                      ariaLabel="Network"
                      hideTriggerIcon
                    />
                  </FieldControl>
                </label>
              </div>
              <label className="plat-settings__field">
                <span>Receive address</span>
                <input
                  className="plat-settings__input mono"
                  value={addrValue}
                  onChange={(e) => setAddrValue(e.target.value)}
                  required
                  disabled={savingAddr || readOnly}
                  spellCheck={false}
                  placeholder={`${addrAsset} address on selected network`}
                />
              </label>
              <div className="plat-settlement__form-actions">
                <button
                  type="submit"
                  className="btn-primary plat-settings__submit"
                  disabled={savingAddr || readOnly || !settlementPairLive}
                >
                  Save settlement address
                </button>
              </div>
            </form>

            <div className="plat-settlement__address-table">
              <h3 className="plat-settlement__form-title">Wallet addresses</h3>
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
                            <span
                              className={`plat-bills__badge tone-${settlementStatusTone(row.status)}`}
                            >
                              {settlementStatusLabel(row.status)}
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
        </section>

        <section className="plat-settings__card plat-settlement__card plat-settlement__card--matching">
          <div className="plat-settings__card-head">
            <div className="plat-settlement__mode-title">
              <h2 className="plat-settings__card-title">Matching mode</h2>
              <span className="plat-card-help plat-settlement__mode-help">
                <button
                  type="button"
                  className="plat-card-help__btn"
                  aria-label={MATCHING_CONCURRENT_HELP}
                >
                  ?
                </button>
                <span className="plat-card-help__tip" role="tooltip">
                  {MATCHING_CONCURRENT_HELP}
                </span>
              </span>
            </div>
            <div className="plat-settlement__head-badges">
              <span
                className={`plat-settlement__mode-pill${
                  matchingDirty ? " is-stale" : ""
                }`}
              >
                {matchingModeLabel(mode)}
              </span>
              {matchingDirty && matchingDraftLabel ? (
                <span className="plat-settlement__draft-pill">
                  → {matchingDraftLabel}
                </span>
              ) : null}
            </div>
          </div>
          <div className="plat-settings__card-body">
            <p className="plat-settings__card-copy">{matchingModeScope(mode)}</p>
            <div
              className="plat-settlement__stats plat-settlement__stats--pick"
              role="listbox"
              aria-label="Matching mode"
            >
              {MATCHING_MODE_CARDS.map((card) => {
                const selected = draftMode === card.mode;
                const unavailable = matchingModeCardDisabled(card.mode);
                const tip =
                  matchingModeDisabledReason(card.mode) ??
                  matchingModeTooltip(card.mode);
                return (
                  <button
                    key={card.mode}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    aria-disabled={unavailable || undefined}
                    aria-describedby={`matching-mode-tip-${card.mode}`}
                    disabled={readOnly || unavailable}
                    className={`plat-settlement__stat plat-settlement__stat-pick${
                      selected ? " is-selected" : ""
                    }${unavailable ? " is-unavailable" : ""}`}
                    onClick={() => {
                      if (!unavailable) setDraftMode(card.mode);
                    }}
                  >
                    <span className="plat-card-help plat-settlement__stat-pick-help">
                      <span
                        className="plat-card-help__btn"
                        aria-label={`About ${card.label} matching`}
                        tabIndex={-1}
                      >
                        ?
                      </span>
                      <span
                        id={`matching-mode-tip-${card.mode}`}
                        className="plat-card-help__tip"
                        role="tooltip"
                      >
                        {tip}
                      </span>
                    </span>
                    <span className="plat-settlement__stat-label">
                      Mode {card.mode}
                      {selected ? (
                        <span className="plat-settlement__stat-selected-tag">
                          Selected
                        </span>
                      ) : null}
                    </span>
                    <strong className="plat-settlement__stat-value">
                      {card.label}
                    </strong>
                    <span className="plat-settlement__stat-hint">{card.blurb}</span>
                  </button>
                );
              })}
            </div>
            <form
              className="plat-settlement__form"
              onSubmit={(e) => e.preventDefault()}
            >
              {draftMode === "B" ? (
                <>
                  <div className="plat-settlement__form-head">
                    <h3 className="plat-settlement__form-title">
                      Underpay tolerance (Mode B)
                    </h3>
                  </div>
                  <div className="plat-settlement__field-row plat-settlement__field-row--xpub">
                    <label className="plat-settings__field plat-settlement__field--grow">
                      <span className="plat-settlement__field-label">
                        <span>Tolerance</span>
                        <span className="plat-card-help plat-settlement__underpay-help">
                          <button
                            type="button"
                            className="plat-card-help__btn"
                            aria-label="About underpay tolerance"
                          >
                            ?
                          </button>
                          <span className="plat-card-help__tip" role="tooltip">
                            {MATCHING_UNDERPAY_TOLERANCE_HELP}
                          </span>
                        </span>
                      </span>
                      <input
                        className="plat-settings__input"
                        value={underpayTolerance}
                        onChange={(e) => setUnderpayTolerance(e.target.value)}
                        placeholder="0"
                        inputMode="decimal"
                        disabled={readOnly}
                      />
                    </label>
                  </div>
                </>
              ) : null}
              <div className="plat-settlement__form-actions">
                <button
                  type="button"
                  className="btn-primary plat-settings__submit"
                  disabled={
                    (draftMode === mode &&
                      (draftMode !== "B" ||
                        underpayTolerance.trim() === savedUnderpayTolerance)) ||
                    savingMode ||
                    readOnly
                  }
                  onClick={() => setConfirmOpen(true)}
                >
                  Save matching mode
                </button>
              </div>
            </form>

            {draftMode === "S" ? (
              <div className="plat-settlement__pool-section">
                <div className="plat-settlement__pool-section-head">
                  <div className="plat-settlement__mode-title">
                    <h3 className="plat-settlement__form-title">HD pool (Mode S)</h3>
                    <span className="plat-card-help plat-settlement__pool-help">
                      <button
                        type="button"
                        className="plat-card-help__btn"
                        aria-label="About HD pool"
                      >
                        ?
                      </button>
                      <span className="plat-card-help__tip" role="tooltip">
                        Watch-only key per asset/network. Derived pool addresses for{" "}
                        {displayNetworkForPair(xPubAsset, xPubNetwork)} on same-amount
                        conflicts. PaymentGate never sweeps or signs.
                      </span>
                    </span>
                  </div>
                  <span className="plat-settlement__pool-meta mono">{derivePath}</span>
                </div>

                <div className="plat-settlement__stats" aria-label="HD pool summary">
                  <div className="plat-settlement__stat">
                    <span className="plat-settlement__stat-label">xPub</span>
                    <strong className="plat-settlement__stat-value">
                      {activeXpub?.xPubConfigured
                        ? activeXpub.pendingXPub
                          ? "Cool-down"
                          : "Configured"
                        : "Not set"}
                    </strong>
                    <span className="plat-settlement__stat-hint">
                      {activeXpub?.xPubConfigured
                        ? activeXpub.pendingXPub
                          ? formatCountdown(activeXpub.pendingActivatesAt) ?? "pending"
                          : "Active for Mode S"
                        : "Mode S falls back to Standard"}
                    </span>
                  </div>
                  <div className="plat-settlement__stat">
                    <span className="plat-settlement__stat-label">Free</span>
                    <strong className="plat-settlement__stat-value">{poolFree}</strong>
                  </div>
                  <div className="plat-settlement__stat">
                    <span className="plat-settlement__stat-label">In use</span>
                    <strong className="plat-settlement__stat-value">{poolInUse}</strong>
                  </div>
                  <div className="plat-settlement__stat">
                    <span className="plat-settlement__stat-label">Cool-down</span>
                    <strong className="plat-settlement__stat-value">{poolCooldown}</strong>
                  </div>
                </div>

                <div className="plat-settlement__chips">
                  {poolForPair.length === 0 ? (
                    <p className="muted plat-settlement__chips-empty">No HD pool rows yet.</p>
                  ) : (
                    poolForPair.slice(0, 24).map((slot) => (
                      <span
                        key={slot.id}
                        className={`plat-settlement__chip plat-settlement__chip--${slot.status.toLowerCase()}`}
                        title={slot.receiveAddress}
                      >
                        {truncateAddress(slot.receiveAddress, 4, 3)} · {slot.status}
                      </span>
                    ))
                  )}
                </div>

                <form
                  className="plat-settings__payout-form plat-settlement__form plat-settlement__form--pool"
                  onSubmit={onSaveXpub}
                >
                  <div className="plat-settlement__form-head">
                    <h3 className="plat-settlement__form-title">Register or rotate xPub</h3>
                  </div>
                  <div className="plat-settlement__field-row plat-settlement__field-row--pair">
                    <FieldControl label="Asset" className="plat-settlement__field--grow">
                      <SearchableSelect
                        value={xPubAsset}
                        options={assetSelectOptions}
                        disabled={savingXpub || readOnly}
                        onChange={(next) => {
                          setXPubAsset(next);
                          const rows = pairsForAsset(next);
                          const live = rows.find((r) => r.enabled);
                          if (live) setXPubNetwork(live.network);
                        }}
                        ariaLabel="xPub asset"
                      />
                    </FieldControl>
                    <FieldControl label="Network" className="plat-settlement__field--grow">
                      <SearchableSelect
                        value={xPubNetwork}
                        options={xPubNetworkSelectOptions}
                        disabled={savingXpub || readOnly}
                        onChange={setXPubNetwork}
                        ariaLabel="xPub network"
                      />
                    </FieldControl>
                  </div>
                  <div className="plat-settlement__field-row plat-settlement__field-row--xpub">
                    <label className="plat-settings__field plat-settlement__field--grow">
                      <span className="plat-settlement__field-label">
                        <span>xPub</span>
                        <span className="plat-card-help plat-settlement__xpub-help">
                          <button
                            type="button"
                            className="plat-card-help__btn"
                            aria-label="About xPub registration"
                          >
                            ?
                          </button>
                          <span className="plat-card-help__tip" role="tooltip">
                            {xpubMaterialHint(xPubNetwork)} MFA confirms on save. Never paste
                            spend keys or seed phrases.
                          </span>
                        </span>
                      </span>
                      <input
                        className="plat-settings__input mono"
                        value={xPubValue}
                        onChange={(e) => setXPubValue(e.target.value)}
                        required
                        disabled={savingXpub || readOnly || !xPubPairLive}
                        spellCheck={false}
                        autoComplete="off"
                        placeholder={
                          xPubPairLive ? "xpub… / zpub… / ed25519 pubkey…" : "Select a live pair"
                        }
                      />
                    </label>
                  </div>
                  <div className="plat-settlement__form-actions">
                    <button
                      type="submit"
                      className="btn-primary plat-settings__submit"
                      disabled={savingXpub || readOnly || !xPubPairLive}
                    >
                      Save xPub
                    </button>
                  </div>
                </form>
              </div>
            ) : null}
          </div>
        </section>

        <section className="plat-settings__card plat-settlement__card plat-settlement__card--fulfillment">
          <div className="plat-settings__card-head">
            <h2 className="plat-settings__card-title">Fulfillment policy</h2>
            <div className="plat-settlement__head-badges">
              <span
                className={`plat-settlement__mode-pill${
                  fulfillmentDirty ? " is-stale" : ""
                }`}
              >
                {fulfillmentPolicyLabel(fulfillmentPolicy)}
              </span>
              {fulfillmentDirty ? (
                <span className="plat-settlement__draft-pill">
                  → {fulfillmentPolicyLabel(draftFulfillmentPolicy)}
                </span>
              ) : null}
            </div>
          </div>
          <div className="plat-settings__card-body">
            <p className="plat-settings__card-copy">
              {fulfillmentPolicyScope(fulfillmentPolicy)}
            </p>
            <div
              className="plat-settlement__stats plat-settlement__stats--pick plat-settlement__stats--duo"
              role="listbox"
              aria-label="Fulfillment policy"
            >
              {FULFILLMENT_POLICY_CARDS.map((card) => {
                const selected = draftFulfillmentPolicy === card.policy;
                const tip = fulfillmentPolicyTooltip(card.policy);
                return (
                  <button
                    key={card.policy}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    aria-describedby={`fulfillment-policy-tip-${card.policy}`}
                    disabled={fulfillmentReadOnly}
                    className={`plat-settlement__stat plat-settlement__stat-pick${
                      selected ? " is-selected" : ""
                    }`}
                    onClick={() => setDraftFulfillmentPolicy(card.policy)}
                  >
                    <span className="plat-card-help plat-settlement__stat-pick-help">
                      <span
                        className="plat-card-help__btn"
                        aria-label={`About ${card.label} fulfillment`}
                        tabIndex={-1}
                      >
                        ?
                      </span>
                      <span
                        id={`fulfillment-policy-tip-${card.policy}`}
                        className="plat-card-help__tip"
                        role="tooltip"
                      >
                        {tip}
                      </span>
                    </span>
                    <span className="plat-settlement__stat-label">
                      Policy
                      {selected ? (
                        <span className="plat-settlement__stat-selected-tag">
                          Selected
                        </span>
                      ) : null}
                    </span>
                    <strong className="plat-settlement__stat-value">
                      {card.label}
                    </strong>
                    <span className="plat-settlement__stat-hint">{card.blurb}</span>
                  </button>
                );
              })}
            </div>
            <form
              className="plat-settlement__form"
              onSubmit={(e) => e.preventDefault()}
            >
              <div className="plat-settlement__form-actions">
                <button
                  type="button"
                  className="btn-primary plat-settings__submit"
                  disabled={
                    draftFulfillmentPolicy === fulfillmentPolicy ||
                    savingFulfillment ||
                    fulfillmentReadOnly
                  }
                  onClick={() => {
                    if (draftFulfillmentPolicy === "on_verifying") {
                      setFulfillmentConfirmOpen(true);
                    } else {
                      void saveFulfillmentPolicy();
                    }
                  }}
                >
                  Save fulfillment policy
                </button>
              </div>
            </form>
          </div>
        </section>
      </div>

      {confirmOpen
        ? createPortal(
            <div
              className="b3-commission-modal-backdrop"
              role="presentation"
              onClick={() => {
                if (!savingMode) setConfirmOpen(false);
              }}
            >
              <div
                className="b3-commission-modal plat-settlement__confirm"
                role="dialog"
                aria-modal="true"
                aria-labelledby="merchant-settlement-confirm-title"
                onClick={(e) => e.stopPropagation()}
              >
                <header className="b3-commission-modal__head">
                  <h3 id="merchant-settlement-confirm-title">Confirm matching mode</h3>
                  <button
                    type="button"
                    className="b3-commission-modal__close"
                    aria-label="Close"
                    disabled={savingMode}
                    onClick={() => setConfirmOpen(false)}
                  >
                    ×
                  </button>
                </header>
                <div className="b3-commission-modal__body">
                  <p className="plat-settings__card-copy">
                    Switch to <strong>{matchingModeLabel(draftMode)}</strong>
                    {draftMode === "B"
                      ? ` with underpay tolerance ${underpayTolerance.trim() || "0"}`
                      : ""}
                    ? Applies to <strong>new orders only</strong>. Open orders keep their
                    create-time mode.
                  </p>
                  <div className="b3-commission-modal__actions">
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => setConfirmOpen(false)}
                      disabled={savingMode}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => void saveMatchingMode()}
                      disabled={savingMode}
                    >
                      {savingMode ? "Saving…" : "Confirm"}
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {fulfillmentConfirmOpen
        ? createPortal(
            <div
              className="b3-commission-modal-backdrop"
              role="presentation"
              onClick={() => {
                if (!savingFulfillment) setFulfillmentConfirmOpen(false);
              }}
            >
              <div
                className="b3-commission-modal plat-settlement__confirm"
                role="dialog"
                aria-modal="true"
                aria-labelledby="merchant-fulfillment-confirm-title"
                onClick={(e) => e.stopPropagation()}
              >
                <header className="b3-commission-modal__head">
                  <h3 id="merchant-fulfillment-confirm-title">Confirm Counter policy</h3>
                  <button
                    type="button"
                    className="b3-commission-modal__close"
                    aria-label="Close"
                    disabled={savingFulfillment}
                    onClick={() => setFulfillmentConfirmOpen(false)}
                  >
                    ×
                  </button>
                </header>
                <div className="b3-commission-modal__body">
                  <p className="plat-settings__card-copy">
                    Switch to <strong>Counter (release on verifying)</strong>? Staff may
                    release goods when a tx is detected, before confirmations complete.
                    Applies to <strong>new orders only</strong>.
                  </p>
                  <div className="b3-commission-modal__actions">
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => setFulfillmentConfirmOpen(false)}
                      disabled={savingFulfillment}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => void saveFulfillmentPolicy()}
                      disabled={savingFulfillment}
                    >
                      {savingFulfillment ? "Saving…" : "Confirm"}
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {pendingMfa ? (
        <MfaStepUpGate
          session={session}
          actionLabel={
            pendingMfa.kind === "address"
              ? "save settlement address"
              : "save extended public key"
          }
          onClose={() => setPendingMfa(null)}
          onVerify={verifyPendingMfa}
        />
      ) : null}
    </div>
  );
}
