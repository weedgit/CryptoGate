import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AuthToast } from "../auth/AuthToast";
import {
  ApiError,
  createOrg,
  getPlatformOrgs,
  invalidatePlatformOrgList,
  inviteOrgUser,
  listOrgMemberEmails,
  type OrgAccount,
} from "./api";
import { PlatformPending } from "./ui/PlatformPending";
import { FieldControl } from "../ui/FieldControl";
import { SearchableSelect } from "../ui/SearchableSelect";
import {
  canCreateAgentUnderParent,
  DEFAULT_MAX_AGENT_DEPTH,
} from "./onboardAgent";
import {
  registeredEmailConflict,
  fetchRegisteredEmailIndex,
  REGISTERED_EMAIL_API_MESSAGE,
} from "../shared/registeredEmails";
import type { RegisteredEmailRef } from "../shared/registeredEmails";
import { orgTypeLabel } from "./org";
import { onboardReturnPath } from "./platformNav";
import { agentRoute, platformRoute } from "../shared/portalRouting";

type AgentKind = "agent" | "agent_sub";

type WizardState = {
  kind: AgentKind;
  parentId: string;
  legalName: string;
  displayName: string;
  country: string;
  commissionPercent: string;
  ownerEmail: string;
};

const STEPS = [
  { label: "Type", title: "Account Type" },
  { label: "Details", title: "Legal Entity & Contact Information" },
  { label: "Commercial", title: "Commercial Terms" },
  { label: "Owner Invite", title: "Owner Invitation" },
  { label: "Review", title: "Review & Create" },
] as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FieldKey = "legalName" | "country" | "ownerEmail" | "parentId";

function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
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

