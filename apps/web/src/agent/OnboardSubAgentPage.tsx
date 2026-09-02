import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AuthToast } from "../auth/AuthToast";
import { DEFAULT_AGENT_COMMISSION_PERCENT } from "../platform/orgDetailSeeds";
import {
  canCreateAgentUnderParent,
  DEFAULT_MAX_AGENT_DEPTH,
} from "../platform/onboardAgent";
import { OnboardWizardLoading } from "../shared/OnboardWizardLoading";
import { OnboardWizardPortal } from "../shared/OnboardWizardPortal";
import {
  fetchRegisteredEmailIndex,
  registeredEmailConflict,
  REGISTERED_EMAIL_API_MESSAGE,
  type RegisteredEmailRef,
} from "../shared/registeredEmails";
import { FieldControl } from "../ui/FieldControl";
import {
  ApiError,
  createOrg,
  getAgentCommission,
  inviteOrgUser,
  listOrgMemberEmails,
  listOrgs,
  type OrgAccount,
  type Session,
} from "./api";
import { primaryAgentOrgId, sessionCanOnboardMerchant } from "./org";
import { agentRoute } from "../shared/portalRouting";

function agentReturnPrefix(): string {
  const base = agentRoute();
  return base === "/" ? "/" : `${base}/`;
}

type Props = { session: Session };

type WizardState = {
  legalName: string;
  displayName: string;
  country: string;
  commissionPercent: string;
  ownerEmail: string;
};

const STEPS = [
  { label: "Details", title: "Legal entity & contact" },
  { label: "Commercial", title: "Commission terms" },
  { label: "Owner", title: "Owner invitation" },
  { label: "Review", title: "Review & create" },
] as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

function returnPath(searchParams: URLSearchParams): string {
  const raw = searchParams.get("returnTo")?.trim();
  if (!raw || !raw.startsWith(agentReturnPrefix())) return agentRoute("agents");
  return raw;
}

function StepIndicator({ step }: { step: number }) {
  return (
    <nav className="b4-wizard__steps" aria-label="Wizard progress">
      {STEPS.map((s, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <div
            key={s.label}
            className={`b4-wizard__step${active ? " is-active" : ""}${done ? " is-done" : ""}`}
          >
            <span className="b4-wizard__step-mark" aria-hidden>
              {done ? (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path
                    d="M2 5.2 4.1 7.3 8 3.4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : active ? (
                <span className="b4-wizard__step-dot" />
              ) : null}
            </span>
            <span className="b4-wizard__step-label">{s.label}</span>
          </div>
        );
      })}
    </nav>
  );
}

