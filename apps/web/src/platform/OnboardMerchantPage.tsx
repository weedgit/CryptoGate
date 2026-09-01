import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AuthToast } from "../auth/AuthToast";
import {
  ApiError,
  createOrg,
  getFeeTierSettings,
  getPlatformOrgs,
  invalidatePlatformOrgList,
  inviteOrgUser,
  listOrgMemberEmails,
  type FeeTierBand,
  type OrgAccount,
  type Session,
} from "./api";
import { PlatformPending } from "./ui/PlatformPending";
import { tierLabel } from "../commercialLabels";
import { STRUCTURE_LABELS } from "./merchantSubtree";
import { orgTypeLabel, sessionCanIssueServiceBill } from "./org";
import { onboardReturnPath } from "./platformNav";
import {
  registeredEmailConflict,
  fetchRegisteredEmailIndex,
  REGISTERED_EMAIL_API_MESSAGE,
} from "../shared/registeredEmails";
import type { RegisteredEmailRef } from "../shared/registeredEmails";
import { FieldControl } from "../ui/FieldControl";
import { SearchableSelect } from "../ui/SearchableSelect";
import { merchantRoute, platformRoute } from "../shared/portalRouting";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Props = { session: Session };

type MerchantStructure = "single_location" | "multi_location";
type MerchantTier = "small" | "mid" | "enterprise";

type WizardState = {
  parentId: string;
  structure: MerchantStructure;
  name: string;
  country: string;
  commercial: { tier: MerchantTier; volumeFeePercent: string };
  ownerEmail: string;
};

const STEPS = [
  { label: "Parent" },
  { label: "Structure" },
  { label: "Details" },
  { label: "Tier" },
  { label: "Fee" },
  { label: "Owner" },
  { label: "Review" },
] as const;

const STRUCTURE_HINTS: Record<MerchantStructure, string> = {
  single_location: "One site / merchant account",
  multi_location: "Parent merchant with site accounts",
};

