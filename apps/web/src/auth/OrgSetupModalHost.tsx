import { FormEvent, useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { OnboardWizardBrandHead } from "../shared/onboardMerchantUi";
import { AuthField } from "./AuthField";
import { AuthToast } from "./AuthToast";
import { MfaCodeInput } from "./MfaCodeInput";
import { SETUP_QUERY_PARAM, sessionNeedsOrgSetup } from "./contactVerification";
import {
  ApiError,
  getSession,
  sendEmailOtp,
  sendPhoneOtp,
  verifyEmailOtp,
  verifyPhoneOtp,
  type Session,
} from "../merchant/api";
import { merchantRoute } from "../shared/portalRouting";
import { ORG_EDIT_PARAM, PROFILE_EDIT_PARAM, withEditParam } from "../shared/modalLinks";

type Props = {
  session: Session;
  onSession: (session: Session) => void;
  portal: "agent" | "merchant";
};

/**
 * Opens the Finish-setup modal when the URL carries `?setup=1`
 * (from the Watch-only dock alert). Renders nothing otherwise.
 */
export function OrgSetupModalHost({ session, onSession, portal }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const requested =
    new URLSearchParams(location.search).get(SETUP_QUERY_PARAM) === "1";
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!requested) return;
    const params = new URLSearchParams(location.search);
    params.delete(SETUP_QUERY_PARAM);
    const search = params.toString();
    navigate(
      { pathname: location.pathname, search: search ? `?${search}` : "" },
      { replace: true },
    );
    if (sessionNeedsOrgSetup(session)) setOpen(true);
  }, [requested, location.pathname, location.search, navigate, session]);

  if (!open) return null;

  const profilePath =
    portal === "agent"
      ? withEditParam(location.pathname, ORG_EDIT_PARAM)
      : withEditParam(merchantRoute("settings/team"), ORG_EDIT_PARAM);
  const personPath =
    portal === "agent"
      ? withEditParam(location.pathname, PROFILE_EDIT_PARAM)
      : merchantRoute("settings/security");
  const walletPath =
    portal === "agent"
      ? withEditParam(location.pathname, ORG_EDIT_PARAM)
      : merchantRoute("settings/settlement");

  return (
    <OrgSetupModal
      session={session}
      portal={portal}
      profilePath={profilePath}
      personPath={personPath}
      walletPath={walletPath}
      onSession={(next) => {
        onSession(next);
        if (!sessionNeedsOrgSetup(next)) setOpen(false);
      }}
      onClose={() => setOpen(false)}
    />
  );
}

