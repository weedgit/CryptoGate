import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link } from "react-router-dom";
import { AuthToast } from "../auth/AuthToast";
import {
  SERVICE_BILL_ASSET,
  SERVICE_BILL_NETWORK,
} from "../billing/ServiceBillPayQrCard";
import { displayNetworkForPair } from "../shared/assetNetworks";
import { FieldControl } from "../ui/FieldControl";
import {
  ApiError,
  getBillingWalletSettings,
  updateBillingWalletSettings,
  type Session,
} from "./api";
import { AssetIcon, NetworkIcon } from "./cryptoIcons";
import { sessionIsPlatformOwner } from "./org";
import { PlatformPending } from "./ui/PlatformPending";

type Props = {
  session: Session;
  /** Notify parent when local edits are unsaved (for tab-leave confirm). */
  onDirtyChange?: (dirty: boolean) => void;
};

/** B11-lite — crypto fee wallet + invoice seller, embedded under Fees → Fee wallet. */
export function BillingWalletPanel({ session, onDirtyChange }: Props) {
  const canEdit = useMemo(() => sessionIsPlatformOwner(session), [session]);
  const feeNetworkLabel = useMemo(
    () => displayNetworkForPair(SERVICE_BILL_ASSET, SERVICE_BILL_NETWORK),
    [],
  );
  const [sellerName, setSellerName] = useState("CryptoGate");
  const [sellerEmail, setSellerEmail] = useState("");
  const [payTo, setPayTo] = useState("");
  const [savedSellerName, setSavedSellerName] = useState("CryptoGate");
  const [savedSellerEmail, setSavedSellerEmail] = useState("");
  const [savedPayTo, setSavedPayTo] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const dirty =
    sellerName !== savedSellerName ||
    sellerEmail !== savedSellerEmail ||
    payTo !== savedPayTo;

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const settings = await getBillingWalletSettings();
      setSellerName(settings.sellerName);
      setSavedSellerName(settings.sellerName);
      setSellerEmail(settings.sellerEmail ?? "");
      setSavedSellerEmail(settings.sellerEmail ?? "");
      setPayTo(settings.payTo ?? "");
      setSavedPayTo(settings.payTo ?? "");
      setUpdatedAt(settings.updatedAt);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to load fee wallet settings",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    const name = sellerName.trim();
    if (!name) {
      setError("Seller name is required");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const settings = await updateBillingWalletSettings({
        sellerName: name,
        sellerEmail: sellerEmail.trim() || null,
        payTo: payTo.trim() || null,
      });
      setSellerName(settings.sellerName);
      setSavedSellerName(settings.sellerName);
      setSellerEmail(settings.sellerEmail ?? "");
      setSavedSellerEmail(settings.sellerEmail ?? "");
      setPayTo(settings.payTo ?? "");
      setSavedPayTo(settings.payTo ?? "");
      setUpdatedAt(settings.updatedAt);
      setMessage(
        "Fee wallet saved. Merchants will see this address when they pay platform fees.",
      );
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to save fee wallet settings",
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <PlatformPending
        title="Loading fee wallet"
        copy="Fetching the crypto address merchants use to pay platform fees."
      />
    );
  }

  return (
    <div className="plat-fee-billing">
      <AuthToast
        message={error ?? message}
        tone={error ? "error" : "ok"}
        onDismiss={() => {
          setError(null);
          setMessage(null);
        }}
      />

      {dirty && canEdit ? (
        <div className="plat-fee-bands__dirty" role="status">
          Unsaved changes — save before leaving this tab.
        </div>
      ) : null}

      {!canEdit ? (
        <p className="plat-fee-bands__readonly">
          Platform Owner only — Administrators and Viewers are read-only.
        </p>
      ) : null}

      <form className="plat-fee-billing__form" onSubmit={onSave}>
        <div className="plat-fee-billing__grid">
          <section className="plat-fee-billing__card">
            <header className="plat-fee-billing__card-head">
              <div>
                <h3>Invoice seller</h3>
                <p>Your platform name and contact as they appear on fee invoices.</p>
              </div>
            </header>
            <div className="plat-fee-billing__fields">
              <div className="b4-field">
                <label className="b4-field__label" htmlFor="billing-seller-name">
                  Business name
                </label>
                <FieldControl icon="user">
                  <input
                    id="billing-seller-name"
                    className="b4-field__control"
                    value={sellerName}
                    disabled={!canEdit || busy}
                    onChange={(e) => setSellerName(e.target.value)}
                    maxLength={200}
                    autoComplete="organization"
                  />
                </FieldControl>
              </div>
              <div className="b4-field">
                <label className="b4-field__label" htmlFor="billing-seller-email">
                  Contact email
                </label>
                <FieldControl icon="mail">
                  <input
                    id="billing-seller-email"
                    className="b4-field__control"
                    type="email"
                    value={sellerEmail}
                    disabled={!canEdit || busy}
                    onChange={(e) => setSellerEmail(e.target.value)}
                    maxLength={254}
                    placeholder="finance@example.com"
                    autoComplete="email"
                  />
                </FieldControl>
                <p className="b4-field__hint">
                  Shown on invoices only — this does not create a login.
                </p>
              </div>
            </div>
          </section>

          <section className="plat-fee-billing__card plat-fee-billing__card--remit">
            <header className="plat-fee-billing__card-head">
              <div>
                <h3>Platform wallet address</h3>
                <p>
                  Merchants pay platform fees in{" "}
                  <strong>USDT on {feeNetworkLabel}</strong>. Paste the Tron
                  wallet that should receive those transfers — separate from
                  guest payment pages.
                </p>
                <div
                  className="plat-fee-billing__rail"
                  aria-label={`Platform fees: ${SERVICE_BILL_ASSET} on ${feeNetworkLabel}`}
                >
                  <span className="plat-fee-billing__rail-chip">
                    <AssetIcon asset={SERVICE_BILL_ASSET} />
                    <span>{SERVICE_BILL_ASSET}</span>
                  </span>
                  <span className="plat-fee-billing__rail-sep" aria-hidden>
                    ·
                  </span>
                  <span className="plat-fee-billing__rail-chip">
                    <NetworkIcon network={SERVICE_BILL_NETWORK} />
                    <span>{feeNetworkLabel}</span>
                  </span>
                </div>
              </div>
            </header>
            <div className="plat-fee-billing__fields">
              <div className="b4-field">
                <label className="b4-field__label" htmlFor="billing-pay-to">
                  Wallet address
                </label>
                <FieldControl
                  icon="coins"
                  shellClassName="plat-fee-billing__shell--textarea"
                >
                  <textarea
                    id="billing-pay-to"
                    className="b4-field__control plat-fee-billing__textarea"
                    value={payTo}
                    disabled={!canEdit || busy}
                    onChange={(e) => setPayTo(e.target.value)}
                    maxLength={500}
                    rows={4}
                    placeholder="Paste Tron USDT wallet address (starts with T)"
                  />
                </FieldControl>
              </div>
            </div>
          </section>
        </div>

        <div className="plat-fee-bands__actions">
          <p className="plat-fee-bands__actions-note">
            {dirty
              ? "You have unsaved fee wallet changes."
              : updatedAt
                ? `Last saved ${new Date(updatedAt).toLocaleString()}`
                : "Fee wallet matches the saved settings."}{" "}
            <Link className="plat-fee-billing__bills-link" to="/platform/service-bills">
              View service bills
            </Link>
          </p>
          {canEdit ? (
            <div className="plat-fee-bands__actions-buttons">
              <button
                type="submit"
                className="btn-primary plat-fee-bands__save"
                disabled={busy || !dirty}
              >
                {busy ? "Saving…" : "Save Platform Wallet"}
              </button>
            </div>
          ) : null}
        </div>
      </form>
    </div>
  );
}
