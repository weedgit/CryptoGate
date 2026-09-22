import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AuthToast } from "../auth/AuthToast";
import {
  ApiError,
  createOrg,
  getPlatformOrgs,
  inviteOrgUser,
  listOrgMemberEmails,
  mergePlatformOrg,
  refreshPlatformOrgList,
  type OrgAccount,
  type Session,
} from "./api";
import { OnboardWizardLoading } from "../shared/OnboardWizardLoading";
import { OnboardWizardPortal } from "../shared/OnboardWizardPortal";
import { FieldControl } from "../ui/FieldControl";
import {
  registeredEmailConflict,
  fetchRegisteredEmailIndex,
  REGISTERED_EMAIL_API_MESSAGE,
} from "../shared/registeredEmails";
import type { RegisteredEmailRef } from "../shared/registeredEmails";
import { sessionCanManagePlatform } from "./org";
import { onboardReturnPath } from "./platformNav";
import { platformRoute } from "../shared/portalRouting";
import { onboardInviteCreds } from "../shared/onboardInviteState";
import {
  OnboardFieldHead,
  OnboardWizardBrandHead,
} from "../shared/onboardMerchantUi";

type FormState = {
  businessName: string;
  ownerEmail: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FieldKey = "businessName" | "ownerEmail";

function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

export function OnboardAgentPage({ session }: { session: Session }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const canManage = useMemo(() => sessionCanManagePlatform(session), [session]);
  const [orgs, setOrgs] = useState<OrgAccount[]>([]);
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [registeredEmails, setRegisteredEmails] = useState<
    Map<string, RegisteredEmailRef>
  >(() => new Map());
  const dismissToast = useCallback(() => setError(null), []);

  useEffect(() => {
    if (!canManage) {
      setError((prev) => prev ?? "Platform Owner or Administrator required.");
    }
  }, [canManage]);

  const cancelTo = useMemo(
    () => onboardReturnPath(searchParams, platformRoute("accounts")),
    [searchParams],
  );
  const [form, setForm] = useState<FormState>(() => ({
    businessName: "",
    ownerEmail: "",
  }));

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

  const parentId = platformOrg?.id ?? "";
  const apiName = useMemo(() => form.businessName.trim(), [form.businessName]);
  const pageTitle = "Onboard agent";
  const pageSubtitle = `Create a new agent account under ${platformOrg?.name || "PaymentGate"}.`;

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key in fieldErrors) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key as FieldKey];
        return next;
      });
    }
    if (error) setError(null);
  }

  function validate(): string | null {
    const nextFieldErrors: Partial<Record<FieldKey, string>> = {};

    if (!apiName) {
      nextFieldErrors.businessName = "Business name is required.";
    }
    const ownerEmail = form.ownerEmail.trim();
    if (!ownerEmail) {
      nextFieldErrors.ownerEmail = "Owner email is required.";
    } else if (!isValidEmail(ownerEmail)) {
      nextFieldErrors.ownerEmail = "Enter a valid email address.";
    } else {
      const conflict = registeredEmailConflict(ownerEmail, registeredEmails);
      if (conflict) nextFieldErrors.ownerEmail = conflict;
    }

    setFieldErrors(nextFieldErrors);
    return Object.values(nextFieldErrors)[0] ?? null;
  }

  async function handleCreate() {
    const msg = validate();
    if (msg) {
      setError(msg);
      return;
    }
    if (!parentId) {
      setError("Platform org missing.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const freshIndex = await fetchRegisteredEmailIndex(orgs, listOrgMemberEmails);
      setRegisteredEmails(freshIndex);
      const conflict = registeredEmailConflict(form.ownerEmail, freshIndex);
      if (conflict) {
        setFieldErrors({ ownerEmail: conflict });
        setError(conflict);
        return;
      }

      const created = await createOrg({
        type: "agent",
        name: apiName,
        parentId,
        legalName: apiName,
      });
      mergePlatformOrg(created);
      const invitedEmail = form.ownerEmail.trim();
      const invite = await inviteOrgUser(created.id, {
        email: invitedEmail,
        role: "owner",
      });
      await refreshPlatformOrgList();
      const inviteCreds = onboardInviteCreds(invitedEmail, invite);
      navigate(platformRoute(`accounts/agents/${created.id}`), {
        state: {
          invitationSent: true,
          displayName: apiName,
          onboardedOrgId: created.id,
          inviteCreds,
        },
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === "email_taken") {
        setError(REGISTERED_EMAIL_API_MESSAGE);
        setFieldErrors({ ownerEmail: REGISTERED_EMAIL_API_MESSAGE });
      } else if (err instanceof ApiError && err.code === "org_type_disabled") {
        setError(err.message);
      } else {
        setError(err instanceof ApiError ? err.message : "Failed to create agent");
      }
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void handleCreate();
  }

  if (booting) {
    return (
      <OnboardWizardLoading
        title={pageTitle}
        copy="Preparing parent options for this agent."
        closeTo={cancelTo}
      />
    );
  }

  if (!canManage) {
    return (
      <OnboardWizardPortal>
        <div className="b4-wizard-page">
          <AuthToast message={error} tone="error" onDismiss={dismissToast} />
          <div className="b4-wizard-backdrop">
            <div className="b4-wizard" role="dialog" aria-modal="true">
              <OnboardWizardBrandHead
                titleId="b4-wizard-title"
                title={pageTitle}
                subtitle={pageSubtitle}
                closeTo={cancelTo}
              />
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
      </OnboardWizardPortal>
    );
  }

  return (
    <OnboardWizardPortal>
      <div className="b4-wizard-page">
        <AuthToast message={error} tone="error" onDismiss={dismissToast} />
        <div className="b4-wizard-backdrop">
          <div
            className="b4-wizard b4-wizard--single b4-wizard--agent"
            role="dialog"
            aria-modal="true"
            aria-labelledby="b4-wizard-title"
          >
            <OnboardWizardBrandHead
              titleId="b4-wizard-title"
              title={pageTitle}
              subtitle={pageSubtitle}
              closeTo={cancelTo}
            />

            <form className="b4-wizard__form" onSubmit={onSubmit}>
              <div className="b4-wizard__body">
                <div className="b4-field">
                  <OnboardFieldHead
                    htmlFor="business-name"
                    label="Business name"
                    lede="Shown in PaymentGate and on invoices."
                  />
                  <FieldControl icon="user" invalid={Boolean(fieldErrors.businessName)}>
                    <input
                      id="business-name"
                      className={`b4-field__control${fieldErrors.businessName ? " is-invalid" : ""}`}
                      value={form.businessName}
                      onChange={(e) => patch("businessName", e.target.value)}
                      placeholder="e.g. Atlas Agent"
                      autoComplete="organization"
                      autoFocus
                    />
                  </FieldControl>
                  {fieldErrors.businessName ? (
                    <p className="b4-field__error">{fieldErrors.businessName}</p>
                  ) : null}
                </div>

                <div className="b4-field">
                  <OnboardFieldHead
                    htmlFor="owner-email"
                    label="Invite first Owner"
                    lede="An invitation is sent after the account is created."
                  />
                  <FieldControl icon="mail" invalid={Boolean(fieldErrors.ownerEmail)}>
                    <input
                      id="owner-email"
                      className={`b4-field__control${fieldErrors.ownerEmail ? " is-invalid" : ""}`}
                      type="email"
                      value={form.ownerEmail}
                      onChange={(e) => patch("ownerEmail", e.target.value)}
                      placeholder="Name@company.com"
                    />
                  </FieldControl>
                  {fieldErrors.ownerEmail ? (
                    <p className="b4-field__error">{fieldErrors.ownerEmail}</p>
                  ) : null}
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
                  disabled={busy || !parentId}
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