function OrgSetupModal({
  session,
  portal,
  profilePath,
  personPath,
  walletPath,
  onSession,
  onClose,
}: {
  session: Session;
  portal: "agent" | "merchant";
  profilePath: string;
  personPath: string;
  walletPath: string;
  onSession: (session: Session) => void;
  onClose: () => void;
}) {
  const contactDone =
    session.emailVerified === true && session.phoneVerified === true;
  const personDone =
    session.personComplete === true ||
    (Boolean(session.firstName?.trim()) &&
      Boolean(session.lastName?.trim()) &&
      Boolean(session.timezone?.trim()));
  const profileDone = session.profileComplete !== false;
  const walletDone = session.walletSet !== false;

  const walletLabel = portal === "agent" ? "Payout" : "Tron settlement";
  const doneFlags = [contactDone, personDone, profileDone, walletDone];
  const doneCount = doneFlags.filter(Boolean).length;
  const activeStep = doneFlags.findIndex((d) => !d) + 1;
  const [openStep, setOpenStep] = useState<number | null>(activeStep || null);
  const toggleStep = (n: number) => setOpenStep((cur) => (cur === n ? null : n));

  async function refreshSession() {
    try {
      onSession(await getSession());
    } catch {
      /* keep current */
    }
  }

  function dismiss() {
    void refreshSession();
    onClose();
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismiss]);

  return createPortal(
    <div className="b4-wizard-portal org-setup-portal" role="presentation" onClick={dismiss}>
      <div
        className="org-setup-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="org-setup-title"
        onClick={(e) => e.stopPropagation()}
      >
        <OnboardWizardBrandHead
          titleId="org-setup-title"
          title="Finish account setup"
          subtitle="Complete these steps to unlock live actions: orders, invites and onboarding."
          onClose={dismiss}
          icon={<ShieldCheckIcon />}
        />

        <div className="org-setup-modal__body">
          <div className="org-setup-modal__progress" role="status">
            <div className="org-setup-modal__progress-row">
              <span>
                <strong>{doneCount}</strong> of 4 steps complete
              </span>
              <span className="org-setup-modal__mode">
                <EyeIcon /> Watch-only
              </span>
            </div>
            <div className="org-setup-modal__bar" aria-hidden>
              <span style={{ width: `${(doneCount / 4) * 100}%` }} />
            </div>
          </div>

          <ol className="org-setup-modal__steps">
            <SetupStep
              n={1}
              icon={<MailIcon />}
              title="Email & phone"
              done={contactDone}
              active={activeStep === 1}
              open={openStep === 1}
              onToggle={() => toggleStep(1)}
              description="Confirm the contacts we use for security codes and alerts."
            >
              <div className="org-setup-step__panel">
                <EmailOtpStep session={session} onSession={onSession} />
                <PhoneOtpStep session={session} onSession={onSession} />
              </div>
            </SetupStep>
            <SetupStep
              n={2}
              icon={<UserIcon />}
              title="Your name"
              done={personDone}
              active={activeStep === 2}
              open={openStep === 2}
              onToggle={() => toggleStep(2)}
              description="Add your first and last name on your profile."
            >
              <Link className="org-setup-step__link" to={personPath} onClick={dismiss}>
                Open profile →
              </Link>
            </SetupStep>
            <SetupStep
              n={3}
              icon={<BuildingIcon />}
              title="Business profile"
              done={profileDone}
              active={activeStep === 3}
              open={openStep === 3}
              onToggle={() => toggleStep(3)}
              description={`Set billing email${portal === "merchant" ? " and country" : ""} on your organization.`}
            >
              <Link className="org-setup-step__link" to={profilePath} onClick={dismiss}>
                Open settings →
              </Link>
            </SetupStep>
            <SetupStep
              n={4}
              icon={<WalletIcon />}
              title={`${walletLabel} wallet`}
              done={walletDone}
              active={activeStep === 4}
              open={openStep === 4}
              onToggle={() => toggleStep(4)}
              description={
                portal === "agent"
                  ? "Add the receive address for commission payouts."
                  : "Add a Tron (USDT) settlement wallet. It is required; other networks are optional."
              }
            >
              <Link className="org-setup-step__link" to={walletPath} onClick={dismiss}>
                Open wallet settings →
              </Link>
            </SetupStep>
          </ol>
        </div>

        <footer className="b4-wizard__foot org-setup-modal__foot">
          <span className="org-setup-modal__foot-note">
            <InfoIcon /> You can finish later from the Watch-only alert.
          </span>
          <button
            type="button"
            className="b4-wizard__cancel org-setup-modal__continue"
            onClick={dismiss}
          >
            Continue browsing <ChevronIcon direction="right" />
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function SetupStep({
  n,
  icon,
  title,
  done,
  active,
  open,
  onToggle,
  description,
  children,
}: {
  n: number;
  icon: ReactNode;
  title: string;
  done: boolean;
  active: boolean;
  open: boolean;
  onToggle: () => void;
  description: string;
  children: ReactNode;
}) {
  const bodyId = `org-setup-step-${n}`;
  return (
    <li
      className={[
        "org-setup-step",
        done ? "is-done" : "",
        active ? "is-active" : "",
        open ? "is-open" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest(".org-setup-step__body")) return;
        onToggle();
      }}
    >
      <span className="org-setup-step__marker" aria-hidden>
        {done ? <CheckIcon size={16} /> : n}
      </span>
      <span className="org-setup-step__icon" aria-hidden>
        {icon}
      </span>
      <div className="org-setup-step__main">
        <div className="org-setup-step__head">
          <h3>{title}</h3>
          <span className={`org-setup-step__chip${done ? " is-done" : active ? " is-active" : ""}`}>
            {done ? <CheckIcon size={12} /> : <span className="org-setup-step__dot" aria-hidden />}
            {done ? "Complete" : "To do"}
          </span>
          <button
            type="button"
            className={`org-setup-step__toggle${open ? " is-open" : ""}`}
            aria-expanded={open}
            aria-controls={bodyId}
            aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
          >
            <ChevronIcon direction="down" />
          </button>
        </div>
        {open ? (
          <div id={bodyId} className="org-setup-step__body">
            <p className="org-setup-step__desc">{description}</p>
            {done ? null : children}
          </div>
        ) : null}
      </div>
    </li>
  );
}

