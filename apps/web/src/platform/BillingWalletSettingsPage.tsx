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
  ApiError,
  getBillingWalletSettings,
  updateBillingWalletSettings,
  type Session,
} from "./api";
import { sessionIsPlatformOwner } from "./org";
import { PlatformPending } from "./ui/PlatformPending";

type Props = { session: Session };

/** B11-lite — platform billing wallet + invoice seller identity. */
export function BillingWalletSettingsPage({ session }: Props) {
  const canEdit = useMemo(() => sessionIsPlatformOwner(session), [session]);
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
  const [savePulse, setSavePulse] = useState(false);

  const dirty =
    sellerName !== savedSellerName ||
    sellerEmail !== savedSellerEmail ||
    payTo !== savedPayTo;

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
        err instanceof ApiError ? err.message : "Failed to load billing settings",
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
        "Billing wallet saved. Service-bill checkout and invoices use this pay-to without redeploy.",
      );
      setSavePulse(true);
      window.setTimeout(() => setSavePulse(false), 400);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to save billing settings",
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <PlatformPending
        title="Loading billing wallet"
        copy="Fetching platform remittance destination and invoice seller identity."
      />
    );
  }

  return (
    <form className="plat-settings" onSubmit={onSave}>
      <AuthToast
        message={error ?? message}
        tone={error ? "error" : "ok"}
        onDismiss={() => {
          setError(null);
          setMessage(null);
        }}
      />
      <header className="plat-settings__head">
        <div>
          <h1 className="plat-settings__title">Billing wallet</h1>
          <p className="plat-settings__lede muted">
            Seller identity and remittance for{" "}
            <strong>service bills</strong> (merchant → platform). Separate from
            merchant settlement addresses.
          </p>
        </div>
        {canEdit ? (
          <button
            type="submit"
            className={`plat-settings__save${savePulse ? " is-pulse" : ""}`}
            disabled={busy || !dirty}
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        ) : (
          <p className="plat-settings__readonly">Owner edit · Admin/Viewer read-only</p>
        )}
      </header>

      {dirty && canEdit ? (
        <p className="plat-settings__dirty" role="status">
          Unsaved changes
        </p>
      ) : null}

      <div className="plat-settings__grid">
        <section className="plat-settings__card" style={{ animationDelay: "0ms" }}>
          <h3 className="plat-settings__card-title">Invoice seller</h3>
          <label className="plat-settings__field">
            <span className="plat-settings__row-label">Legal / display name</span>
            <input
              className="plat-settings__input"
              value={sellerName}
              disabled={!canEdit || busy}
              onChange={(e) => setSellerName(e.target.value)}
              maxLength={200}
              autoComplete="organization"
            />
          </label>
          <label className="plat-settings__field">
            <span className="plat-settings__row-label">Billing contact email</span>
            <input
              className="plat-settings__input"
              type="email"
              value={sellerEmail}
              disabled={!canEdit || busy}
              onChange={(e) => setSellerEmail(e.target.value)}
              maxLength={254}
              placeholder="billing@example.com"
              autoComplete="email"
            />
          </label>
        </section>

        <section className="plat-settings__card" style={{ animationDelay: "40ms" }}>
          <h3 className="plat-settings__card-title">Remittance (pay-to)</h3>
          <p className="plat-settings__row-hint">
            Merchants pay service bills here via checkout — not the guest payment
            page. Empty falls back to{" "}
            <code className="mono">PLATFORM_BILLING_PAY_TO</code> on the API.
          </p>
          <label className="plat-settings__field">
            <span className="plat-settings__row-label">Pay-to address / instruction</span>
            <textarea
              className="plat-settings__textarea"
              value={payTo}
              disabled={!canEdit || busy}
              onChange={(e) => setPayTo(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="T… wallet or bank remittance reference"
            />
          </label>
          {payTo ? (
            <div className="plat-settings__qr-preview" aria-label="Pay-to preview">
              <p className="plat-settings__row-label">Preview</p>
              <p className="mono plat-settings__payto">{payTo}</p>
            </div>
          ) : null}
          <p className="plat-settings__row-hint">
            Rotation: update here, then notify merchants with open bills. Changes
            are audited as <code className="mono">billing_wallet_put</code>.
          </p>
        </section>
      </div>

      <footer className="plat-settings__foot muted">
        {updatedAt ? (
          <span>Last updated {new Date(updatedAt).toLocaleString()}</span>
        ) : null}
        <Link to="/platform/service-bills">View service bills</Link>
      </footer>
    </form>
  );
}