function defaultVolumeForTier(tiers: FeeTierBand[], tier: MerchantTier): string {
  const band = tiers.find((t) => t.tier === tier);
  return band?.defaultSignupPercent ?? "1.5";
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

/** Platform B5 add — onboard merchant under a chosen agent. */
export function OnboardMerchantPage({ session }: Props) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const canManage = useMemo(() => sessionCanIssueServiceBill(session), [session]);
  const cancelTo = useMemo(
    () => onboardReturnPath(searchParams, platformRoute("merchants")),
    [searchParams],
  );
  const [step, setStep] = useState(0);
  const [orgs, setOrgs] = useState<OrgAccount[]>([]);
  const [agents, setAgents] = useState<OrgAccount[]>([]);
  const [registeredEmails, setRegisteredEmails] = useState<
    Map<string, RegisteredEmailRef>
  >(() => new Map());
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feeTiers, setFeeTiers] = useState<FeeTierBand[]>([]);
  const [form, setForm] = useState<WizardState>(() => ({
    parentId: searchParams.get("parentId")?.trim() ?? "",
    structure: "single_location",
    name: "",
    country: "",
    commercial: { tier: "mid", volumeFeePercent: "1.2" },
    ownerEmail: "",
  }));

  const dismissToast = useCallback(() => setError(null), []);

  useEffect(() => {
    if (!canManage) {
      setError((prev) => prev ?? "Platform Owner or Administrator required.");
      return;
    }
    if (booting) return;
    if (agents.length === 0) {
      setError(
        (prev) =>
          prev ??
          "Onboard an agent first — merchants must sit under an agent account.",
      );
    }
  }, [canManage, booting, agents.length]);

  useEffect(() => {
    getPlatformOrgs()
      .then((rows) => {
        setOrgs(rows);
        setAgents(rows.filter((o) => o.type === "agent" || o.type === "agent_sub"));
      })
      .catch(() => {
        setOrgs([]);
        setAgents([]);
      })
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

  useEffect(() => {
    getFeeTierSettings()
      .then((settings) => {
        setFeeTiers(settings.tiers);
        setForm((prev) => ({
          ...prev,
          commercial: {
            ...prev.commercial,
            volumeFeePercent: defaultVolumeForTier(
              settings.tiers,
              prev.commercial.tier,
            ),
          },
        }));
      })
      .catch(() => undefined);
  }, []);

  const selectedBand = useMemo(
    () => feeTiers.find((t) => t.tier === form.commercial.tier) ?? null,
    [feeTiers, form.commercial.tier],
  );

  const tierOptions = useMemo(
    () =>
      (["small", "mid", "enterprise"] as MerchantTier[]).map((t) => {
        const band = feeTiers.find((b) => b.tier === t);
        return {
          id: t,
          label: tierLabel(t),
          hint: band
            ? `${band.volumeFeeMinPercent}–${band.volumeFeeMaxPercent}%`
            : undefined,
        };
      }),
    [feeTiers],
  );

  const parentAgent = useMemo(
    () => agents.find((a) => a.id === form.parentId) ?? null,
    [agents, form.parentId],
  );

  const parentOptions = useMemo(
    () =>
      agents.map((a) => ({
        id: a.id,
        label: a.name,
        hint: orgTypeLabel(a.type),
      })),
    [agents],
  );

  function patch<K extends keyof WizardState>(key: K, value: WizardState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validateStep(): string | null {
    if (step === 0 && !form.parentId) return "Select a parent agent.";
    if (step === 2 && !form.name.trim()) return "Merchant name is required.";
    if (step === 4 && selectedBand) {
      const pct = Number(form.commercial.volumeFeePercent);
      const min = Number(selectedBand.volumeFeeMinPercent);
      const max = Number(selectedBand.volumeFeeMaxPercent);
      if (!Number.isFinite(pct) || pct < min || pct > max) {
        return `Volume fee must be between ${min}% and ${max}% for ${tierLabel(form.commercial.tier)} tier.`;
      }
    }
    if (step === 5) {
      const ownerEmail = form.ownerEmail.trim();
      if (!ownerEmail) return "Owner email is required.";
      if (!EMAIL_PATTERN.test(ownerEmail)) return "Enter a valid email address.";
      const conflict = registeredEmailConflict(ownerEmail, registeredEmails);
      if (conflict) return conflict;
    }
    return null;
  }

  function validateOwnerEmail(index = registeredEmails): string | null {
    const ownerEmail = form.ownerEmail.trim();
    if (!ownerEmail) return "Owner email is required.";
    if (!EMAIL_PATTERN.test(ownerEmail)) return "Enter a valid email address.";
    return registeredEmailConflict(ownerEmail, index);
  }

  function next() {
    const msg = validateStep();
    if (msg) {
      setError(msg);
      return;
    }
    setError(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function back() {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleCreate() {
    if (!canManage || !form.parentId) return;
    const msg = validateStep();
    if (msg) {
      setError(msg);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const freshIndex = await fetchRegisteredEmailIndex(orgs, listOrgMemberEmails);
      setRegisteredEmails(freshIndex);
      const ownerConflict = validateOwnerEmail(freshIndex);
      if (ownerConflict) {
        setError(ownerConflict);
        setStep(5);
        return;
      }

      const created = await createOrg({
        type: "merchant",
        name: form.name.trim(),
        parentId: form.parentId,
        structure: form.structure,
        country: form.country.trim() || undefined,
        commercial: {
          tier: form.commercial.tier,
          volumeFeePercent: form.commercial.volumeFeePercent.trim(),
        },
      });
      await inviteOrgUser(created.id, {
        email: form.ownerEmail.trim(),
        role: "owner",
      });
      invalidatePlatformOrgList();
      navigate(platformRoute(`merchants/${created.id}`), {
        state: {
          invitationSent: true,
          enterprisePending: form.commercial.tier === "enterprise",
        },
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === "email_taken") {
        setError(REGISTERED_EMAIL_API_MESSAGE);
        setStep(5);
      } else {
        setError(err instanceof ApiError ? err.message : "Failed to create merchant");
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

  if (!canManage) {
    return (
      <div className="b4-wizard-page">
        <AuthToast message={error} tone="error" onDismiss={dismissToast} />
        <div className="b4-wizard-backdrop">
          <div className="b4-wizard" role="dialog" aria-modal="true">
            <header className="b4-wizard__head">
              <h2 className="b4-wizard__title">Onboard merchant</h2>
              <Link className="b4-wizard__close" to={cancelTo} aria-label="Close">
                ×
              </Link>
            </header>
            <div className="b4-wizard__body">
              <p className="muted">Platform Owner or Administrator required.</p>
            </div>
            <footer className="b4-wizard__foot">
              <Link className="b4-wizard__cancel" to={cancelTo}>
                Cancel
              </Link>
            </footer>
          </div>
        </div>
      </div>
    );
  }

  if (booting) {
    return (
      <div className="b4-wizard-page">
        <PlatformPending
          title="Loading merchants form"
          copy="Fetching agents for the parent picker."
        />
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="b4-wizard-page">
        <AuthToast message={error} tone="error" onDismiss={dismissToast} />
        <div className="b4-wizard-backdrop">
          <div className="b4-wizard" role="dialog" aria-modal="true">
            <header className="b4-wizard__head">
              <h2 className="b4-wizard__title">Onboard merchant</h2>
              <Link className="b4-wizard__close" to={cancelTo} aria-label="Close">
                ×
              </Link>
            </header>
            <div className="b4-wizard__body">
              <p className="muted">
                Onboard an agent first — merchants must sit under an agent account.
              </p>
            </div>
            <footer className="b4-wizard__foot">
              <Link className="b4-wizard__cancel" to={cancelTo}>
                Cancel
              </Link>
              <Link className="b4-wizard__continue" to={platformRoute("agents/new")}>
                Onboard agent
              </Link>
            </footer>
          </div>
        </div>
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
          aria-labelledby="b5-wizard-title"
        >
          <header className="b4-wizard__head">
            <h2 id="b5-wizard-title" className="b4-wizard__title">
              Onboard merchant
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
                <div className="b4-field">
                  <label className="b4-field__label" htmlFor="parent-agent">
                    Parent agent
                  </label>
                  <FieldControl icon="user">
                    <SearchableSelect
                      id="parent-agent"
                      value={form.parentId}
                      options={parentOptions}
                      onChange={(id) => patch("parentId", id)}
                      placeholder="Select agent…"
                      emptyLabel="Select agent…"
                    />
                  </FieldControl>
                </div>
              ) : null}

              {step === 1 ? (
                <div className="b4-field">
                  <span className="b4-field__label">Structure</span>
                  <div
                    className="b4-type-options"
                    role="radiogroup"
                    aria-label="Merchant structure"
                  >
                    {(Object.keys(STRUCTURE_LABELS) as MerchantStructure[]).map(
                      (s) => (
                        <button
                          key={s}
                          type="button"
                          role="radio"
                          aria-checked={form.structure === s}
                          className={`b4-type-option${form.structure === s ? " is-selected" : ""}`}
                          onClick={() => patch("structure", s)}
                        >
                          <span className="b4-type-option__radio" aria-hidden />
                          <span className="b4-type-option__copy">
                            <span className="b4-type-option__title">
                              {STRUCTURE_LABELS[s]}
                            </span>
                            <span className="b4-type-option__desc">
                              {STRUCTURE_HINTS[s]}
                            </span>
                          </span>
                        </button>
                      ),
                    )}
                  </div>
                </div>
              ) : null}

              {step === 2 ? (
                <>
                  <div className="b4-field">
                    <label className="b4-field__label" htmlFor="merchant-name">
                      Business name
                    </label>
                    <FieldControl icon="user">
                      <input
                        id="merchant-name"
                        className="b4-field__control"
                        required
                        value={form.name}
                        onChange={(e) => patch("name", e.target.value)}
                        placeholder="Registered business name"
                        autoFocus
                      />
                    </FieldControl>
                  </div>
                  <div className="b4-field">
                    <label className="b4-field__label" htmlFor="country">
                      Country
                    </label>
                    <FieldControl icon="globe">
                      <input
                        id="country"
                        className="b4-field__control"
                        value={form.country}
                        onChange={(e) => patch("country", e.target.value)}
                        placeholder="Singapore (SG)"
                      />
                    </FieldControl>
                  </div>
                </>
              ) : null}

              {step === 3 ? (
                <>
                  {form.commercial.tier === "enterprise" ? (
                    <p className="b4-field__hint">
                      Enterprise custom rates outside the band still need Owner
                      approval.
                    </p>
                  ) : null}
                  <div className="b4-field">
                    <label className="b4-field__label" htmlFor="tier">
                      Merchant tier
                    </label>
                    <FieldControl>
                      <SearchableSelect
                        id="tier"
                        value={form.commercial.tier}
                        options={tierOptions}
                        allowEmpty={false}
                        placeholder="Select tier…"
                        onChange={(id) => {
                          const tier = id as MerchantTier;
                          patch("commercial", {
                            tier,
                            volumeFeePercent: defaultVolumeForTier(
                              feeTiers,
                              tier,
                            ),
                          });
                        }}
                      />
                    </FieldControl>
                    {selectedBand ? (
                      <p className="b4-field__hint">
                        Band: {selectedBand.volumeFeeMinPercent}% –{" "}
                        {selectedBand.volumeFeeMaxPercent}%
                      </p>
                    ) : null}
                  </div>
                </>
              ) : null}

              {step === 4 ? (
                <div className="b4-field">
                  <label className="b4-field__label" htmlFor="volume-fee">
                    Volume fee %
                  </label>
                  <FieldControl icon="user">
                    <input
                      id="volume-fee"
                      className="b4-field__control"
                      inputMode="decimal"
                      value={form.commercial.volumeFeePercent}
                      onChange={(e) =>
                        patch("commercial", {
                          ...form.commercial,
                          volumeFeePercent: e.target.value,
                        })
                      }
                      autoFocus
                    />
                  </FieldControl>
                  {selectedBand ? (
                    <p className="b4-field__hint">
                      Allowed {selectedBand.volumeFeeMinPercent}% –{" "}
                      {selectedBand.volumeFeeMaxPercent}% for{" "}
                      {tierLabel(form.commercial.tier)}.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {step === 5 ? (
                <div className="b4-field">
                  <label className="b4-field__label" htmlFor="owner-email">
                    Merchant Owner email
                  </label>
                  <FieldControl icon="mail">
                    <input
                      id="owner-email"
                      className="b4-field__control"
                      type="email"
                      required
                      value={form.ownerEmail}
                      onChange={(e) => patch("ownerEmail", e.target.value)}
                      placeholder="Name@company.com"
                      autoFocus
                    />
                  </FieldControl>
                  <p className="b4-field__hint">
                    An invitation is sent after the merchant account is created.
                  </p>
                </div>
              ) : null}

              {step === 6 ? (
                <dl className="b4-review">
                  <div className="b4-review__row">
                    <dt>Parent</dt>
                    <dd>{parentAgent?.name ?? form.parentId}</dd>
                  </div>
                  <div className="b4-review__row">
                    <dt>Name</dt>
                    <dd>{form.name.trim()}</dd>
                  </div>
                  <div className="b4-review__row">
                    <dt>Structure</dt>
                    <dd>{STRUCTURE_LABELS[form.structure]}</dd>
                  </div>
                  <div className="b4-review__row">
                    <dt>Country</dt>
                    <dd>{form.country.trim() || "—"}</dd>
                  </div>
                  <div className="b4-review__row">
                    <dt>Tier / fee</dt>
                    <dd>
                      {tierLabel(form.commercial.tier)} ·{" "}
                      {form.commercial.volumeFeePercent}%
                    </dd>
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
                >
                  Save &amp; Continue
                </button>
              ) : (
                <button
                  type="button"
                  className="b4-wizard__continue"
                  onClick={() => void handleCreate()}
                  disabled={busy}
                >
                  {busy ? "Creating…" : "Create merchant"}
                </button>
              )}
            </footer>
          </form>
        </div>
      </div>
    </div>
  );
}
