import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { merchantRoute } from "../shared/portalRouting";
import { AuthToast } from "../auth/AuthToast";
import { OrgEditWaves } from "../shared/OrgEditWaves";
import { FieldControl } from "../ui/FieldControl";
import { SearchableSelect } from "../ui/SearchableSelect";
import {
  ApiError,
  createOrg,
  listOrgMemberEmails,
  type OrgAccount,
  type Session,
} from "./api";
import { getMerchantOrgs, refreshMerchantOrgList } from "./merchantOrgList";
import {
  parentMerchantOrgId,
  primaryMerchantOrgId,
  sessionCanManageSites,
  sitesInMerchantSubtree,
} from "./org";
import {
  fetchRegisteredEmailIndex,
  ownerOnboardEmailConflict,
  REGISTERED_EMAIL_API_MESSAGE,
} from "../shared/registeredEmails";
import type { OrgRef, RegisteredEmailRef } from "../shared/registeredEmails";
import { inviteOwnerOrRollback } from "../shared/onboardOwnerInvite";
import { onboardInviteCreds, type OnboardInviteCreds } from "../shared/onboardInviteState";
import { SiteOwnerInvitedModal } from "../shared/SiteOwnerInvitedModal";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Props = {
  session: Session;
  onClose: () => void;
};

