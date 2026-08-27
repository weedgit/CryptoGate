import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Props = { session: Session };

type MerchantStructure = "single_location" | "multi_location";
type MerchantTier = "small" | "mid" | "enterprise";

type WizardState = {
  parentId: string;
  structure: MerchantStructure;
  name: string;
  country: string;
  billingContact: string;
  commercial: { tier: MerchantTier; volumeFeePercent: string };
  ownerEmail: string;
};

const STEPS = [
  "Parent",
  "Structure",
  "Details",
  "Tier",
  "Volume fee",
  "Owner",
  "Review",
] as const;

function defaultVolumeForTier(tiers: FeeTierBand[], tier: MerchantTier): string {
  const band = tiers.find((t) => t.tier === tier);
  return band?.defaultSignupPercent ?? "1.5";
}

/** Platform B5 add — onboard merchant under a chosen agent. */
export function OnboardMerchantPage({ session }: Props) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const canManage = useMemo(() => sessionCanIssueServiceBill(session), [session]);
  const cancelTo = useMemo(
    () => onboardReturnPath(searchParams, "/platform/merchants"),
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
    billingContact: "",
    commercial: { tier: "mid", volumeFeePercent: "1.2" },
    ownerEmail: "",
  }));

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

  const parentAgent = useMemo(
    () => agents.find((a) => a.id === form.parentId) ?? null,
    [agents, form.parentId],
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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
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
        billingEmail: form.billingContact.trim() || undefined,
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
      navigate(`/platform/merchants/${created.id}`, {
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

  if (!canManage) {
    return (
      <div className="panel">
        <p className="error">Platform Owner or Administrator required.</p>
      </div>
    );
  }

  if (booting) {
    return (
      <PlatformPending
        title="Loading merchants form"
        copy="Fetching agents for the parent picker."
      />
    );
  }

  if (agents.length === 0) {
    return (
      <div className="panel">
        <p className="error">
          Onboard an agent first — merchants must sit under an agent account.
        </p>
        <Link className="btn-primary" to="/platform/agents/new">
          Onboard agent
        </Link>
      </div>
    );
  }

  return (
    <div className="panel wizard-panel">
      <div className="panel-head">
        <h2>Onboard merchant</h2>
        <Link className="btn-secondary" to={cancelTo}>
          Cancel
        </Link>
      </div>

      <ol className="wizard-steps">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={i === step ? "active" : i < step ? "done" : ""}
          >
            {label}
          </li>
        ))}
      </ol>

      <form className="form-stack" onSubmit={onSubmit}>
        {step === 0 ? (
          <div className="field">
            <label htmlFor="parent-agent">Parent agent</label>
            <select
              id="parent-agent"
              className="field-control"
              value={form.parentId}
              onChange={(e) => patch("parentId", e.target.value)}
              required
            >
              <option value="">Select agent…</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({orgTypeLabel(a.type)})
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="field">
            <span className="field-label">Structure</span>
            {(Object.keys(STRUCTURE_LABELS) as MerchantStructure[]).map((s) => (
              <label key={s} className="radio-row">
                <input
                  type="radio"
                  checked={form.structure === s}
                  onChange={() => patch("structure", s)}
                />
                {STRUCTURE_LABELS[s]}
              </label>
            ))}
          </div>
        ) : null}

        {step === 2 ? (
          <>
            <div className="field">
              <label htmlFor="merchant-name">Business name</label>
              <input
                id="merchant-name"
                className="field-control"
                required
                value={form.name}
                onChange={(e) => patch("name", e.target.value)}
              />
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="country">Country</label>
                <input
                  id="country"
                  className="field-control"
                  value={form.country}
                  onChange={(e) => patch("country", e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="billing">Billing contact</label>
                <input
                  id="billing"
                  className="field-control"
                  value={form.billingContact}
                  onChange={(e) => patch("billingContact", e.target.value)}
                />
              </div>
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            {form.commercial.tier === "enterprise" ? (
              <div className="banner banner-warn">
                Enterprise custom rates outside the band still need Owner approval.
              </div>
            ) : null}
            <div className="field">
              <label htmlFor="tier">Merchant tier</label>
              <select
                id="tier"
                className="field-control"
                value={form.commercial.tier}
                onChange={(e) => {
                  const tier = e.target.value as MerchantTier;
                  patch("commercial", {
                    tier,
                    volumeFeePercent: defaultVolumeForTier(feeTiers, tier),
                  });
                }}
              >
                {(["small", "mid", "enterprise"] as MerchantTier[]).map((t) => (
                  <option key={t} value={t}>
                    {tierLabel(t)}
                  </option>
                ))}
              </select>
            </div>
            {selectedBand ? (
              <p className="muted" style={{ fontSize: 13 }}>
                Band: {selectedBand.volumeFeeMinPercent}% –{" "}
                {selectedBand.volumeFeeMaxPercent}%
              </p>
            ) : null}
          </>
        ) : null}

        {step === 4 ? (
          <div className="field">
            <label htmlFor="volume-fee">Volume fee %</label>
            <input
              id="volume-fee"
              className="field-control"
              inputMode="decimal"
              value={form.commercial.volumeFeePercent}
              onChange={(e) =>
                patch("commercial", {
                  ...form.commercial,
                  volumeFeePercent: e.target.value,
                })
              }
            />
          </div>
        ) : null}

        {step === 5 ? (
          <div className="field">
            <label htmlFor="owner-email">Merchant Owner email</label>
            <input
              id="owner-email"
              type="email"
              className="field-control"
              required
              value={form.ownerEmail}
              onChange={(e) => patch("ownerEmail", e.target.value)}
            />
          </div>
        ) : null}

        {step === 6 ? (
          <dl className="review-dl">
            <div>
              <dt>Parent</dt>
              <dd>{parentAgent?.name ?? form.parentId}</dd>
            </div>
            <div>
              <dt>Name</dt>
              <dd>{form.name}</dd>
            </div>
            <div>
              <dt>Structure</dt>
              <dd>{STRUCTURE_LABELS[form.structure]}</dd>
            </div>
            <div>
              <dt>Tier / fee</dt>
              <dd>
                {tierLabel(form.commercial.tier)} ·{" "}
                {form.commercial.volumeFeePercent}%
              </dd>
            </div>
            <div>
              <dt>Owner</dt>
              <dd>{form.ownerEmail}</dd>
            </div>
          </dl>
        ) : null}

        {error ? <p className="error">{error}</p> : null}

        <div className="action-row">
          {step > 0 ? (
            <button
              type="button"
              className="btn-secondary"
              disabled={busy}
              onClick={back}
            >
              Back
            </button>
          ) : null}
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn-primary" onClick={next}>
              Continue
            </button>
          ) : (
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Creating…" : "Create merchant"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
