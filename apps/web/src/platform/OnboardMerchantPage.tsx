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
import { orgTypeLabel, sessionCanManagePlatform } from "./org";
import { onboardReturnPath } from "./platformNav";
import {
  fetchRegisteredEmailIndex,
  ownerOnboardEmailConflict,
  inviteEmailErrorMessage,
  REGISTERED_EMAIL_API_MESSAGE,
} from "../shared/registeredEmails";
import type { RegisteredEmailRef } from "../shared/registeredEmails";
import { FieldControl } from "../ui/FieldControl";
import { platformRoute } from "../shared/portalRouting";
import { onboardInviteCreds } from "../shared/onboardInviteState";
import { GateLogoMark } from "../auth/GateLogoMark";
import { OrgBrandMark } from "../shared/OrgBrandMark";
import {
  OnboardFieldHead,
  OnboardFixedParent,
  OnboardMerchantHead,
} from "../shared/onboardMerchantUi";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Props = { session: Session };

type FormState = {
  parentId: string;
  name: string;
  ownerEmail: string;
};

/** Platform B5 add — onboard merchant under Platform or an agent. */
export function OnboardMerchantPage({ session }: Props) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const canManage = useMemo(() => sessionCanManagePlatform(session), [session]);
  const cancelTo = useMemo(
    () => onboardReturnPath(searchParams, platformRoute("accounts")),
    [searchParams],
  );
  const [orgs, setOrgs] = useState<OrgAccount[]>([]);
  const [registeredEmails, setRegisteredEmails] = useState<
    Map<string, RegisteredEmailRef>
  >(() => new Map());
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => ({
    parentId: searchParams.get("parentId")?.trim() ?? "",
    name: "",
    ownerEmail: "",
  }));

  const dismissToast = useCallback(() => setError(null), []);

  useEffect(() => {
    if (!canManage) {
      setError((prev) => prev ?? "Platform Owner or Administrator required.");
    }
  }, [canManage]);

  useEffect(() => {
    getPlatformOrgs()
      .then((rows) => {
        setOrgs(rows);
      })
      .catch(() => {
        setOrgs([]);
      })
      .finally(() => setBooting(false));
  }, []);

  const platformOrg = useMemo(
    () => orgs.find((o) => o.type === "platform") ?? null,
    [orgs],
  );

  useEffect(() => {
    if (!platformOrg) return;
    setForm((prev) => (prev.parentId ? prev : { ...prev, parentId: platformOrg.id }));
  }, [platformOrg]);

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


  const parentOptions = useMemo(() => {
    const options: { id: string; label: string; hint: string }[] = [];
    if (platformOrg) {
      options.push({
        id: platformOrg.id,
        label: platformOrg.name,
        hint: "Platform",
      });
    }
    for (const org of orgs) {
      if (org.type !== "agent") continue;
      options.push({
        id: org.id,
        label: org.name,
        hint: orgTypeLabel(org.type),
      });
    }
    return options;
  }, [orgs, platformOrg]);

  const selectedParent = useMemo(
    () => parentOptions.find((o) => o.id === form.parentId) ?? null,
    [parentOptions, form.parentId],
  );
  const selectedParentOrg = useMemo(
    () => orgs.find((o) => o.id === form.parentId) ?? null,
    [orgs, form.parentId],
  );
  const parentName = selectedParent?.label ?? platformOrg?.name ?? "PaymentGate";
  const parentTypeLabel = selectedParent?.hint ?? "Platform";
  const parentIsPlatform = selectedParentOrg?.type === "platform" || !selectedParentOrg;

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (error) setError(null);
  }

  function validateOwnerEmail(index = registeredEmails): string | null {
    const ownerEmail = form.ownerEmail.trim();
    if (!ownerEmail) return "Owner email is required.";
    if (!EMAIL_PATTERN.test(ownerEmail)) return "Enter a valid email address.";
    return ownerOnboardEmailConflict(ownerEmail, index);
  }

  function validate(): string | null {
    if (!form.parentId) return "Select a parent.";
    if (!form.name.trim()) return "Merchant name is required.";
    return validateOwnerEmail();
  }

  async function handleCreate() {
    if (!canManage || !form.parentId) return;
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
        parentId: form.parentId,
        legalName: form.name.trim(),
      });
      mergePlatformOrg(created);
      const invitedEmail = form.ownerEmail.trim();
      const invite = await inviteOrgUser(created.id, {
        email: invitedEmail,
        role: "owner",
      });
      await refreshPlatformOrgList();
      navigate(platformRoute(`accounts/merchants/${created.id}`), {
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
        setError(inviteEmailErrorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void handleCreate();
  }

  if (!canManage) {
    return (
      <OnboardWizardPortal>
        <div className="b4-wizard-page">
          <AuthToast message={error} tone="error" onDismiss={dismissToast} />
          <div className="b4-wizard-backdrop">
            <div className="b4-wizard" role="dialog" aria-modal="true">
              <OnboardMerchantHead
                titleId="b5-wizard-title"
                title="Onboard merchant"
                subtitle="Create a new merchant account under PaymentGate."
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

  if (booting) {
    return (
      <OnboardWizardLoading
        title="Onboard merchant"
        copy="Fetching parent options for this merchant."
        closeTo={cancelTo}
      />
    );
  }

  if (!platformOrg) {
    return (
      <OnboardWizardPortal>
        <div className="b4-wizard-page">
          <AuthToast message={error} tone="error" onDismiss={dismissToast} />
          <div className="b4-wizard-backdrop">
            <div className="b4-wizard" role="dialog" aria-modal="true">
              <OnboardMerchantHead
                titleId="b5-wizard-title"
                title="Onboard merchant"
                subtitle="Create a new merchant account under PaymentGate."
                closeTo={cancelTo}
              />
              <div className="b4-wizard__body">
                <p className="muted">Platform org is not available. Try again later.</p>
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
            aria-labelledby="b5-wizard-title"
          >
            <OnboardMerchantHead
              titleId="b5-wizard-title"
              title="Onboard merchant"
              subtitle={`Create a new merchant account under ${parentName}.`}
              closeTo={cancelTo}
            />

            <form className="b4-wizard__form" onSubmit={onSubmit}>
              <div className="b4-wizard__body">
                <div className="b4-aside-row">
                  <span className="b4-aside-row__label">Parent organization</span>
                  <OnboardFixedParent
                    id="parent-org"
                    name={parentName}
                    typeLabel={parentTypeLabel}
                    mark={
                      parentIsPlatform ? (
                        <GateLogoMark size={36} className="b4-parent-card__gate" />
                      ) : (
                        <OrgBrandMark
                          name={parentName}
                          iconKey={selectedParentOrg?.iconKey}
                          size={36}
                        />
                      )
                    }
                  />
                </div>

                <div className="b4-aside-row">
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

                <div className="b4-aside-row">
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