function StepSvg({ children }: { children: ReactNode }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

function MailIcon() {
  return (
    <StepSvg>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3.5 6.5l8.5 6 8.5-6" />
    </StepSvg>
  );
}

function UserIcon() {
  return (
    <StepSvg>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20c.8-3.6 3.8-5.6 7.5-5.6s6.7 2 7.5 5.6" />
    </StepSvg>
  );
}

function BuildingIcon() {
  return (
    <StepSvg>
      <path d="M4 20V5.5L12 3v17" />
      <path d="M12 8.5l8 2.2V20" />
      <path d="M3 20h18M7.5 8h1M7.5 11.5h1M7.5 15h1M15.5 13.5h1M15.5 16.5h1" />
    </StepSvg>
  );
}

function WalletIcon() {
  return (
    <StepSvg>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" />
      <rect x="4" y="7.5" width="16.5" height="11.5" rx="2.5" />
      <path d="M16 13.2h1.5" />
    </StepSvg>
  );
}

function PhoneIcon() {
  return (
    <StepSvg>
      <path d="M21 16.5v2.8a2 2 0 0 1-2.2 2 19.5 19.5 0 0 1-8.5-3 19.2 19.2 0 0 1-5.9-5.9 19.5 19.5 0 0 1-3-8.6A2 2 0 0 1 3.4 1.6h2.8a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L7.2 9.3a15.6 15.6 0 0 0 5.9 5.9l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />
    </StepSvg>
  );
}

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.8" fill="currentColor" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 11v5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="7.8" r="1.2" fill="currentColor" />
    </svg>
  );
}

function ChevronIcon({ direction }: { direction: "down" | "right" }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d={direction === "down" ? "M6 9.5l6 6 6-6" : "M9.5 6l6 6-6 6"}
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShieldCheckIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3l7 3v5.5c0 4.4-3 8.2-7 9.5-4-1.3-7-5.1-7-9.5V6l7-3z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M8.8 12.2l2.2 2.2 4.2-4.4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12.5l4.5 4.5L19 7.5"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
      <p className="org-setup-substep org-setup-substep--done">
        <span className="org-setup-substep__check" aria-hidden>
          <CheckIcon />
        </span>
        Email verified · {session.email}
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
    <form className="org-setup-substep" onSubmit={(e) => void submit(e)}>
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />
      <div className="org-setup-substep__row org-setup-substep__row--center">
        <div className="org-setup-substep__contact">
          <span className="org-setup-substep__eyebrow">Email address</span>
          <span className="org-setup-substep__value">{session.email}</span>
          <span className="org-setup-substep__hint">
            Skip this if you already used the invite link from that inbox.
          </span>
        </div>
        {sent ? null : (
          <button
            type="button"
            className="b4-wizard__continue b4-wizard__continue--gold org-setup-substep__btn"
            disabled={busy}
            onClick={() => void send()}
          >
            {busy ? "Sending…" : "Email me a code"}
          </button>
        )}
      </div>
      {sent ? (
        <div className="org-setup-substep__row">
          <MfaCodeInput value={code} onChange={setCode} disabled={busy} submitOnComplete={false} />
          <button
            type="submit"
            className="b4-wizard__continue b4-wizard__continue--gold org-setup-substep__btn"
            disabled={busy || code.length !== 6}
          >
            {busy ? "Checking…" : "Confirm email"}
          </button>
        </div>
      ) : null}
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
  const [phone, setPhone] = useState(session.phone ?? "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const onPhoneChange = useCallback((value: string) => {
    if (!value.trim()) {
      setPhone("");
      return;
    }
    setPhone(value.startsWith("+") ? value : `+${value.replace(/\D/g, "")}`);
  }, []);

  if (session.phoneVerified) {
    return (
      <p className="org-setup-substep org-setup-substep--done">
        <span className="org-setup-substep__check" aria-hidden>
          <CheckIcon />
        </span>
        Phone verified · {session.phone}
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
    <form className="org-setup-substep" onSubmit={(e) => void submit(e)}>
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />
      <div className="org-setup-substep__row">
        <AuthField
          id="verify-phone"
          label="Mobile number"
          value={phone}
          onChange={onPhoneChange}
          disabled={busy || sent}
          autoComplete="tel"
          placeholder="+1 415 555 0123 (with country code)"
          leadingIcon={<PhoneIcon />}
        />
        {sent ? null : (
          <button
            type="button"
            className="b4-wizard__continue b4-wizard__continue--gold org-setup-substep__btn"
            disabled={busy || phone.replace(/\D/g, "").length < 6}
            onClick={() => void send()}
          >
            {busy ? "Sending…" : "Text me a code"}
          </button>
        )}
      </div>
      {sent ? (
        <div className="org-setup-substep__row">
          <MfaCodeInput value={code} onChange={setCode} disabled={busy} submitOnComplete={false} />
          <button
            type="submit"
            className="b4-wizard__continue b4-wizard__continue--gold org-setup-substep__btn"
            disabled={busy || code.length !== 6}
          >
            {busy ? "Checking…" : "Confirm phone"}
          </button>
        </div>
      ) : null}
    </form>
  );
}
