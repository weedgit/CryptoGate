import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AuthToast } from "../auth/AuthToast";
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
  inviteOrgUser,
  listOrgMemberEmails,
  listOrgs,
  type OrgAccount,
  type Session,
} from "./api";
import { primaryAgentOrgId, sessionCanOnboardMerchant } from "./org";
import { agentRoute } from "../shared/portalRouting";
import { onboardInviteCreds } from "../shared/onboardInviteState";
import {
  mergeAgentOrg,
  refreshAgentOrgList,
} from "./agentOrgList";

function agentReturnPrefix(): string {
  const base = agentRoute();
  return base === "/" ? "/" : `${base}/`;
}

type Props = { session: Session };

type FormState = {
  businessName: string;
  ownerEmail: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

function returnPath(searchParams: URLSearchParams): string {
  const raw = searchParams.get("returnTo")?.trim();
  if (!raw || !raw.startsWith(agentReturnPrefix())) return agentRoute("agents");
  return raw;
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

  const [orgs, setOrgs] = useState<OrgAccount[]>([]);
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registeredEmails, setRegisteredEmails] = useState<
    Map<string, RegisteredEmailRef>
  >(() => new Map());
  const [form, setForm] = useState<FormState>({
    businessName: "",
    ownerEmail: "",
  });

  const dismissToast = useCallback(() => setError(null), []);

  const patch = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      if (error) setError(null);
    },
    [error],
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
  }, []);

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

  const apiName = form.businessName.trim();

  function validate(): string | null {
    if (!apiName) {
      return "Business name is required.";
    }
    if (!form.ownerEmail.trim() || !isValidEmail(form.ownerEmail)) {
      return "Enter a valid owner email.";
    }
    const conflict = registeredEmailConflict(
      form.ownerEmail,
      registeredEmails,
    );
    if (conflict) return conflict;
    return null;
  }

  async function handleCreate() {
    const msg = validate();
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
        return;
      }
      const created = await createOrg({
        type: "agent_sub",
        name: apiName,
        parentId,
        legalName: apiName,
      });
      mergeAgentOrg(created);
      const invitedEmail = form.ownerEmail.trim();
      const invite = await inviteOrgUser(created.id, {
        email: invitedEmail,
        role: "owner",
      });
      await refreshAgentOrgList();
      navigate(agentRoute(`agents/${created.id}`), {
        state: {
          invitationSent: true,
          displayName: apiName,
          onboardedOrgId: created.id,
          inviteCreds: onboardInviteCreds(invitedEmail, invite),
        },
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === "agent_depth_exceeded") {
        setError(
          `Agent nesting exceeds platform max depth (${DEFAULT_MAX_AGENT_DEPTH}).`,
        );
      } else if (err instanceof ApiError && err.code === "email_taken") {
        setError(REGISTERED_EMAIL_API_MESSAGE);
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
        copy="Checking nesting depth and preparing the form."
        closeTo={backTo}
      />
    );
  }

  if (!parentId || !parentOrg) {
    return (
      <OnboardWizardPortal>
        <div className="b4-wizard-page">
          <AuthToast message={error} tone="error" onDismiss={dismissToast} />
          <p className="muted">Could not load the parent agent for this form.</p>
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
                  {parentOrg.name}.
                </p>
              </div>
              <footer className="b4-wizard__foot">
                <Link className="b4-wizard__cancel" to={backTo}>
                  Cancel
                </Link>
              </footer>
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
            className="b4-wizard b4-wizard--single"
            role="dialog"
            aria-modal="true"
            aria-labelledby="c4-wizard-title"
          >
            <header className="b4-wizard__head">
              <h2 id="c4-wizard-title" className="b4-wizard__title">
                Onboard sub-agent
              </h2>
              <Link className="b4-wizard__close" to={backTo} aria-label="Close">
                ×
              </Link>
            </header>

            <form className="b4-wizard__form" onSubmit={onSubmit}>
              <div className="b4-wizard__body">
                <p className="b4-field__hint" style={{ marginTop: 0 }}>
                  Parent: {parentOrg.name}
                </p>

                <div className="b4-field">
                  <label className="b4-field__label" htmlFor="c4-business">
                    Business name
                  </label>
                  <FieldControl icon="user">
                    <input
                      id="c4-business"
                      className="b4-field__control"
                      value={form.businessName}
                      onChange={(e) => patch("businessName", e.target.value)}
                      placeholder="e.g. Atlas Agent"
                      autoComplete="organization"
                      autoFocus
                    />
                  </FieldControl>
                  <p className="b4-field__hint">
                    Shown in PaymentGate and on invoices.
                  </p>
                </div>

                <div className="b4-field">
                  <p className="b4-field__hint">
                    Commission follows the platform volume schedule automatically.
                  </p>
                </div>

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
              </div>

              <footer className="b4-wizard__foot">
                <div className="b4-wizard__foot-left">
                  <Link className="b4-wizard__cancel" to={backTo}>
                    Cancel
                  </Link>
                </div>
                <button
                  type="submit"
                  className="b4-wizard__continue"
                  disabled={busy}
                >
                  {busy ? "Creating…" : "Create sub-agent"}
                </button>
              </footer>
            </form>
          </div>
        </div>
      </div>
    </OnboardWizardPortal>
  );
}