/** C4 — Onboard agent (sub) under the current agent; parent fixed. */
export function OnboardSubAgentPage({ session }: Props) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionAgentId = useMemo(() => primaryAgentOrgId(session), [session]);
  const canOnboard = useMemo(
    () => sessionCanOnboardMerchant(session),
    [session],
  );
  const parentId =
    searchParams.get("parentId")?.trim() || sessionAgentId || "";
  const backTo = useMemo(() => returnPath(searchParams), [searchParams]);

  const [step, setStep] = useState(0);
  const [orgs, setOrgs] = useState<OrgAccount[]>([]);
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registeredEmails, setRegisteredEmails] = useState<
    Map<string, RegisteredEmailRef>
  >(() => new Map());
  const [form, setForm] = useState<WizardState>({
    legalName: "",
    displayName: "",
    country: "",
    commissionPercent: DEFAULT_AGENT_COMMISSION_PERCENT,
    ownerEmail: "",
  });

  const dismissToast = useCallback(() => setError(null), []);

  const patch = useCallback(
    <K extends keyof WizardState>(key: K, value: WizardState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setBooting(true);
      try {
        const rows = await listOrgs();
        if (cancelled) return;
        setOrgs(rows);
        const index = await fetchRegisteredEmailIndex(rows, listOrgMemberEmails);
        if (!cancelled) setRegisteredEmails(index);
        if (sessionAgentId) {
          const commission = await getAgentCommission(sessionAgentId).catch(
            () => null,
          );
          if (!cancelled && commission?.commissionPercent) {
            setForm((prev) => ({
              ...prev,
              commissionPercent: commission.commissionPercent,
            }));
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Failed to load org tree for onboard",
          );
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionAgentId]);

  const parentOrg = useMemo(
    () => orgs.find((o) => o.id === parentId) ?? null,
    [orgs, parentId],
  );

  const depthOk = useMemo(() => {
    if (!parentId || orgs.length === 0) return false;
    return canCreateAgentUnderParent(
      parentId,
      "agent_sub",
      orgs,
      DEFAULT_MAX_AGENT_DEPTH,
    );
  }, [parentId, orgs]);

  useEffect(() => {
    if (!canOnboard) {
      setError((prev) => prev ?? "Viewer accounts cannot onboard sub-agents.");
      return;
    }
    if (booting) return;
    if (!parentId || !parentOrg) {
      setError((prev) => prev ?? "Parent agent not found.");
      return;
    }
    if (!depthOk) {
      setError(
        (prev) =>
          prev ??
          `Max agent depth (${DEFAULT_MAX_AGENT_DEPTH}) reached under ${parentOrg.name}.`,
      );
    }
  }, [canOnboard, booting, parentId, parentOrg, depthOk]);

  const apiName = form.displayName.trim() || form.legalName.trim();

  function validateStep(): string | null {
    if (step === 0) {
      if (!form.legalName.trim() && !form.displayName.trim()) {
        return "Enter a legal or display name.";
      }
      if (!form.country.trim()) return "Country is required.";
    }
    if (step === 1) {
      const n = Number(form.commissionPercent);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        return "Commission percent must be between 0 and 100.";
      }
    }
    if (step === 2) {
      if (!form.ownerEmail.trim() || !isValidEmail(form.ownerEmail)) {
        return "Enter a valid owner email.";
      }
      const conflict = registeredEmailConflict(
        form.ownerEmail,
        registeredEmails,
      );
      if (conflict) return conflict;
    }
    return null;
  }

  function next() {
    const msg = validateStep();
    if (msg) {
      setError(msg);
      return;
    }
    setError(null);
    window.setTimeout(() => {
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    }, 0);
  }

  function back() {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleCreate() {
    const msg = validateStep();
    if (msg) {
      setError(msg);
      return;
    }
    if (!parentId || !depthOk) {
      setError(
        `Cannot create a sub-agent under this parent (max depth ${DEFAULT_MAX_AGENT_DEPTH}).`,
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const freshIndex = await fetchRegisteredEmailIndex(
        orgs,
        listOrgMemberEmails,
      );
      setRegisteredEmails(freshIndex);
      const conflict = registeredEmailConflict(form.ownerEmail, freshIndex);
      if (conflict) {
        setError(conflict);
        setStep(2);
        return;
      }
      const created = await createOrg({
        type: "agent_sub",
        name: apiName,
        parentId,
        legalName: form.legalName.trim() || undefined,
        country: form.country.trim(),
        commissionPercent: form.commissionPercent.trim() || undefined,
      });
      await inviteOrgUser(created.id, {
        email: form.ownerEmail.trim(),
        role: "owner",
      });
      navigate(agentRoute(`agents/${created.id}`), {
        state: {
          invitationSent: true,
          displayName: form.displayName.trim() || apiName,
        },
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === "agent_depth_exceeded") {
        setError(
          `Agent nesting exceeds platform max depth (${DEFAULT_MAX_AGENT_DEPTH}).`,
        );
      } else if (err instanceof ApiError && err.code === "email_taken") {
        setError(REGISTERED_EMAIL_API_MESSAGE);
        setStep(2);
      } else {
        setError(
          err instanceof ApiError ? err.message : "Failed to create sub-agent",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (step < STEPS.length - 1) {
      next();
      return;
    }
    void handleCreate();
  }

  if (!canOnboard) {
    return (
      <OnboardWizardPortal>
      <div className="b4-wizard-page">
        <AuthToast message={error} tone="error" onDismiss={dismissToast} />
        <p className="muted">You do not have permission to onboard sub-agents.</p>
        <Link to={backTo}>← Back</Link>
      </div>
      </OnboardWizardPortal>
    );
  }

  if (booting) {
    return (
      <OnboardWizardLoading
        title="Onboard sub-agent"
        copy="Checking nesting depth and preparing the sub-agent wizard."
        closeTo={backTo}
      />
    );
  }

  if (!parentId || !parentOrg) {
    return (
      <OnboardWizardPortal>
      <div className="b4-wizard-page">
        <AuthToast message={error} tone="error" onDismiss={dismissToast} />
        <p className="muted">Could not load the parent agent for this wizard.</p>
        <Link to={backTo}>← Back</Link>
      </div>
      </OnboardWizardPortal>
    );
  }

  if (!depthOk) {
    return (
      <OnboardWizardPortal>
      <div className="b4-wizard-page">
        <AuthToast message={error} tone="error" onDismiss={dismissToast} />
        <div className="b4-wizard-backdrop">
          <div className="b4-wizard" role="dialog" aria-modal="true">
            <header className="b4-wizard__head">
              <h2 className="b4-wizard__title">Onboard sub-agent</h2>
              <Link className="b4-wizard__close" to={backTo} aria-label="Close">
                ×
              </Link>
            </header>
            <div className="b4-wizard__body">
              <p className="muted">
                Max agent depth ({DEFAULT_MAX_AGENT_DEPTH}) reached under{" "}
                <strong>{parentOrg.name}</strong>. You can still onboard
                merchants under this account.
              </p>
              <p>
                <Link className="btn-primary" to={agentRoute("merchants/new")}>
                  Onboard merchant
                </Link>{" "}
                <Link className="btn-ghost" to={backTo}>
                  Cancel
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
      </OnboardWizardPortal>
    );
  }

  return (
    <OnboardWizardPortal>
    <div className="b4-wizard-page">
      <AuthToast message={error} tone="error" onDismiss={dismissToast} />
      <div className="b4-wizard-backdrop">
        <div
          className="b4-wizard"
          role="dialog"
          aria-modal="true"
          aria-labelledby="c4-wizard-title"
        >
          <header className="b4-wizard__head">
            <div>
              <p className="b4-wizard__eyebrow muted">Agent (sub) account</p>
              <h2 id="c4-wizard-title" className="b4-wizard__title">
                {STEPS[step]?.title ?? "Onboard sub-agent"}
              </h2>
              <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
                Parent: {parentOrg.name}
              </p>
            </div>
            <Link className="b4-wizard__close" to={backTo} aria-label="Close">
              ×
            </Link>
          </header>

          <StepIndicator step={step} />

          <form className="b4-wizard__form" onSubmit={onSubmit}>
            <div className="b4-wizard__body">
              {step === 0 ? (
                <>
                  <div className="b4-field">
                    <label className="b4-field__label" htmlFor="c4-legal">
                      Legal name
                    </label>
                    <FieldControl icon="user">
                      <input
                        id="c4-legal"
                        className="b4-field__control"
                        value={form.legalName}
                        onChange={(e) => patch("legalName", e.target.value)}
                        autoComplete="organization"
                      />
                    </FieldControl>
                  </div>
                  <div className="b4-field">
                    <label className="b4-field__label" htmlFor="c4-display">
                      Display name
                    </label>
                    <FieldControl icon="user">
                      <input
                        id="c4-display"
                        className="b4-field__control"
                        value={form.displayName}
                        onChange={(e) => patch("displayName", e.target.value)}
                        placeholder="Shown in agent portal"
                      />
                    </FieldControl>
                  </div>
                  <div className="b4-field">
                    <label className="b4-field__label" htmlFor="c4-country">
                      Country
                    </label>
                    <FieldControl icon="globe">
                      <input
                        id="c4-country"
                        className="b4-field__control"
                        value={form.country}
                        onChange={(e) => patch("country", e.target.value)}
                      />
                    </FieldControl>
                  </div>
                </>
              ) : null}

              {step === 1 ? (
                <div className="b4-field">
                  <label className="b4-field__label" htmlFor="c4-commission">
                    Commission % of platform fee
                  </label>
                  <FieldControl>
                    <input
                      id="c4-commission"
                      className="b4-field__control"
                      inputMode="decimal"
                      value={form.commissionPercent}
                      onChange={(e) =>
                        patch("commissionPercent", e.target.value)
                      }
                    />
                  </FieldControl>
                  <p className="b4-field__hint">
                    Platform pays this rebate from collected fees (Option A).
                  </p>
                </div>
              ) : null}

              {step === 2 ? (
                <div className="b4-field">
                  <label className="b4-field__label" htmlFor="c4-owner">
                    Owner email
                  </label>
                  <FieldControl icon="mail">
                    <input
                      id="c4-owner"
                      type="email"
                      className="b4-field__control"
                      value={form.ownerEmail}
                      onChange={(e) => patch("ownerEmail", e.target.value)}
                    />
                  </FieldControl>
                  <p className="b4-field__hint">
                    Invitation is sent after create.
                  </p>
                </div>
              ) : null}

              {step === 3 ? (
                <dl className="b4-review">
                  <div className="b4-review__row">
                    <dt>Parent</dt>
                    <dd>{parentOrg.name}</dd>
                  </div>
                  <div className="b4-review__row">
                    <dt>Name</dt>
                    <dd>{apiName}</dd>
                  </div>
                  <div className="b4-review__row">
                    <dt>Country</dt>
                    <dd>{form.country}</dd>
                  </div>
                  <div className="b4-review__row">
                    <dt>Commission</dt>
                    <dd>{form.commissionPercent}%</dd>
                  </div>
                  <div className="b4-review__row">
                    <dt>Owner invite</dt>
                    <dd>{form.ownerEmail}</dd>
                  </div>
                </dl>
              ) : null}
            </div>

            <footer className="b4-wizard__foot">
              {step > 0 ? (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={back}
                  disabled={busy}
                >
                  Back
                </button>
              ) : (
                <Link className="btn-ghost" to={backTo}>
                  Cancel
                </Link>
              )}
              <button type="submit" className="btn-primary" disabled={busy}>
                {step < STEPS.length - 1
                  ? "Continue"
                  : busy
                    ? "Creating…"
                    : "Create sub-agent"}
              </button>
            </footer>
          </form>
        </div>
      </div>
    </div>
    </OnboardWizardPortal>
  );
}