export function CreateSiteModal({ session, onClose }: Props) {
  const merchantId = useMemo(() => parentMerchantOrgId(session), [session]);
  const homeOrgId = useMemo(() => primaryMerchantOrgId(session), [session]);
  const navigate = useNavigate();
  const nameRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [parentId, setParentId] = useState<string>("");
  const [orgs, setOrgs] = useState<OrgAccount[]>([]);
  const [registeredEmails, setRegisteredEmails] = useState<
    Map<string, RegisteredEmailRef>
  >(() => new Map());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [invitedSite, setInvitedSite] = useState<{
    id: string;
    name: string;
    creds: OnboardInviteCreds;
  } | null>(null);

  const parentOptions = useMemo(() => {
    if (!merchantId) return [];
    const merchant = orgs.find((o) => o.id === merchantId);
    const sites = sitesInMerchantSubtree(orgs, merchantId) as OrgAccount[];
    const options: { id: string; label: string }[] = [];
    if (merchant) {
      options.push({ id: merchant.id, label: `${merchant.name} (merchant)` });
    }
    for (const site of sites) {
      options.push({ id: site.id, label: site.name });
    }
    return options;
  }, [orgs, merchantId]);

  const requestClose = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !invitedSite) requestClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [requestClose, invitedSite]);

  useEffect(() => {
    getMerchantOrgs()
      .then((list) => {
        setOrgs(list);
        const requested = new URLSearchParams(window.location.search).get("parentId");
        const requestedParent =
          requested &&
          (requested === merchantId ||
            (merchantId != null &&
              sitesInMerchantSubtree(list, merchantId).some((s) => s.id === requested)))
            ? requested
            : null;
        const defaultParent =
          requestedParent ??
          (homeOrgId &&
          list.some(
            (o) =>
              o.id === homeOrgId &&
              (o.type === "merchant" || o.type === "merchant_site"),
          )
            ? homeOrgId
            : merchantId ?? "");
        setParentId((prev) => prev || defaultParent || "");
      })
      .catch(() => setOrgs([]));
  }, [merchantId, homeOrgId]);

  useEffect(() => {
    if (orgs.length === 0) {
      setRegisteredEmails(new Map());
      return;
    }
    let cancelled = false;
    void fetchRegisteredEmailIndex(
      orgs as OrgRef[],
      listOrgMemberEmails,
    ).then((index) => {
      if (!cancelled) setRegisteredEmails(index);
    });
    return () => {
      cancelled = true;
    };
  }, [orgs]);

  function validateOwnerEmail(index = registeredEmails): string | null {
    const email = ownerEmail.trim();
    if (!email) return "Site owner email is required.";
    if (!EMAIL_PATTERN.test(email)) return "Enter a valid email address.";
    return ownerOnboardEmailConflict(email, index);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!parentId) return;
    if (!sessionCanManageSites(session)) {
      setError("Owner or Administrator required to create sites");
      return;
    }
    const ownerConflict = validateOwnerEmail();
    if (ownerConflict) {
      setError(ownerConflict);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const freshIndex = await fetchRegisteredEmailIndex(
        orgs as OrgRef[],
        listOrgMemberEmails,
      );
      setRegisteredEmails(freshIndex);
      const freshConflict = validateOwnerEmail(freshIndex);
      if (freshConflict) {
        setError(freshConflict);
        return;
      }

      const site = await createOrg({
        type: "merchant_site",
        name: name.trim(),
        parentId,
      });
      const invitedEmail = ownerEmail.trim();
      try {
        const invite = await inviteOwnerOrRollback(site.id, invitedEmail);
        await refreshMerchantOrgList().catch(() => undefined);
        setInvitedSite({
          id: site.id,
          name: site.name,
          creds: onboardInviteCreds(invitedEmail, invite),
        });
      } catch (inviteErr) {
        await refreshMerchantOrgList().catch(() => undefined);
        if (inviteErr instanceof ApiError && inviteErr.code === "email_taken") {
          setError(REGISTERED_EMAIL_API_MESSAGE);
          return;
        }
        const msg = inviteErr instanceof ApiError ? inviteErr.message : "Invite failed";
        setError(`Site was not created because the owner invite failed: ${msg}`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create site");
    } finally {
      setBusy(false);
    }
  }

  if (invitedSite) {
    return (
      <SiteOwnerInvitedModal
        siteName={invitedSite.name}
        creds={invitedSite.creds}
        onDone={() => {
          onClose();
          navigate(merchantRoute(`sites/${invitedSite.id}`));
        }}
      />
    );
  }

  return createPortal(
    <>
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />
      <div
        className="b3-commission-modal-backdrop create-site-modal-backdrop"
        role="presentation"
        onClick={requestClose}
      >
        <div
          className="b3-commission-modal create-site-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-site-modal-title"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="org-edit__head">
            <span className="org-edit__head-icon" aria-hidden>
              <SiteMarkIcon />
            </span>
            <div className="org-edit__head-copy">
              <h3 id="create-site-modal-title">Add site</h3>
              <p>
                A new location under the merchant or another site. A child site is
                still a site.
              </p>
            </div>
            <OrgEditWaves />
            <button
              type="button"
              className="org-edit__close"
              aria-label="Close"
              disabled={busy}
              onClick={requestClose}
            >
              <CloseIcon />
            </button>
          </header>

          <form className="create-site-modal__form" onSubmit={onSubmit}>
            <div className="create-site-modal__body">
              <div className="create-site-modal__field">
                <span className="create-site-modal__label">Parent</span>
                <FieldControl leading={<ParentIcon />}>
                  <SearchableSelect
                    id="create-site-parent"
                    value={parentId}
                    options={parentOptions}
                    onChange={setParentId}
                    allowEmpty={false}
                    placeholder={parentOptions.length === 0 ? "Loading…" : "Select parent"}
                    ariaLabel="Parent"
                    disabled={busy || parentOptions.length === 0}
                  />
                </FieldControl>
              </div>

              <label className="create-site-modal__field">
                <span className="create-site-modal__label">Site name</span>
                <FieldControl icon="tag">
                  <input
                    ref={nameRef}
                    className="field-control"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Downtown branch"
                    disabled={busy}
                    autoComplete="off"
                    maxLength={120}
                  />
                </FieldControl>
              </label>

              <label className="create-site-modal__field">
                <span className="create-site-modal__label">Site owner</span>
                <FieldControl icon="mail">
                  <input
                    className="field-control"
                    type="email"
                    required
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    placeholder="name@company.com"
                    disabled={busy}
                    autoComplete="off"
                  />
                </FieldControl>
              </label>

              <div className="create-site-modal__note" role="note">
                <span className="create-site-modal__note-icon" aria-hidden>
                  <InfoIcon />
                </span>
                <p>
                  Sites manage invoices and cashiers only. Wallet, matching,
                  fulfillment, and retention inherit from the parent merchant.
                  The owner gets an email invite.
                </p>
              </div>
            </div>

            <footer className="org-edit__foot create-site-modal__foot">
              <button
                type="button"
                className="org-edit__cancel"
                disabled={busy}
                onClick={requestClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="org-edit__save"
                disabled={busy || !name.trim() || !ownerEmail.trim() || !parentId}
              >
                <PlusIcon />
                {busy ? "Creating…" : "Create site"}
              </button>
            </footer>
          </form>
        </div>
      </div>
    </>,
    document.body,
  );
}

function SiteMarkIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 10.5 5.4 5.6A1.5 1.5 0 0 1 6.8 4.5h10.4a1.5 1.5 0 0 1 1.4 1.1L20 10.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M4 10.5c0 1.4 1.1 2.5 2.7 2.5s2.6-1.1 2.6-2.5c0 1.4 1.1 2.5 2.7 2.5s2.7-1.1 2.7-2.5c0 1.4 1 2.5 2.6 2.5S20 11.9 20 10.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M5.5 13v5.5A1.5 1.5 0 0 0 7 20h10a1.5 1.5 0 0 0 1.5-1.5V13M10 20v-4h4v4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ParentIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="9" y="3.5" width="6" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.7" />
      <rect x="3.5" y="15.5" width="6" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.7" />
      <rect x="14.5" y="15.5" width="6" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M12 8.5v3.5M6.5 15.5V13a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v2.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 11v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="7.9" r="1.05" fill="currentColor" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
    </svg>
  );
}