export function OnboardAgentPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState(0);
  const [orgs, setOrgs] = useState<OrgAccount[]>([]);
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [registeredEmails, setRegisteredEmails] = useState<
    Map<string, RegisteredEmailRef>
  >(() => new Map());
  const dismissToast = useCallback(() => setError(null), []);
  const cancelTo = useMemo(
    () => onboardReturnPath(searchParams, platformRoute("agents")),
    [searchParams],
  );
  const [form, setForm] = useState<WizardState>(() => {
    const kindParam = searchParams.get("kind");
    const parentParam = searchParams.get("parentId")?.trim() ?? "";
    const kind: AgentKind =
      kindParam === "agent_sub" && parentParam ? "agent_sub" : "agent";
    return {
      kind,
      parentId: kind === "agent_sub" ? parentParam : "",
      legalName: "",
      displayName: "",
      country: "",
      commissionPercent: "15",
      ownerEmail: "",
    };
  });

  useEffect(() => {
    getPlatformOrgs()
      .then(setOrgs)
      .catch(() => setOrgs([]))
      .finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    if (orgs.length === 0) {
      setRegisteredEmails(new Map());
      return;
    }
    let cancelled = false;
    void fetchRegisteredEmailIndex(orgs, listOrgMemberEmails).then((index) => {
      if (!cancelled) setRegisteredEmails(index);
    });
    return () => {
      cancelled = true;
    };
  }, [orgs]);

  const platformOrg = useMemo(
    () => orgs.find((o) => o.type === "platform") ?? null,
    [orgs],
  );

  const agentParents = useMemo(
    () =>
      orgs.filter(
        (o) => o.type === "platform" || o.type === "agent" || o.type === "agent_sub",
      ),
    [orgs],
  );

  const parentId = useMemo(() => {
    if (form.kind === "agent" && platformOrg) return platformOrg.id;
    return form.parentId;
  }, [form.kind, form.parentId, platformOrg]);

  const parentOrg = useMemo(
    () => (parentId ? orgs.find((o) => o.id === parentId) : null),
    [orgs, parentId],
  );

  const depthBlocked = useMemo(() => {
    if (!parentId) return false;
    return !canCreateAgentUnderParent(parentId, form.kind, orgs);
  }, [parentId, form.kind, orgs]);

  const apiName = useMemo(() => {
    const legal = form.legalName.trim();
    const display = form.displayName.trim();
    return legal || display;
  }, [form.legalName, form.displayName]);

  function patch<K extends keyof WizardState>(key: K, value: WizardState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === "legalName" || key === "displayName") {
      setFieldErrors((prev) => {
        if (!prev.legalName) return prev;
        const next = { ...prev };
        delete next.legalName;
        return next;
      });
    } else if (key in fieldErrors) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key as FieldKey];
        return next;
      });
    }
    if (error) setError(null);
  }

  function validateStep(): string | null {
    const nextFieldErrors: Partial<Record<FieldKey, string>> = {};

    if (step === 0) {
      if (depthBlocked) {
        return `Max agent depth (${DEFAULT_MAX_AGENT_DEPTH}) would be exceeded. Adjust platform settings (B13) or choose a higher parent.`;
      }
      if (form.kind === "agent_sub" && !form.parentId) {
        nextFieldErrors.parentId = "Select a parent agent for a sub-agent account.";
      }
    }

    if (step === 1) {
      if (!apiName) {
        nextFieldErrors.legalName = "Legal or display name is required.";
      }
      if (!form.country.trim()) {
        nextFieldErrors.country = "Country is required.";
      }
    }

    if (step === 3) {
      const ownerEmail = form.ownerEmail.trim();
      if (!ownerEmail) {
        nextFieldErrors.ownerEmail = "Owner email is required.";
      } else if (!isValidEmail(ownerEmail)) {
        nextFieldErrors.ownerEmail = "Enter a valid email address.";
      } else {
        const conflict = registeredEmailConflict(ownerEmail, registeredEmails);
        if (conflict) nextFieldErrors.ownerEmail = conflict;
      }
    }

    setFieldErrors(nextFieldErrors);
    return Object.values(nextFieldErrors)[0] ?? null;
  }

  function validateSubmit(): string | null {
    if (!parentId) return "Parent org missing.";
    if (depthBlocked) {
      return `Max agent depth (${DEFAULT_MAX_AGENT_DEPTH}) would be exceeded. Adjust platform settings (B13) or choose a higher parent.`;
    }
    if (!apiName) return "Legal or display name is required.";
    if (!form.country.trim()) return "Country is required.";
    const ownerEmail = form.ownerEmail.trim();
    if (!ownerEmail || !isValidEmail(ownerEmail)) {
      return "Enter a valid owner email address.";
    }
    const conflict = registeredEmailConflict(ownerEmail, registeredEmails);
    if (conflict) return conflict;
    return null;
  }

  function next() {
    const msg = validateStep();
    if (msg) {
      setError(msg);
      return;
    }
    setError(null);
    setFieldErrors({});
    // Defer so a "Save & Continue" click cannot fall through onto "Create agent account"
    // when the footer button swaps on the final step.
    window.setTimeout(() => {
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    }, 0);
  }

  function back() {
    setError(null);
    setFieldErrors({});
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleCreate() {
    const msg = validateSubmit();
    if (msg) {
      setError(msg);
      return;
    }
    if (!parentId) return;
    setBusy(true);
    setError(null);
    try {
      const freshIndex = await fetchRegisteredEmailIndex(orgs, listOrgMemberEmails);
      setRegisteredEmails(freshIndex);
      const conflict = registeredEmailConflict(form.ownerEmail, freshIndex);
      if (conflict) {
        setFieldErrors({ ownerEmail: conflict });
        setError(conflict);
        setStep(3);
        return;
      }

      const created = await createOrg({
        type: form.kind,
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
      invalidatePlatformOrgList();
      navigate(platformRoute(`agents/${created.id}`), {
        state: {
          invitationSent: true,
          displayName: form.displayName.trim() || apiName,
        },
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === "agent_depth_exceeded") {
        setError(
          `Agent nesting exceeds platform max depth (${DEFAULT_MAX_AGENT_DEPTH}). See fee tier settings (B13).`,
        );
      } else if (err instanceof ApiError && err.code === "email_taken") {
        setError(REGISTERED_EMAIL_API_MESSAGE);
        setFieldErrors({ ownerEmail: REGISTERED_EMAIL_API_MESSAGE });
        setStep(3);
      } else {
        setError(err instanceof ApiError ? err.message : "Failed to create agent");
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

  if (booting) {
    return (
      <div className="b4-wizard-page">
        <PlatformPending
          title="Loading org tree"
          copy="Preparing parent options for the new agent."
        />
      </div>
    );
  }

  return (
    <div className="b4-wizard-page">
      <AuthToast message={error} tone="error" onDismiss={dismissToast} />
      <div className="b4-wizard-backdrop">
        <div
          className="b4-wizard"
          role="dialog"
          aria-modal="true"
          aria-labelledby="b4-wizard-title"
        >
          <header className="b4-wizard__head">
            <h2 id="b4-wizard-title" className="b4-wizard__title">
              New Agent
            </h2>
            <Link
              className="b4-wizard__close"
              to={cancelTo}
              aria-label="Cancel and return"
            >
              ×
            </Link>
          </header>

          <StepIndicator step={step} />

          <form className="b4-wizard__form" onSubmit={onSubmit}>
            <div className="b4-wizard__body">
              {step === 0 ? (
                <>
                  <div className="b4-field">
                    <span className="b4-field__label">Account type</span>
                    <div className="b4-type-options" role="radiogroup" aria-label="Account type">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={form.kind === "agent"}
                        className={`b4-type-option${form.kind === "agent" ? " is-selected" : ""}`}
                        onClick={() => patch("kind", "agent")}
                      >
                        <span className="b4-type-option__radio" aria-hidden />
                        <span className="b4-type-option__copy">
                          <span className="b4-type-option__title">Agent account</span>
                          <span className="b4-type-option__desc">
                            Top-level channel partner under Platform
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={form.kind === "agent_sub"}
                        className={`b4-type-option${form.kind === "agent_sub" ? " is-selected" : ""}`}
                        onClick={() => patch("kind", "agent_sub")}
                      >
                        <span className="b4-type-option__radio" aria-hidden />
                        <span className="b4-type-option__copy">
                          <span className="b4-type-option__title">Agent (sub) account</span>
                          <span className="b4-type-option__desc">
                            Nested agent account under an existing parent
                          </span>
                        </span>
                      </button>
                    </div>
                  </div>
                  {form.kind === "agent_sub" ? (
                    <div className="b4-field">
                      <label className="b4-field__label" htmlFor="parent-agent">
                        Parent agent
                      </label>
                      <FieldControl icon="user" invalid={Boolean(fieldErrors.parentId)}>
                        <SearchableSelect
                          id="parent-agent"
                          value={form.parentId}
                          options={agentParents
                            .filter((o) => o.type !== "platform")
                            .map((o) => ({
                              id: o.id,
                              label: o.name,
                              hint: orgTypeLabel(o.type),
                            }))}
                          onChange={(id) => patch("parentId", id)}
                          placeholder="Select parent"
                          emptyLabel="Select parent"
                          invalid={Boolean(fieldErrors.parentId)}
                        />
                      </FieldControl>
                    </div>
                  ) : null}
                  {depthBlocked ? (
                    <p className="muted">
                      Max agent depth ({DEFAULT_MAX_AGENT_DEPTH}) reached for this parent.{" "}
                      <Link to={platformRoute("settings/fee-tiers")}>Platform fees</Link>
                    </p>
                  ) : null}
                </>
              ) : null}

              {step === 1 ? (
                <>
                  <div className="b4-field">
                    <label className="b4-field__label" htmlFor="legal-name">
                      Legal name
                    </label>
                    <FieldControl icon="user" invalid={Boolean(fieldErrors.legalName)}>
                      <input
                        id="legal-name"
                        className={`b4-field__control${fieldErrors.legalName ? " is-invalid" : ""}`}
                        value={form.legalName}
                        onChange={(e) => patch("legalName", e.target.value)}
                        placeholder="Registered entity name"
                        autoComplete="organization"
                        autoFocus
                      />
                    </FieldControl>
                  </div>
                  <div className="b4-field">
                    <label className="b4-field__label" htmlFor="display-name">
                      Display name
                    </label>
                    <FieldControl icon="user">
                      <input
                        id="display-name"
                        className={`b4-field__control${fieldErrors.legalName ? " is-invalid" : ""}`}
                        value={form.displayName}
                        onChange={(e) => patch("displayName", e.target.value)}
                        placeholder="Portal label (optional)"
                        autoComplete="off"
                      />
                    </FieldControl>
                  </div>
                  <div className="b4-field">
                    <label className="b4-field__label" htmlFor="country">
                      Country
                    </label>
                    <FieldControl icon="globe" invalid={Boolean(fieldErrors.country)}>
                      <input
                        id="country"
                        className={`b4-field__control${fieldErrors.country ? " is-invalid" : ""}`}
                        value={form.country}
                        onChange={(e) => patch("country", e.target.value)}
                        placeholder="Singapore (SG)"
                        autoComplete="country-name"
                      />
                    </FieldControl>
                  </div>
                </>
              ) : null}

              {step === 2 ? (
                <div className="b4-field">
                  <label className="b4-field__label" htmlFor="commission">
                    Commission % on platform fee
                  </label>
                  <FieldControl icon="user">
                    <input
                      id="commission"
                      className="b4-field__control"
                      inputMode="decimal"
                      value={form.commissionPercent}
                      onChange={(e) => patch("commissionPercent", e.target.value)}
                      placeholder="15"
                      autoFocus
                    />
                  </FieldControl>
                  <p className="b4-field__hint">
                    Merchant tier is chosen per merchant when the agent onboard them.
                  </p>
                </div>
              ) : null}

              {step === 3 ? (
                <div className="b4-field">
                  <label className="b4-field__label" htmlFor="owner-email">
                    Invite first Owner
                  </label>
                  <FieldControl icon="mail" invalid={Boolean(fieldErrors.ownerEmail)}>
                    <input
                      id="owner-email"
                      className={`b4-field__control${fieldErrors.ownerEmail ? " is-invalid" : ""}`}
                      type="email"
                      value={form.ownerEmail}
                      onChange={(e) => patch("ownerEmail", e.target.value)}
                      placeholder="Name@company.com"
                      autoFocus
                    />
                  </FieldControl>
                  <p className="b4-field__hint">
                    An invitation is sent after the agent account is created.
                  </p>
                </div>
              ) : null}

              {step === 4 ? (
                <dl className="b4-review">
                  <div className="b4-review__row">
                    <dt>Type</dt>
                    <dd>{orgTypeLabel(form.kind)}</dd>
                  </div>
                  <div className="b4-review__row">
                    <dt>Parent</dt>
                    <dd>{parentOrg?.name ?? parentId ?? "—"}</dd>
                  </div>
                  <div className="b4-review__row">
                    <dt>Legal name</dt>
                    <dd>{apiName}</dd>
                  </div>
                  <div className="b4-review__row">
                    <dt>Display name</dt>
                    <dd>{form.displayName.trim() || "—"}</dd>
                  </div>
                  <div className="b4-review__row">
                    <dt>Country</dt>
                    <dd>{form.country.trim() || "—"}</dd>
                  </div>
                  <div className="b4-review__row">
                    <dt>Commission</dt>
                    <dd>{form.commissionPercent}%</dd>
                  </div>
                  <div className="b4-review__row">
                    <dt>Owner invite</dt>
                    <dd>{form.ownerEmail.trim()}</dd>
                  </div>
                </dl>
              ) : null}
            </div>

            <footer className="b4-wizard__foot">
              <div className="b4-wizard__foot-left">
                {step > 0 ? (
                  <button
                    type="button"
                    className="b4-wizard__back"
                    onClick={back}
                    disabled={busy}
                  >
                    Back
                  </button>
                ) : null}
                <Link className="b4-wizard__cancel" to={cancelTo}>
                  Cancel
                </Link>
              </div>
              {step < STEPS.length - 1 ? (
                <button
                  type="button"
                  className="b4-wizard__continue"
                  onClick={next}
                  disabled={depthBlocked}
                >
                  Save &amp; Continue
                </button>
              ) : (
                <button
                  type="button"
                  className="b4-wizard__continue"
                  onClick={() => void handleCreate()}
                  disabled={busy || depthBlocked}
                >
                  {busy ? "Creating…" : "Create agent account"}
                </button>
              )}
            </footer>
          </form>
        </div>
      </div>
    </div>
  );
}
