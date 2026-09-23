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
import { OnboardWizardLoading } from "../shared/OnboardWizardLoading";
import { OnboardWizardPortal } from "../shared/OnboardWizardPortal";
import { merchantsInAgentSubtree } from "./agentSubtree";
import { orgTypeLabel, primaryAgentOrgId, sessionCanOnboardMerchant } from "./org";
import {
  fetchRegisteredEmailIndex,
  ownerOnboardEmailConflict,
  inviteEmailErrorMessage,
} from "../shared/registeredEmails";
import type { RegisteredEmailRef } from "../shared/registeredEmails";
import { FieldControl } from "../ui/FieldControl";
import { agentRoute } from "../shared/portalRouting";
import { onboardInviteCreds } from "../shared/onboardInviteState";
import { OrgBrandMark } from "../shared/OrgBrandMark";
import {
  OnboardFieldHead,
  OnboardFixedParent,
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
  parentId: string;
  name: string;
  ownerEmail: string;
};

/** Agent — create a merchant_site under a channel merchant (or nested site). */
export function OnboardSitePage({ session }: Props) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const canManage = useMemo(
    () => sessionCanOnboardMerchant(session),
    [session],
  );
  const agentId = useMemo(() => primaryAgentOrgId(session), [session]);
  const cancelTo = useMemo(
    () => agentOnboardReturnPath(searchParams, agentRoute("merchants")),
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
      setError((prev) => prev ?? "Agent Owner or Administrator required.");
    }
  }, [canManage]);

  useEffect(() => {
    listOrgs()
      .then((rows) => setOrgs(rows))
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

  const channelMerchantIds = useMemo(() => {
    if (!agentId) return new Set<string>();
    return new Set(merchantsInAgentSubtree(agentId, orgs).map((m) => m.id));
  }, [agentId, orgs]);

  const parentOrg = useMemo(
    () => orgs.find((o) => o.id === form.parentId) ?? null,
    [orgs, form.parentId],
  );

  const parentInChannel = useMemo(() => {
    if (!parentOrg) return false;
    if (parentOrg.type === "merchant") {
      return channelMerchantIds.has(parentOrg.id);
    }
    if (parentOrg.type === "merchant_site") {
      // Allow nesting under a site whose billing merchant is in channel.
      let cur: OrgAccount | null = parentOrg;
      const seen = new Set<string>();
      while (cur && !seen.has(cur.id)) {
        seen.add(cur.id);
        if (cur.type === "merchant") return channelMerchantIds.has(cur.id);
        const parentId = cur.parentId ?? null;
        cur = parentId
          ? (orgs.find((o) => o.id === parentId) ?? null)
          : null;
      }
      return false;
    }
    return false;
  }, [parentOrg, channelMerchantIds, orgs]);

  const parentValid =
    (parentOrg?.type === "merchant" || parentOrg?.type === "merchant_site") &&
    parentInChannel;

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (error) setError(null);
  }

  function validateOwnerEmail(index = registeredEmails): string | null {
    const ownerEmail = form.ownerEmail.trim();
    if (!ownerEmail) return null;
    if (!EMAIL_PATTERN.test(ownerEmail)) return "Enter a valid email address.";
    return ownerOnboardEmailConflict(ownerEmail, index);
  }

  function validate(): string | null {
    if (!form.parentId) return "Select a parent merchant.";
    if (!parentValid) return "Parent must be a merchant or site in your channel.";
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
      mergeAgentOrg(created);

      const invitedEmail = form.ownerEmail.trim();
      let inviteCreds = null;
      if (invitedEmail) {
        const invite = await inviteOrgUser(created.id, {
          email: invitedEmail,
          role: "owner",
        });
        inviteCreds = onboardInviteCreds(invitedEmail, invite);
      }
      await refreshAgentOrgList();
      const merchantId =
        parentOrg?.type === "merchant"
          ? parentOrg.id
          : (parentOrg?.parentId ?? form.parentId);
      navigate(agentRoute(`merchants/${merchantId}`), {
        state: {
          invitationSent: Boolean(invitedEmail),
          onboardedOrgId: created.id,
          inviteCreds,
          detailTab: "sites",
        },
      });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? inviteEmailErrorMessage(err)
          : "Failed to create site",
      );
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
                subtitle="Create a site under a channel merchant."
                closeTo={cancelTo}
              />
              <div className="b4-wizard__body">
                <p className="muted">Agent Owner or Administrator required.</p>
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
                subtitle="Create a site under a channel merchant."
                closeTo={cancelTo}
              />
              <div className="b4-wizard__body">
                <p className="muted">
                  Open this from a merchant detail Sites tab (Onboard site), or
                  pass a valid parentId for a merchant in your channel.
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
                <div className="b4-aside-row">
                  <span className="b4-aside-row__label">Parent organization</span>
                  <OnboardFixedParent
                    id="parent-org"
                    name={parentName}
                    typeLabel={parentType}
                    hint="Site is created under this parent."
                    mark={
                      <OrgBrandMark
                        name={parentName}
                        iconKey={parentOrg?.iconKey}
                        size={36}
                      />
                    }
                  />
                </div>

                <label className="b4-field" htmlFor="site-name">
                  <OnboardFieldHead
                    label="Site name"
                    tip="Outlet or storefront name shown on the site portal."
                  />
                  <FieldControl>
                    <input
                      id="site-name"
                      className="field-control"
                      value={form.name}
                      onChange={(e) => patch("name", e.target.value)}
                      disabled={busy}
                      autoFocus
                      autoComplete="organization"
                      required
                    />
                  </FieldControl>
                </label>

                <label className="b4-field" htmlFor="site-owner-email">
                  <OnboardFieldHead
                    label="Owner email (optional)"
                    tip="Invite an Owner for this site. Cannot be a Platform or Agent Owner/Administrator."
                  />
                  <FieldControl>
                    <input
                      id="site-owner-email"
                      className="field-control"
                      type="email"
                      value={form.ownerEmail}
                      onChange={(e) => patch("ownerEmail", e.target.value)}
                      disabled={busy}
                      autoComplete="email"
                      placeholder="owner@example.com"
                    />
                  </FieldControl>
                </label>
              </div>

              <footer className="b4-wizard__foot">
                <Link className="b4-wizard__cancel" to={cancelTo}>
                  Cancel
                </Link>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={busy || !form.name.trim()}
                >
                  {busy ? "Creating…" : "Create site"}
                </button>
              </footer>
            </form>
          </div>
        </div>
      </div>
    </OnboardWizardPortal>
  );
}
