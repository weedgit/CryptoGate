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
  registeredEmailConflict,
  fetchRegisteredEmailIndex,
  REGISTERED_EMAIL_API_MESSAGE,
} from "../shared/registeredEmails";
import type { RegisteredEmailRef } from "../shared/registeredEmails";
import { FieldControl } from "../ui/FieldControl";
import { platformRoute } from "../shared/portalRouting";
import { onboardInviteCreds } from "../shared/onboardInviteState";
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

/** Platform — create a merchant_site under a merchant (or nested site). */
export function OnboardSitePage({ session }: Props) {
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

  const parentOrg = useMemo(
    () => orgs.find((o) => o.id === form.parentId) ?? null,
    [orgs, form.parentId],
  );

  const parentValid =
    parentOrg?.type === "merchant" || parentOrg?.type === "merchant_site";

  /** Billing merchant for navigation after create. */
  const billingMerchantId = useMemo(() => {
    if (!parentOrg) return null;
    if (parentOrg.type === "merchant") return parentOrg.id;
    let cur: OrgAccount | undefined = parentOrg;
    const byId = new Map(orgs.map((o) => [o.id, o]));
    for (let i = 0; i < 32 && cur; i += 1) {
      if (cur.type === "merchant") return cur.id;
      if (!cur.parentId) break;
      cur = byId.get(cur.parentId);
    }
    return parentOrg.parentId;
  }, [orgs, parentOrg]);

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (error) setError(null);
  }

  function validateOwnerEmail(index = registeredEmails): string | null {
    const ownerEmail = form.ownerEmail.trim();
    if (!ownerEmail) return null;
    if (!EMAIL_PATTERN.test(ownerEmail)) return "Enter a valid email address.";
    return registeredEmailConflict(ownerEmail, index);
  }

  function validate(): string | null {
    if (!form.parentId) return "Select a parent merchant.";
    if (!parentValid) return "Parent must be a merchant or site.";
    if (!form.name.trim()) return "Site name is required.";
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
        type: "merchant_site",
        name: form.name.trim(),
        parentId: form.parentId,
      });
      mergePlatformOrg(created);

      const invitedEmail = form.ownerEmail.trim();
      let inviteCreds = null;
      if (invitedEmail) {
        const invite = await inviteOrgUser(created.id, {
          email: invitedEmail,
          role: "owner",
        });
        inviteCreds = onboardInviteCreds(invitedEmail, invite);
      }
      await refreshPlatformOrgList();
      const merchantId = billingMerchantId ?? form.parentId;
      navigate(
        platformRoute(`accounts/merchants/${merchantId}`),
        {
          state: {
            invitationSent: Boolean(invitedEmail),
            onboardedOrgId: created.id,
            inviteCreds,
          },
        },
      );
    } catch (err) {
      if (err instanceof ApiError && err.code === "email_taken") {
        setError(REGISTERED_EMAIL_API_MESSAGE);
      } else {
        setError(err instanceof ApiError ? err.message : "Failed to create site");
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
                titleId="site-wizard-title"
                title="New site"
                subtitle="Create a site under a merchant."
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
        title="New site"
        copy="Loading parent merchant for this site."
        closeTo={cancelTo}
      />
    );
  }

  if (!form.parentId || !parentValid) {
    return (
      <OnboardWizardPortal>
        <div className="b4-wizard-page">
          <AuthToast message={error} tone="error" onDismiss={dismissToast} />
          <div className="b4-wizard-backdrop">
            <div className="b4-wizard" role="dialog" aria-modal="true">
              <OnboardMerchantHead
                titleId="site-wizard-title"
                title="New site"
                subtitle="Create a site under a merchant."
                closeTo={cancelTo}
              />
              <div className="b4-wizard__body">
                <p className="muted">
                  Open this from a merchant in Architecture (right-click → New
                  Site), or pass a valid parentId.
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

  const parentName = parentOrg?.name ?? "Merchant";
  const parentType = parentOrg ? orgTypeLabel(parentOrg.type) : "Merchant";

  return (
    <OnboardWizardPortal>
      <div className="b4-wizard-page">
        <AuthToast message={error} tone="error" onDismiss={dismissToast} />
        <div className="b4-wizard-backdrop">
          <div
            className="b4-wizard b4-wizard--single b4-wizard--merchant"
            role="dialog"
            aria-modal="true"
            aria-labelledby="site-wizard-title"
          >
            <OnboardMerchantHead
              titleId="site-wizard-title"
              title="New site"
              subtitle={`Create a site under ${parentName}.`}
              closeTo={cancelTo}
            />

            <form className="b4-wizard__form" onSubmit={onSubmit}>
              <div className="b4-wizard__body">
                <OnboardFixedParent
                  id="parent-org"
                  name={parentName}
                  typeLabel={parentType}
                  mark={
                    <OrgBrandMark
                      name={parentName}
                      iconKey={parentOrg?.iconKey}
                      size={36}
                    />
                  }
                />

                <div className="b4-field">
                  <OnboardFieldHead
                    htmlFor="site-name"
                    label="Site name"
                    lede="Outlet or location shown in PaymentGate."
                  />
                  <FieldControl icon="user">
                    <input
                      id="site-name"
                      className="b4-field__control"
                      required
                      value={form.name}
                      onChange={(e) => patch("name", e.target.value)}
                      placeholder="e.g. Downtown branch"
                      autoFocus
                    />
                  </FieldControl>
                </div>

                <div className="b4-field">
                  <OnboardFieldHead
                    htmlFor="owner-email"
                    label="Site Owner email"
                    lede="Optional — invite a site owner after create."
                  />
                  <FieldControl icon="mail">
                    <input
                      id="owner-email"
                      className="b4-field__control"
                      type="email"
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
