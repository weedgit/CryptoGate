import { FormEvent, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, createOrg, inviteOrgUser, type Session } from "./api";
import {
  MERCHANT_TIER_LABELS,
  STRUCTURE_LABELS,
  type MerchantStructure,
  type MerchantTier,
  type OnboardMerchantCommercialStub,
} from "./onboardMerchant";
import { primaryAgentOrgId } from "./org";

type Props = { session: Session };

type WizardState = {
  structure: MerchantStructure;
  name: string;
  country: string;
  billingContact: string;
  commercial: OnboardMerchantCommercialStub;
  ownerEmail: string;
};

const STEPS = ["Structure", "Details", "Tier", "Volume fee", "Owner", "Review"] as const;

export function OnboardMerchantPage({ session }: Props) {
  const navigate = useNavigate();
  const parentId = useMemo(() => primaryAgentOrgId(session), [session]);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<WizardState>({
    structure: "single_location",
    name: "",
    country: "",
    billingContact: "",
    commercial: { tier: "mid", volumeFeePercent: "1.5" },
    ownerEmail: "",
  });

  function patch<K extends keyof WizardState>(key: K, value: WizardState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validateStep(): string | null {
    if (!parentId) return "No agent org on this session.";
    if (step === 1 && !form.name.trim()) return "Merchant name is required.";
    if (step === 4 && !form.ownerEmail.trim()) return "Owner email is required.";
    return null;
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
    if (!parentId) return;
    const msg = validateStep();
    if (msg) {
      setError(msg);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createOrg({
        type: "merchant",
        name: form.name.trim(),
        parentId,
        structure: form.structure,
      });
      await inviteOrgUser(created.id, {
        email: form.ownerEmail.trim(),
        role: "owner",
      });
      navigate(`/agent/merchants/${created.id}`, {
        state: {
          invitationSent: true,
          enterprisePending:
            form.commercial.tier === "enterprise" ? true : undefined,
        },
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create merchant");
    } finally {
      setBusy(false);
    }
  }

  if (!parentId) {
    return (
      <div className="panel">
        <p className="error">Agent org membership required to onboard merchants.</p>
      </div>
    );
  }

  return (
    <div className="panel wizard-panel">
      <div className="panel-head">
        <h2>Onboard merchant</h2>
        <Link className="btn-secondary" to="/agent/merchants">
          Cancel
        </Link>
      </div>

      <ol className="wizard-steps">
        {STEPS.map((label, i) => (
          <li key={label} className={i === step ? "active" : i < step ? "done" : ""}>
            {label}
          </li>
        ))}
      </ol>

      <form className="form-stack" onSubmit={onSubmit}>
        {step === 0 ? (
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
            <p style={{ color: "var(--muted)", fontSize: 13 }}>
              Real — sent as <code>structure</code> on <code>POST /v1/orgs</code>.
            </p>
          </div>
        ) : null}

        {step === 1 ? (
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
            <p className="stub-note">
              Stub — country and billing contact are UI-only until org profile API
              exists. <strong>Name</strong> is persisted via org create.
            </p>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <div className="banner banner-warn">
              Tier selection is <strong>stub UI</strong> until X-01 fee tier API.
              Enterprise shows a platform-approval banner on success only.
            </div>
            <div className="field">
              <label htmlFor="tier">Merchant tier</label>
              <select
                id="tier"
                className="field-control"
                value={form.commercial.tier}
                onChange={(e) =>
                  patch("commercial", {
                    ...form.commercial,
                    tier: e.target.value as MerchantTier,
                  })
                }
              >
                {(Object.keys(MERCHANT_TIER_LABELS) as MerchantTier[]).map((t) => (
                  <option key={t} value={t}>
                    {MERCHANT_TIER_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <div className="banner banner-warn">
              Volume fee % is <strong>stub UI</strong> — not sent to API (effective
              next billing period requires X-01).
            </div>
            <div className="field">
              <label htmlFor="volume-fee">Volume fee %</label>
              <input
                id="volume-fee"
                className="field-control"
                value={form.commercial.volumeFeePercent}
                onChange={(e) =>
                  patch("commercial", {
                    ...form.commercial,
                    volumeFeePercent: e.target.value,
                  })
                }
              />
            </div>
          </>
        ) : null}

        {step === 4 ? (
          <div className="field">
            <label htmlFor="owner-email">Invite merchant Owner</label>
            <input
              id="owner-email"
              className="field-control"
              type="email"
              required
              value={form.ownerEmail}
              onChange={(e) => patch("ownerEmail", e.target.value)}
            />
          </div>
        ) : null}

        {step === 5 ? (
          <dl className="detail-grid">
            <dt>Structure</dt>
            <dd>{STRUCTURE_LABELS[form.structure]}</dd>
            <dt>Name</dt>
            <dd>{form.name.trim()}</dd>
            <dt>Country</dt>
            <dd>{form.country.trim() || "— (stub)"}</dd>
            <dt>Billing contact</dt>
            <dd>{form.billingContact.trim() || "— (stub)"}</dd>
            <dt>Tier</dt>
            <dd>{MERCHANT_TIER_LABELS[form.commercial.tier]} (stub)</dd>
            <dt>Volume fee</dt>
            <dd>{form.commercial.volumeFeePercent}% (stub)</dd>
            <dt>Owner invite</dt>
            <dd>{form.ownerEmail.trim()}</dd>
            <dt>Parent agent</dt>
            <dd className="mono">{parentId}</dd>
          </dl>
        ) : null}

        {error ? <p className="error">{error}</p> : null}

        <div className="action-row">
          {step > 0 ? (
            <button type="button" className="btn-secondary" onClick={back} disabled={busy}>
              Back
            </button>
          ) : null}
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn-primary" onClick={next}>
              Next
            </button>
          ) : (
            <button className="btn-primary" type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create merchant"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
