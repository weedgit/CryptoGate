import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AuthToast } from "../auth/AuthToast";
import { MfaStepUpModal } from "../auth/MfaStepUpModal";
import { NetworkIcon } from "../platform/cryptoIcons";
import { PlatformPending } from "../platform/ui/PlatformPending";
import {
  ApiError,
  getMatchingMode,
  listHdPool,
  listSettlement,
  listXpub,
  putMatchingMode,
  putSettlement,
  putXpub,
  type HdPoolAddress,
  type Session,
  type SettlementAddress,
  type XpubSettings,
} from "./api";
import {
  MATCHING_MODE_CARDS,
  matchingModeLabel,
  matchingModeScope,
} from "./matchingLabels";
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
} from "../shared/assetNetworks";

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

function networkOptionLabel(row: {
  displayNetwork: string;
  enabled: boolean;
}): string {
  return row.enabled ? row.displayNetwork : `${row.displayNetwork} (coming soon)`;
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
  const [savingXpub, setSavingXpub] = useState(false);
  const [pendingMfa, setPendingMfa] = useState<PendingMfa | null>(null);

  const settlementAssets = useMemo(() => uniqueAssetsFromRegistry(), []);
  const settlementNetworkOptions = useMemo(
    () => pairsForAsset(addrAsset),
    [addrAsset],
  );
  const settlementPairLive = isLivePair(addrAsset, addrNetwork);
  const readOnly = modeSource === "inherit";
  const xPubPair = useMemo(() => defaultLivePair(), []);

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
      const [m, s, x, h] = await Promise.all([
        getMatchingMode(orgId),
        listSettlement(orgId),
        listXpub(orgId),
        listHdPool(orgId),
      ]);
      setMode(m.matchingMode);
      setModeSource(m.source ?? "merchant");
      setDraftMode(m.matchingMode);
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
    (x) => x.asset === xPubPair.asset && x.network === xPubPair.network,
  );
  const poolFree = pool.filter((p) => p.status === "FREE").length;
  const poolInUse = pool.filter((p) => p.status === "IN_USE").length;
  const poolCooldown = pool.filter((p) => p.status === "COOLDOWN").length;

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
      asset: xPubPair.asset,
      network: xPubPair.network,
      xPub,
    });
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
      }
      await load();
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
    return (
      <PlatformPending
        title="Loading settlement"
        copy="Fetching matching mode, addresses, and HD pool status."
      />
    );
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

      {readOnly ? (
        <p className="plat-settings__notice" role="status">
          Inheriting parent merchant defaults. Wallet, matching mode, and xPub come
          from the parent until the parent Owner approves an override.{" "}
          <Link to={`/merchant/sites/${orgId}`}>Request override</Link>
        </p>
      ) : null}

      <div className="plat-settlement__layout">
        <section className="plat-settings__card plat-settlement__card plat-settlement__card--addresses">
          <div className="plat-settings__card-head">
            <h2 className="plat-settings__card-title">Settlement addresses</h2>
          </div>
          <div className="plat-settings__card-body">
            <p className="plat-settings__card-copy">
              Merchant-controlled receive destinations. CryptoGate is watch-only and
              never holds spend keys.
            </p>
            <div className="plat-bills__table-wrap plat-settlement__table-wrap">
              {addresses.length === 0 ? (
                <p className="plat-bills__empty">No settlement addresses yet.</p>
              ) : (
                <table className="plat-bills__table plat-settlement__table">
                  <thead>
                    <tr>
                      <th>Network</th>
                      <th>Active address</th>
                      <th>Pending</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {addresses.map((row) => (
                      <tr key={`${row.asset}-${row.network}`}>
                        <td>
                          <span className="plat-settlement__net">
                            <NetworkIcon network={row.network} />
                            <span>
                              <strong>{displayNetworkForPair(row.asset, row.network)}</strong>
                              <em>{row.asset}</em>
                            </span>
                          </span>
                        </td>
                        <td className="mono plat-settlement__addr">
                          {truncateAddress(row.address, 10, 8)}
                        </td>
                        <td className="mono plat-settlement__addr muted">
                          {row.status === "pending_cool_down" && row.pendingAddress
                            ? truncateAddress(row.pendingAddress, 10, 8)
                            : "—"}
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

            <form className="plat-settings__payout-form plat-settlement__form" onSubmit={onSaveAddress}>
              <div className="plat-settlement__form-head">
                <h3 className="plat-settlement__form-title">Add or rotate address</h3>
                <p className="plat-settings__card-note plat-settlement__form-note">
                  You will confirm with authenticator MFA on save. Changes enter a
                  cool-down before they become active.
                </p>
              </div>
              <div className="plat-settlement__field-row">
                <label className="plat-settings__field">
                  <span>Asset</span>
                  <select
                    className="plat-settings__input"
                    value={addrAsset}
                    onChange={(e) => {
                      const next = e.target.value;
                      setAddrAsset(next);
                      const pairs = pairsForAsset(next);
                      const live = pairs.find((p) => p.enabled) ?? pairs[0];
                      if (live) setAddrNetwork(live.network);
                    }}
                    disabled={savingAddr || readOnly}
                  >
                    {settlementAssets.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="plat-settings__field">
                  <span>Network</span>
                  <select
                    className="plat-settings__input"
                    value={addrNetwork}
                    onChange={(e) => setAddrNetwork(e.target.value)}
                    disabled={savingAddr || readOnly}
                  >
                    {settlementNetworkOptions.map((row) => (
                      <option
                        key={row.network}
                        value={row.network}
                        disabled={!row.enabled}
                      >
                        {networkOptionLabel(row)}
                      </option>
                    ))}
                  </select>
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
          </div>
        </section>

        <section className="plat-settings__card plat-settlement__card plat-settlement__card--matching">
          <div className="plat-settings__card-head">
            <h2 className="plat-settings__card-title">Matching mode</h2>
            <span className="plat-settlement__mode-pill">{matchingModeLabel(mode)}</span>
          </div>
          <div className="plat-settings__card-body">
            <p className="plat-settings__card-copy">{matchingModeScope(mode)}</p>
            <p className="plat-settings__card-note">
              Changing the default does not rewrite open orders — mode is fixed at
              create time.
            </p>
            {mode === "B" || draftMode === "B" ? (
              <aside className="plat-settlement__mode-nudge" role="status">
                <strong>Concurrent same-amount tickets</strong>
                <p>
                  Under Standard, a second cashier cannot open another order for
                  the same amount until the first is completed or cancelled. For
                  busy desks, switch to <strong>Amount fingerprint</strong> or{" "}
                  <strong>Smart address</strong> (xPub required for Smart address).
                </p>
              </aside>
            ) : null}
            <div className="plat-settlement__modes" role="listbox" aria-label="Matching mode">
              {MATCHING_MODE_CARDS.map((card) => {
                const selected = draftMode === card.mode;
                return (
                  <button
                    key={card.mode}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`plat-settlement__mode${selected ? " is-selected" : ""}`}
                    disabled={readOnly}
                    onClick={() => setDraftMode(card.mode)}
                  >
                    <span className="plat-settlement__mode-head">
                      <span className="plat-settlement__mode-key">{card.mode}</span>
                      <strong>{card.label}</strong>
                    </span>
                    <span className="plat-settlement__mode-blurb">{card.blurb}</span>
                    {selected ? <em>Selected</em> : null}
                  </button>
                );
              })}
            </div>
            {draftMode === "B" ? (
              <label className="plat-settings__field">
                <span>Underpay tolerance (Mode B)</span>
                <input
                  className="plat-settings__input"
                  value={underpayTolerance}
                  onChange={(e) => setUnderpayTolerance(e.target.value)}
                  placeholder="0"
                  inputMode="decimal"
                  disabled={readOnly}
                />
                <p className="plat-settings__card-note">
                  Major-unit allowance below the order amount (e.g.{" "}
                  <code>0.01</code>). Same-amount collisions still become Payment
                  Anomaly — never FIFO.
                </p>
              </label>
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
          </div>
        </section>

        <section className="plat-settings__card plat-settlement__card plat-settlement__card--pool">
          <div className="plat-settings__card-head">
            <h2 className="plat-settings__card-title">HD pool (Mode S)</h2>
            <span className="plat-settlement__pool-meta mono">{derivePath}</span>
          </div>
          <div className="plat-settings__card-body">
            <p className="plat-settings__card-copy">
              Watch-only xPub and derived addresses for{" "}
              {displayNetworkForPair(xPubPair.asset, xPubPair.network)}. CryptoGate
              never sweeps or signs.
            </p>

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
              {pool.length === 0 ? (
                <p className="muted plat-settlement__chips-empty">No HD pool rows yet.</p>
              ) : (
                pool.slice(0, 24).map((slot) => (
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

            <form className="plat-settings__payout-form plat-settlement__form" onSubmit={onSaveXpub}>
              <div className="plat-settlement__form-head">
                <h3 className="plat-settlement__form-title">Register or rotate xPub</h3>
                <p className="plat-settings__card-note plat-settlement__form-note">
                  Paste watch-only xPub only. MFA confirms on save. Never paste spend
                  keys or seed phrases.
                </p>
              </div>
              <div className="plat-settlement__field-row plat-settlement__field-row--xpub">
                <label className="plat-settings__field plat-settlement__field--grow">
                  <span>xPub</span>
                  <input
                    className="plat-settings__input mono"
                    value={xPubValue}
                    onChange={(e) => setXPubValue(e.target.value)}
                    required
                    disabled={savingXpub || readOnly}
                    spellCheck={false}
                    autoComplete="off"
                    placeholder="xpub…"
                  />
                </label>
              </div>
              <div className="plat-settlement__form-actions">
                <button
                  type="submit"
                  className="btn-primary plat-settings__submit"
                  disabled={savingXpub || readOnly}
                >
                  Save xPub
                </button>
              </div>
            </form>
          </div>
        </section>
      </div>

      {confirmOpen ? (
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
        </div>
      ) : null}

      {pendingMfa ? (
        <MfaStepUpModal
          onClose={() => setPendingMfa(null)}
          onVerify={verifyPendingMfa}
        />
      ) : null}
    </div>
  );
}
