import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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
import { MATCHING_MODE_CARDS, matchingModeLabel } from "./matchingLabels";
import {
  formatCountdown,
  networkLabel,
  primaryMerchantOrgId,
  truncateAddress,
} from "./org";

type Props = { session: Session };

export function SettlementPage({ session }: Props) {
  const orgId = useMemo(() => primaryMerchantOrgId(session), [session]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState("B");
  const [draftMode, setDraftMode] = useState("B");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [savingMode, setSavingMode] = useState(false);
  const [addresses, setAddresses] = useState<SettlementAddress[]>([]);
  const [xpubs, setXpubs] = useState<XpubSettings[]>([]);
  const [pool, setPool] = useState<HdPoolAddress[]>([]);
  const [derivePath, setDerivePath] = useState("0/{index}");

  const [addrAsset] = useState("USDT");
  const [addrNetwork, setAddrNetwork] = useState("tron");
  const [addrValue, setAddrValue] = useState("");
  const [addrMfa, setAddrMfa] = useState("");
  const [savingAddr, setSavingAddr] = useState(false);

  const [xPubValue, setXPubValue] = useState("");
  const [xPubMfa, setXPubMfa] = useState("");
  const [savingXpub, setSavingXpub] = useState(false);

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
      setDraftMode(m.matchingMode);
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
      const saved = await putMatchingMode(orgId, draftMode);
      setMode(saved.matchingMode);
      setDraftMode(saved.matchingMode);
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
    return <p style={{ color: "var(--muted)" }}>Loading settlement…</p>;
  }

  if (forbidden) {
    return (
      <div className="panel">
        <h2>Settlement</h2>
        <p className="error">{error}</p>
      </div>
    );
  }

  return (
    <div className="settle-stack">
      {cooldownBanner ? (
        <div className="warn-banner" role="status">
          <strong>Settlement address security cool-down active.</strong>{" "}
          {truncateAddress(cooldownBanner.pendingAddress ?? cooldownBanner.address)}{" "}
          pending — {formatCountdown(cooldownBanner.pendingActivatesAt) ?? "waiting"}.
          New orders still use the active address until cool-down ends.
        </div>
      ) : null}

      {error ? <p className="error">{error}</p> : null}

      <section className="panel settle-section">
        <h2>Verified Settlement Address Book</h2>
        <p className="muted">
          Merchant-controlled receive destinations. CryptoGate never holds spend keys.
        </p>
        <div className="table">
          <div className="table-head">
            <span>Network</span>
            <span>Address</span>
            <span>Status</span>
          </div>
          {addresses.length === 0 ? (
            <div className="table-row muted">No settlement addresses yet.</div>
          ) : (
            addresses.map((row) => (
              <div className="table-row" key={`${row.asset}-${row.network}`}>
                <span>
                  {networkLabel(row.network)} · {row.asset}
                </span>
                <span className="mono">{truncateAddress(row.address, 10, 8)}</span>
                <span
                  className={
                    row.status === "pending_cool_down" ? "pill pill-warn" : "pill pill-ok"
                  }
                >
                  {row.status === "pending_cool_down" ? "COOL-DOWN" : "ACTIVE"}
                </span>
              </div>
            ))
          )}
        </div>
        <form className="settle-form" onSubmit={onSaveAddress}>
          <h3>Add / rotate address (MFA required)</h3>
          <div className="field-row">
            <div className="field">
              <label htmlFor="net">Network</label>
              <select
                id="net"
                className="field-control"
                value={addrNetwork}
                onChange={(e) => setAddrNetwork(e.target.value)}
                disabled={savingAddr}
              >
                <option value="tron">TRC-20 (TRON)</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="mfa-addr">MFA code</label>
              <input
                id="mfa-addr"
                className="field-control"
                value={addrMfa}
                onChange={(e) => setAddrMfa(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                disabled={savingAddr}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="addr">Receive address ({addrAsset})</label>
            <input
              id="addr"
              className="field-control"
              value={addrValue}
              onChange={(e) => setAddrValue(e.target.value)}
              required
              disabled={savingAddr}
              spellCheck={false}
            />
          </div>
          <button className="btn-primary" type="submit" disabled={savingAddr}>
            {savingAddr ? "Saving…" : "Save settlement address"}
          </button>
        </form>
      </section>

      <section className="panel settle-section">
        <h2>Selectable Matching Modes</h2>
        <p className="muted">
          Current: <strong>{matchingModeLabel(mode)}</strong>. Changing this does not
          rewrite open orders.
        </p>
        <div className="mode-grid">
          {MATCHING_MODE_CARDS.map((card) => {
            const selected = draftMode === card.mode;
            return (
              <button
                key={card.mode}
                type="button"
                className={`mode-pick${selected ? " selected" : ""}`}
                onClick={() => setDraftMode(card.mode)}
              >
                <strong>{card.label}</strong>
                <span>{card.blurb}</span>
                {selected ? <em>Selected</em> : null}
              </button>
            );
          })}
        </div>
        <button
          className="btn-primary"
          type="button"
          disabled={draftMode === mode || savingMode}
          onClick={() => setConfirmOpen(true)}
        >
          Save matching mode
        </button>
      </section>

      <section className="panel settle-section">
        <h2>Smart HD Address Pool (Mode S)</h2>
        <p className="muted">
          Watch-only xPub presence and derived addresses. Path template:{" "}
          <span className="mono">{derivePath}</span>
        </p>
        <div className="xpub-status">
          {tronXpub?.xPubConfigured ? (
            <span className="pill pill-ok">
              xPub configured
              {tronXpub.pendingXPub
                ? ` · cool-down ${formatCountdown(tronXpub.pendingActivatesAt) ?? ""}`
                : " · active"}
            </span>
          ) : (
            <span className="pill pill-warn">xPub not configured — Mode S falls back to Standard</span>
          )}
        </div>
        <div className="pool-meta">
          Utilization {inUse} / {poolTotal || "—"}
        </div>
        <div className="hd-chips">
          {pool.length === 0 ? (
            <span className="muted">No HD pool rows yet.</span>
          ) : (
            pool.slice(0, 24).map((slot) => (
              <span
                key={slot.id}
                className={`hd-chip hd-${slot.status.toLowerCase()}`}
                title={slot.receiveAddress}
              >
                {truncateAddress(slot.receiveAddress, 4, 3)} · {slot.status}
              </span>
            ))
          )}
        </div>
        <form className="settle-form" onSubmit={onSaveXpub}>
          <h3>Register / rotate xPub (MFA required)</h3>
          <p className="muted">
            Paste watch-only xPub only. Never paste spend keys or seed phrases. GET never
            returns the full xPub.
          </p>
          <div className="field">
            <label htmlFor="xpub">xPub</label>
            <input
              id="xpub"
              className="field-control"
              value={xPubValue}
              onChange={(e) => setXPubValue(e.target.value)}
              required
              disabled={savingXpub}
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label htmlFor="mfa-xpub">MFA code</label>
            <input
              id="mfa-xpub"
              className="field-control"
              value={xPubMfa}
              onChange={(e) => setXPubMfa(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              disabled={savingXpub}
            />
          </div>
          <button className="btn-primary" type="submit" disabled={savingXpub}>
            {savingXpub ? "Saving…" : "Save xPub"}
          </button>
        </form>
      </section>

      {confirmOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <h3>Confirm matching mode</h3>
            <p>
              Switch to <strong>{matchingModeLabel(draftMode)}</strong>? Applies to{" "}
              <strong>new orders only</strong>. Open orders keep their create-time mode.
            </p>
            <div className="modal-actions">
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
      ) : null}
    </div>
  );
}
