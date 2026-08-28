import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AuthToast } from "../auth/AuthToast";
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
  networkLabel,
  primaryMerchantOrgId,
  truncateAddress,
} from "./org";
import {
  defaultLivePair,
  isLivePair,
  pairSelectLabel,
  pairsForAsset,
  uniqueAssetsFromRegistry,
} from "../shared/assetNetworks";

type Props = { session: Session };

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
  const [addrAsset, setAddrAsset] = useState(initialPair.asset);
  const [addrNetwork, setAddrNetwork] = useState(initialPair.network);
  const [addrValue, setAddrValue] = useState("");
  const [addrMfa, setAddrMfa] = useState("");
  const [savingAddr, setSavingAddr] = useState(false);

  const [xPubValue, setXPubValue] = useState("");
  const [xPubMfa, setXPubMfa] = useState("");
  const [savingXpub, setSavingXpub] = useState(false);

  const settlementAssets = useMemo(() => uniqueAssetsFromRegistry(), []);
  const settlementNetworkOptions = useMemo(
    () => pairsForAsset(addrAsset),
    [addrAsset],
  );
  const settlementPairLive = isLivePair(addrAsset, addrNetwork);
  const readOnly = modeSource === "inherit";

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
  const tronXpub = xpubs.find((x) => x.asset === "USDT" && x.network === "tron");
  const inUse = pool.filter((p) => p.status === "IN_USE").length;
  const poolTotal = pool.length;

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
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save matching mode failed");
    } finally {
      setSavingMode(false);
    }
  }

  async function onSaveAddress(e: FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setSavingAddr(true);
    setError(null);
    try {
      await putSettlement(orgId, {
        asset: addrAsset,
        network: addrNetwork,
        address: addrValue.trim(),
        mfaCode: addrMfa.trim(),
      });
      setAddrValue("");
      setAddrMfa("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save address failed");
    } finally {
      setSavingAddr(false);
    }
  }

  async function onSaveXpub(e: FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setSavingXpub(true);
    setError(null);
    try {
      await putXpub(orgId, {
        asset: "USDT",
        network: "tron",
        xPub: xPubValue.trim(),
        mfaCode: xPubMfa.trim(),
      });
      setXPubValue("");
      setXPubMfa("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save xPub failed");
    } finally {
      setSavingXpub(false);
    }
  }

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
      <div className="plat-settings plat-settings--merchant">
        <section className="plat-settings__card">
          <div className="plat-settings__card-head">
            <h2 className="plat-settings__card-title">Settlement</h2>
          </div>
          <div className="plat-settings__card-body">
            <p className="error">{error}</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="plat-settings plat-settings--merchant plat-settlement">
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />

      {cooldownBanner ? (
        <p className="plat-settings__notice" role="status">
          Settlement address cool-down active —{" "}
          {truncateAddress(cooldownBanner.pendingAddress ?? cooldownBanner.address)}{" "}
          pending ({formatCountdown(cooldownBanner.pendingActivatesAt) ?? "waiting"}).
          New orders still use the active address until cool-down ends.
        </p>
      ) : null}

      {readOnly ? (
        <p className="plat-settings__notice" role="status">
          Inheriting parent merchant defaults. Wallet, matching mode, and xPub come
          from the parent until the parent Owner approves an override.{" "}
          <Link to={`/merchant/sites/${orgId}`}>Request override</Link>
        </p>
      ) : null}

      <div className="plat-settings__grid plat-settings__grid--single">
        <section className="plat-settings__card">
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
                <table className="plat-bills__table b3-settlement__table">
                  <thead>
                    <tr>
                      <th>Network</th>
                      <th>Address</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {addresses.map((row) => (
                      <tr key={`${row.asset}-${row.network}`}>
                        <td>
                          {networkLabel(row.network)} · {row.asset}
                        </td>
                        <td className="mono">{truncateAddress(row.address, 10, 8)}</td>
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
            <form className="plat-settings__payout-form" onSubmit={onSaveAddress}>
              <h3 className="plat-settlement__form-title">Add or rotate address</h3>
              <p className="plat-settings__card-note plat-settlement__form-note">
                MFA required. Changes enter a cool-down before they become active.
              </p>
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
                      <option key={row.network} value={row.network} disabled={!row.enabled}>
                        {pairSelectLabel(row)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="plat-settings__field">
                  <span>MFA code</span>
                  <input
                    className="plat-settings__input"
                    value={addrMfa}
                    onChange={(e) => setAddrMfa(e.target.value)}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    disabled={savingAddr || readOnly}
                  />
                </label>
              </div>
              <label className="plat-settings__field">
                <span>Receive address ({addrAsset})</span>
                <input
                  className="plat-settings__input"
                  value={addrValue}
                  onChange={(e) => setAddrValue(e.target.value)}
                  required
                  disabled={savingAddr || readOnly}
                  spellCheck={false}
                />
              </label>
              <button
                type="submit"
                className="btn-primary plat-settings__submit"
                disabled={savingAddr || readOnly || !settlementPairLive}
              >
                {savingAddr ? "Saving…" : "Save settlement address"}
              </button>
            </form>
          </div>
        </section>

        <section className="plat-settings__card">
          <div className="plat-settings__card-head">
            <h2 className="plat-settings__card-title">Matching mode</h2>
            <span className="b3-settlement__mode-pill">{matchingModeLabel(mode)}</span>
          </div>
          <div className="plat-settings__card-body">
            <p className="plat-settings__card-copy">{matchingModeScope(mode)}</p>
            <p className="plat-settings__card-note">
              Changing the default does not rewrite open orders — mode is fixed at
              create time.
            </p>
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
                    <strong>{card.label}</strong>
                    <span>{card.blurb}</span>
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
        </section>

        <section className="plat-settings__card">
          <div className="plat-settings__card-head">
            <h2 className="plat-settings__card-title">HD pool (Mode S)</h2>
          </div>
          <div className="plat-settings__card-body">
            <p className="plat-settings__card-copy">
              Watch-only xPub and derived addresses. Path template:{" "}
              <code className="mono">{derivePath}</code>
            </p>
            <dl className="plat-settings__dl plat-settings__dl--rows">
              <div>
                <dt>xPub status</dt>
                <dd>
                  {tronXpub?.xPubConfigured ? (
                    <>
                      Configured
                      {tronXpub.pendingXPub
                        ? ` · cool-down ${formatCountdown(tronXpub.pendingActivatesAt) ?? ""}`
                        : " · active"}
                    </>
                  ) : (
                    "Not configured — Mode S falls back to Standard"
                  )}
                </dd>
              </div>
              <div>
                <dt>Pool utilization</dt>
                <dd>
                  {inUse} in use / {poolTotal || "—"} total
                </dd>
              </div>
            </dl>
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
            <form className="plat-settings__payout-form" onSubmit={onSaveXpub}>
              <h3 className="plat-settlement__form-title">Register or rotate xPub</h3>
              <p className="plat-settings__card-note plat-settlement__form-note">
                Paste watch-only xPub only. Never paste spend keys or seed phrases.
              </p>
              <label className="plat-settings__field">
                <span>xPub</span>
                <input
                  className="plat-settings__input"
                  value={xPubValue}
                  onChange={(e) => setXPubValue(e.target.value)}
                  required
                  disabled={savingXpub || readOnly}
                  spellCheck={false}
                  autoComplete="off"
                />
              </label>
              <label className="plat-settings__field">
                <span>MFA code</span>
                <input
                  className="plat-settings__input"
                  value={xPubMfa}
                  onChange={(e) => setXPubMfa(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  disabled={savingXpub || readOnly}
                />
              </label>
              <button
                type="submit"
                className="btn-primary plat-settings__submit"
                disabled={savingXpub || readOnly}
              >
                {savingXpub ? "Saving…" : "Save xPub"}
              </button>
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
    </div>
  );
}
