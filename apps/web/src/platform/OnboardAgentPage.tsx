import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ApiError,
  createOrg,
  inviteOrgUser,
  listOrgs,
  type OrgAccount,
} from "./api";
import {
  canCreateAgentUnderParent,
  DEFAULT_MAX_AGENT_DEPTH,
  MERCHANT_TIER_LABELS,
  type OnboardAgentCommercialStub,
} from "./onboardAgent";
import { orgTypeLabel } from "./org";

type AgentKind = "agent" | "agent_sub";

type WizardState = {
  kind: AgentKind;
  parentId: string;
  legalName: string;
  displayName: string;
  billingEmail: string;
  country: string;
  commercial: OnboardAgentCommercialStub;
  ownerEmail: string;
};

const STEPS = ["Type", "Details", "Commercial", "Owner", "Review"] as const;

export function OnboardAgentPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [orgs, setOrgs] = useState<OrgAccount[]>([]);
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<WizardState>({
    kind: "agent",
    parentId: "",
    legalName: "",
    displayName: "",
    billingEmail: "",
    country: "",
    commercial: { commissionPercent: "15", defaultMerchantTier: "mid" },
    ownerEmail: "",
  });

  useEffect(() => {
    listOrgs()
      .then(setOrgs)
      .catch(() => setOrgs([]))
      .finally(() => setBooting(false));
  }, []);

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
  }

  function validateStep(): string | null {
    if (step === 0) {
      if (form.kind === "agent_sub" && !form.parentId) {
        return "Select a parent agent for a sub-agent account.";
      }
      if (depthBlocked) {
        return `Max agent depth (${DEFAULT_MAX_AGENT_DEPTH}) would be exceeded. Adjust platform settings (B13) or choose a higher parent.`;
      }
    }
    if (step === 1 && !apiName) {
      return "Legal or display name is required.";
    }
    if (step === 3 && !form.ownerEmail.trim()) {
      return "Owner email is required.";
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
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function back() {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const msg = validateStep();
    if (msg || !parentId) {
      setError(msg ?? "Parent org missing");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createOrg({
        type: form.kind,
        name: apiName,
        parentId,
      });
      await inviteOrgUser(created.id, {
        email: form.ownerEmail.trim(),
        role: "owner",
      });
      navigate(`/platform/agents/${created.id}`, {
        state: { invitationSent: true, displayName: form.displayName.trim() || apiName },
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === "agent_depth_exceeded") {
        setError(
          `Agent nesting exceeds platform max depth (${DEFAULT_MAX_AGENT_DEPTH}). See fee tier settings (B13).`,
        );
      } else {
        setError(err instanceof ApiError ? err.message : "Failed to create agent");
      }
    } finally {
      setBusy(false);
    }
  }

  if (booting) {
    return <p style={{ color: "var(--muted)" }}>Loading org tree…</p>;
  }

  return (
    <div className="panel wizard-panel">
      <div className="panel-head">
        <h2>Onboard agent account</h2>
        <Link className="btn-secondary" to="/platform/agents">
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
          <>
            <div className="field">
              <span className="field-label">Account type</span>
              <label className="radio-row">
                <input
                  type="radio"
                  checked={form.kind === "agent"}
                  onChange={() => patch("kind", "agent")}
                />
                Agent (top-level under Platform)
              </label>
              <label className="radio-row">
                <input
                  type="radio"
                  checked={form.kind === "agent_sub"}
                  onChange={() => patch("kind", "agent_sub")}
                />
                Agent (sub) under parent
              </label>
            </div>
            {form.kind === "agent_sub" ? (
              <div className="field">
                <label htmlFor="parent-agent">Parent agent</label>
                <select
                  id="parent-agent"
                  className="field-control"
                  value={form.parentId}
                  onChange={(e) => patch("parentId", e.target.value)}
                  required
                >
                  <option value="">Select parent…</option>
                  {agentParents
                    .filter((o) => o.type !== "platform")
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name} ({orgTypeLabel(o.type)})
                      </option>
                    ))}
                </select>
              </div>
            ) : null}
            {depthBlocked ? (
              <p className="error">
                Max agent depth ({DEFAULT_MAX_AGENT_DEPTH}) reached for this parent.{" "}
                <Link to="/platform/settings/fee-tiers">Platform settings (B13)</Link>
              </p>
            ) : null}
          </>
        ) : null}

        {step === 1 ? (
          <>
            <div className="field">
              <label htmlFor="legal-name">Legal name</label>
              <input
                id="legal-name"
                className="field-control"
                value={form.legalName}
                onChange={(e) => patch("legalName", e.target.value)}
                placeholder="Registered entity name"
              />
            </div>
            <div className="field">
              <label htmlFor="display-name">Display name</label>
              <input
                id="display-name"
                className="field-control"
                value={form.displayName}
                onChange={(e) => patch("displayName", e.target.value)}
                placeholder="Portal label (optional if legal name set)"
              />
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="billing-email">Billing email</label>
                <input
                  id="billing-email"
                  className="field-control"
                  type="email"
                  value={form.billingEmail}
                  onChange={(e) => patch("billingEmail", e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="country">Country</label>
                <input
                  id="country"
                  className="field-control"
                  value={form.country}
                  onChange={(e) => patch("country", e.target.value)}
                />
              </div>
            </div>
            <p className="stub-note">
              Stub — billing email and country are collected for B4 UX only. Only{" "}
              <strong>legal/display name</strong> is sent to <code>POST /v1/orgs</code>{" "}
              today.
            </p>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <div className="banner banner-warn">
              Commercial step is <strong>stub UI</strong> until Kevin ships X-01 fee
              tier / commission API (OpenAPI v0.3.2+). Values appear on review but are
              not persisted.
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="commission">Commission % on platform fee</label>
                <input
                  id="commission"
                  className="field-control"
                  value={form.commercial.commissionPercent}
                  onChange={(e) =>
                    patch("commercial", {
                      ...form.commercial,
                      commissionPercent: e.target.value,
                    })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="tier">Default merchant tier</label>
                <select
                  id="tier"
                  className="field-control"
                  value={form.commercial.defaultMerchantTier}
                  onChange={(e) =>
                    patch("commercial", {
                      ...form.commercial,
                      defaultMerchantTier: e.target.value as OnboardAgentCommercialStub["defaultMerchantTier"],
                    })
                  }
                >
                  <option value="small">Small</option>
                  <option value="mid">Mid</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <div className="field">
            <label htmlFor="owner-email">Invite first Owner</label>
            <input
              id="owner-email"
              className="field-control"
              type="email"
              required
              value={form.ownerEmail}
              onChange={(e) => patch("ownerEmail", e.target.value)}
            />
            <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 8 }}>
              Real — calls <code>POST /v1/orgs{"{id}"}/users</code> after org create.
            </p>
          </div>
        ) : null}

        {step === 4 ? (
          <dl className="detail-grid">
            <dt>Type</dt>
            <dd>{orgTypeLabel(form.kind)}</dd>
            <dt>Parent</dt>
            <dd className="mono">{parentId || "—"}</dd>
            <dt>Name (API)</dt>
            <dd>{apiName}</dd>
            <dt>Billing email</dt>
            <dd>{form.billingEmail.trim() || "— (stub)"}</dd>
            <dt>Country</dt>
            <dd>{form.country.trim() || "— (stub)"}</dd>
            <dt>Commission</dt>
            <dd>{form.commercial.commissionPercent}% (stub)</dd>
            <dt>Default tier</dt>
            <dd>
              {MERCHANT_TIER_LABELS[form.commercial.defaultMerchantTier]} (stub)
            </dd>
            <dt>Owner invite</dt>
            <dd>{form.ownerEmail.trim()}</dd>
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
            <button type="button" className="btn-primary" onClick={next} disabled={depthBlocked}>
              Next
            </button>
          ) : (
            <button className="btn-primary" type="submit" disabled={busy || depthBlocked}>
              {busy ? "Creating…" : "Create agent account"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
