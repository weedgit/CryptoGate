import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AuthToast } from "../auth/AuthToast";
import {
  ApiError,
  createOrg,
  inviteOrgUser,
  listOrgMemberEmails,
  listOrgs,
  mergeAgentOrg,
  refreshAgentOrgList,
  type OrgAccount,
  type Session,
} from "./api";
import { OnboardWizardPortal } from "../shared/OnboardWizardPortal";
import { primaryAgentOrgId } from "./org";
import {
  fetchRegisteredEmailIndex,
  registeredEmailConflict,
  REGISTERED_EMAIL_API_MESSAGE,
} from "../shared/registeredEmails";
import type { RegisteredEmailRef } from "../shared/registeredEmails";
import { FieldControl } from "../ui/FieldControl";
import { agentRoute } from "../shared/portalRouting";
import { onboardInviteCreds } from "../shared/onboardInviteState";
import {
  OnboardFieldHead,
  OnboardMerchantHead,
} from "../shared/onboardMerchantUi";

function agentReturnPrefix(): string {
  const base = agentRoute();
  return base === "/" ? "/" : `${base}/`;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function agentOnboardReturnPath(
  searchParams: URLSearchParams,
  fallback: string,
): string {
  const raw = searchParams.get("returnTo")?.trim();
  if (!raw || !raw.startsWith(agentReturnPrefix())) return fallback;
  return raw;
}

type Props = { session: Session };

type FormState = {
  name: string;
  ownerEmail: string;
};

export function OnboardMerchantPage({ session }: Props) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const parentId = useMemo(() => primaryAgentOrgId(session), [session]);
  const cancelTo = useMemo(
    () => agentOnboardReturnPath(searchParams, agentRoute("merchants")),
    [searchParams],
  );
  const [orgs, setOrgs] = useState<OrgAccount[]>([]);
  const [registeredEmails, setRegisteredEmails] = useState<
    Map<string, RegisteredEmailRef>
  >(() => new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    name: "",
    ownerEmail: "",
  });

  const dismissToast = useCallback(() => setError(null), []);

  useEffect(() => {
    if (!parentId) {
      setError((prev) => prev ?? "Agent org membership required to onboard merchants.");
    }
  }, [parentId]);

  useEffect(() => {
    listOrgs()
      .then(setOrgs)
      .catch(() => setOrgs([]));
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


  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (error) setError(null);
  }

  function validateOwnerEmail(index = registeredEmails): string | null {
    const ownerEmail = form.ownerEmail.trim();
    if (!ownerEmail) return "Owner email is required.";
    if (!EMAIL_PATTERN.test(ownerEmail)) return "Enter a valid email address.";
    return registeredEmailConflict(ownerEmail, index);
  }

  function validate(): string | null {
    if (!form.name.trim()) return "Merchant name is required.";
    return validateOwnerEmail();
  }

  async function handleCreate() {
    if (!parentId) return;
    const msg = validate();
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
        return;
      }

      const created = await createOrg({
        type: "merchant",
        name: form.name.trim(),
        parentId,
        legalName: form.name.trim(),
              });
      mergeAgentOrg(created);
      const invitedEmail = form.ownerEmail.trim();
      const invite = await inviteOrgUser(created.id, {
        email: invitedEmail,
        role: "owner",
      });
      await refreshAgentOrgList();
      navigate(agentRoute(`merchants/${created.id}`), {
        state: {
          invitationSent: true,
          enterprisePending: false,
          onboardedOrgId: created.id,
          inviteCreds: onboardInviteCreds(invitedEmail, invite),
        },
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === "email_taken") {
        setError(REGISTERED_EMAIL_API_MESSAGE);
      } else {
        setError(err instanceof ApiError ? err.message : "Failed to create merchant");
      }
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void handleCreate();
  }

  if (!parentId) {
    return (
      <OnboardWizardPortal>
        <div className="b4-wizard-page">
          <AuthToast message={error} tone="error" onDismiss={dismissToast} />
          <div className="b4-wizard-backdrop">
            <div className="b4-wizard" role="dialog" aria-modal="true">
              <OnboardMerchantHead
                titleId="b5-agent-wizard-title"
                title="Onboard merchant"
                subtitle="Create a new merchant account under your agent."
                closeTo={cancelTo}
              />
              <div className="b4-wizard__body">
                <p className="muted">
                  Agent org membership required to onboard merchants.
                </p>
              </div>
              <footer className="b4-wizard__foot">
                <Link className="b4-wizard__cancel" to={cancelTo}>
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
            className="b4-wizard b4-wizard--single b4-wizard--merchant"
            role="dialog"
            aria-modal="true"
            aria-labelledby="b5-agent-wizard-title"
          >
            <OnboardMerchantHead
              titleId="b5-agent-wizard-title"
              title="Onboard merchant"
              subtitle="Create a new merchant account under your agent."
              closeTo={cancelTo}
            />

            <form className="b4-wizard__form" onSubmit={onSubmit}>
              <div className="b4-wizard__body">
                <div className="b4-field">
                  <OnboardFieldHead
                    htmlFor="merchant-name"
                    label="Business name"
                    lede="Shown in PaymentGate and on invoices."
                  />
                  <FieldControl icon="user">
                    <input
                      id="merchant-name"
                      className="b4-field__control"
                      required
                      value={form.name}
                      onChange={(e) => patch("name", e.target.value)}
                      placeholder="e.g. Casablanca Merchant"
                      autoFocus
                    />
                  </FieldControl>
                </div>

                                <div className="b4-field">
                  <p className="b4-field__hint">
                    Pricing follows the platform volume schedule automatically.
                    Platform Owner can lock a fixed rate later if needed.
                  </p>
                </div>

<div className="b4-field">
                  <OnboardFieldHead
                    htmlFor="owner-email"
                    label="Merchant Owner email"
                    lede="An invitation is sent after the account is created."
                  />
                  <FieldControl icon="mail">
                    <input
                      id="owner-email"
                      className="b4-field__control"
                      type="email"
                      required
                      value={form.ownerEmail}
                      onChange={(e) => patch("ownerEmail", e.target.value)}
                      placeholder="name@company.com"
                    />
                  </FieldControl>
                </div>
              </div>

              <footer className="b4-wizard__foot">
                <div className="b4-wizard__foot-left">
                  <Link className="b4-wizard__cancel" to={cancelTo}>
                    Cancel
                  </Link>
                </div>
                <button
                  type="submit"
                  className="b4-wizard__continue b4-wizard__continue--gold"
                  disabled={busy}
                >
                  {busy ? "Creating…" : "Create"}
                  {!busy ? <span aria-hidden>→</span> : null}
                </button>
              </footer>
            </form>
          </div>
        </div>
      </div>
    </OnboardWizardPortal>
  );
}
