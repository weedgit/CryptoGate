import { FormEvent, useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { AuthField } from "./AuthField";
import { AuthToast } from "./AuthToast";
import { MfaCodeInput } from "./MfaCodeInput";
import {
  sessionNeedsOrgSetup,
  sessionLiveActionsUnlocked,
} from "./contactVerification";
import {
  ApiError,
  getSession,
  sendEmailOtp,
  sendPhoneOtp,
  verifyEmailOtp,
  verifyPhoneOtp,
  type Session,
} from "../merchant/api";
import { agentRoute, merchantRoute } from "../shared/portalRouting";

type Props = {
  session: Session;
  onSession: (session: Session) => void;
  portal: "agent" | "merchant";
};

function missingSetupParts(session: Session): string {
  const parts: string[] = [];
  if (session.emailVerified !== true || session.phoneVerified !== true) {
    parts.push(
      session.emailVerified === true
        ? "phone"
        : session.phoneVerified === true
          ? "email"
          : "email and phone",
    );
  }
  if (session.profileComplete === false) parts.push("country");
  if (session.walletSet === false) parts.push("wallet");
  if (parts.length === 0) return "account setup";
  return parts.join(", ");
}

export function VerifyContactBanner({ session, onSession, portal }: Props) {
  const [open, setOpen] = useState(false);
  if (!sessionNeedsOrgSetup(session)) return null;

  const profilePath =
    portal === "agent" ? agentRoute("settings") : merchantRoute("settings/team");
  const walletPath =
    portal === "agent"
      ? agentRoute("settings")
      : merchantRoute("settings/settlement");

  return (
    <>
      <div className="verify-contact-banner" role="status">
        <span className="cashier-lock" aria-hidden>
          ✉
        </span>
        <p>
          You can look around.{" "}
          <strong>Live actions stay locked</strong> until you finish{" "}
          {missingSetupParts(session)}.
        </p>
        <button type="button" className="btn-primary btn-inline" onClick={() => setOpen(true)}>
          Finish setup
        </button>
      </div>
      {open ? (
        <OrgSetupModal
          session={session}
          portal={portal}
          profilePath={profilePath}
          walletPath={walletPath}
          onSession={(next) => {
            onSession(next);
            if (sessionLiveActionsUnlocked(next)) setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function OrgSetupModal({
  session,
  portal,
  profilePath,
  walletPath,
  onSession,
  onClose,
}: {
  session: Session;
  portal: "agent" | "merchant";
  profilePath: string;
  walletPath: string;
  onSession: (session: Session) => void;
  onClose: () => void;
}) {
  const contactDone =
    session.emailVerified === true && session.phoneVerified === true;
  const profileDone = session.profileComplete !== false;
  const walletDone = session.walletSet !== false;

  async function refreshSession() {
    try {
      onSession(await getSession());
    } catch {
      /* keep current */
    }
  }

  return (
    <div
      className="verify-contact-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="verify-contact-title"
    >
      <button
        type="button"
        className="verify-contact-modal__backdrop"
        onClick={onClose}
        aria-label="Close"
      />
      <div className="verify-contact-modal__card login-card">
        <div className="login-card-head">
          <h2 id="verify-contact-title">Finish account setup</h2>
          <p>
            Verify contacts, set country, and add a{" "}
            {portal === "agent" ? "payout" : "settlement"} wallet before creating
            orders, merchants, or invites.
          </p>
        </div>

        <div className="verify-contact-steps">
          <section>
            <h3>1. Email &amp; phone</h3>
            {contactDone ? (
              <p className="verify-contact-step verify-contact-step--done">
                Verified
              </p>
            ) : (
              <>
                <EmailOtpStep session={session} onSession={onSession} />
                <PhoneOtpStep session={session} onSession={onSession} />
              </>
            )}
          </section>
          <section>
            <h3>2. Business name &amp; country</h3>
            {profileDone ? (
              <p className="verify-contact-step verify-contact-step--done">
                Profile complete
              </p>
            ) : (
              <p>
                Set country on your organization.{" "}
                <Link
                  to={profilePath}
                  onClick={() => {
                    void refreshSession();
                    onClose();
                  }}
                >
                  Open settings
                </Link>
              </p>
            )}
          </section>
          <section>
            <h3>
              3. {portal === "agent" ? "Payout" : "Settlement"} wallet
            </h3>
            {walletDone ? (
              <p className="verify-contact-step verify-contact-step--done">
                Wallet set
              </p>
            ) : (
              <p>
                Add a receive address.{" "}
                <Link
                  to={walletPath}
                  onClick={() => {
                    void refreshSession();
                    onClose();
                  }}
                >
                  Open wallet settings
                </Link>
              </p>
            )}
          </section>
        </div>

        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            void refreshSession();
            onClose();
          }}
        >
          Continue browsing
        </button>
      </div>
    </div>
  );
}

function EmailOtpStep({
  session,
  onSession,
}: {
  session: Session;
  onSession: (session: Session) => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (session.emailVerified) {
    return (
      <p className="verify-contact-step verify-contact-step--done">
        Email verified — {session.email}
      </p>
    );
  }

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const result = await sendEmailOtp();
      if (result.session) onSession(result.session);
      setSent(true);
      if (result.devCode) setCode(result.devCode);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send email code");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (code.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      onSession(await verifyEmailOtp(code));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Invalid code");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="verify-contact-step" onSubmit={(e) => void submit(e)}>
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />
      <p>
        Confirm <strong>{session.email}</strong>. Skip this if you already used the
        invite link from that inbox.
      </p>
      {sent ? (
        <>
          <MfaCodeInput value={code} onChange={setCode} disabled={busy} submitOnComplete={false} />
          <button type="submit" className="btn-primary" disabled={busy || code.length !== 6}>
            {busy ? "Checking…" : "Confirm email"}
          </button>
        </>
      ) : (
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void send()}>
          {busy ? "Sending…" : "Email me a code"}
        </button>
      )}
    </form>
  );
}

function PhoneOtpStep({
  session,
  onSession,
}: {
  session: Session;
  onSession: (session: Session) => void;
}) {
  const [phone, setPhone] = useState(session.phone ?? "+");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const onPhoneChange = useCallback((value: string) => {
    setPhone(value.startsWith("+") ? value : `+${value.replace(/\D/g, "")}`);
  }, []);

  if (session.phoneVerified) {
    return (
      <p className="verify-contact-step verify-contact-step--done">
        Phone verified — {session.phone}
      </p>
    );
  }

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const result = await sendPhoneOtp(phone);
      if (result.session) onSession(result.session);
      setSent(true);
      if (result.phone) setPhone(result.phone);
      if (result.devCode) setCode(result.devCode);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send SMS code");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (code.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      onSession(await verifyPhoneOtp(code));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Invalid code");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="verify-contact-step" onSubmit={(e) => void submit(e)}>
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />
      <AuthField
        id="verify-phone"
        label="Mobile number"
        value={phone}
        onChange={onPhoneChange}
        disabled={busy || sent}
        autoComplete="tel"
      />
      {sent ? (
        <>
          <MfaCodeInput value={code} onChange={setCode} disabled={busy} submitOnComplete={false} />
          <button type="submit" className="btn-primary" disabled={busy || code.length !== 6}>
            {busy ? "Checking…" : "Confirm phone"}
          </button>
        </>
      ) : (
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void send()}>
          {busy ? "Sending…" : "Text me a code"}
        </button>
      )}
    </form>
  );
}
