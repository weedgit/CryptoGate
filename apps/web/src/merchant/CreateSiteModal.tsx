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
import {
  ApiError,
  createOrg,
  inviteOrgUser,
  listOrgMemberEmails,
  type Session,
} from "./api";
import { getMerchantOrgs, invalidateMerchantOrgList } from "./merchantOrgList";
import { parentMerchantOrgId, sessionCanManageSites } from "./org";
import {
  fetchRegisteredEmailIndex,
  registeredEmailConflict,
  REGISTERED_EMAIL_API_MESSAGE,
} from "../shared/registeredEmails";
import type { OrgRef, RegisteredEmailRef } from "../shared/registeredEmails";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Props = {
  session: Session;
  onClose: () => void;
};

export function CreateSiteModal({ session, onClose }: Props) {
  const parentId = useMemo(() => parentMerchantOrgId(session), [session]);
  const navigate = useNavigate();
  const nameRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [orgs, setOrgs] = useState<OrgRef[]>([]);
  const [registeredEmails, setRegisteredEmails] = useState<
    Map<string, RegisteredEmailRef>
  >(() => new Map());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      if (e.key === "Escape") requestClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [requestClose]);

  useEffect(() => {
    getMerchantOrgs()
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

  function validateOwnerEmail(index = registeredEmails): string | null {
    const email = ownerEmail.trim();
    if (!email) return null;
    if (!EMAIL_PATTERN.test(email)) return "Enter a valid email address.";
    return registeredEmailConflict(email, index);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!parentId) return;
    const ownerConflict = validateOwnerEmail();
    if (ownerConflict) {
      setError(ownerConflict);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const freshIndex = await fetchRegisteredEmailIndex(orgs, listOrgMemberEmails);
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
      invalidateMerchantOrgList();
      if (ownerEmail.trim()) {
        try {
          await inviteOrgUser(site.id, { email: ownerEmail.trim(), role: "owner" });
        } catch (inviteErr) {
          const msg =
            inviteErr instanceof ApiError && inviteErr.code === "email_taken"
              ? REGISTERED_EMAIL_API_MESSAGE
              : inviteErr instanceof ApiError
                ? inviteErr.message
                : "Invite failed";
          setError(`Site created, but owner invite failed: ${msg}`);
          onClose();
          navigate(merchantRoute(`sites/${site.id}`));
          return;
        }
      }
      onClose();
      navigate(merchantRoute(`sites/${site.id}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create site");
    } finally {
      setBusy(false);
    }
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
          <header className="b3-commission-modal__head create-site-modal__head">
            <div className="create-site-modal__titles">
              <h3 id="create-site-modal-title">Add merchant site</h3>
              <p>New location under your multi-location parent</p>
            </div>
            <button
              type="button"
              className="b3-commission-modal__close"
              aria-label="Close"
              disabled={busy}
              onClick={requestClose}
            >
              ×
            </button>
          </header>

          <form className="create-site-modal__form" onSubmit={onSubmit}>
            <div className="b3-commission-modal__body create-site-modal__body">
              <label className="b3-commission-modal__field">
                <span className="b3-commission-modal__label">Site name</span>
                <div className="b3-commission-modal__input-wrap">
                  <input
                    ref={nameRef}
                    className="b3-commission-modal__input"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Downtown branch"
                    disabled={busy}
                    autoComplete="off"
                  />
                </div>
              </label>

              <label className="b3-commission-modal__field">
                <span className="b3-commission-modal__label">
                  Invite site owner
                  <span className="create-site-modal__optional">Optional</span>
                </span>
                <div className="b3-commission-modal__input-wrap">
                  <input
                    className="b3-commission-modal__input"
                    type="email"
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    placeholder="name@company.com"
                    disabled={busy}
                    autoComplete="off"
                  />
                </div>
              </label>

              <p className="b3-commission-modal__hint create-site-modal__hint">
                Wallet, xPub, matching mode, and retention inherit from the parent
                until the parent merchant Owner approves a site override.
              </p>
            </div>

            <footer className="b3-commission-modal__foot">
              <button
                type="button"
                className="b3-commission-modal__cancel"
                disabled={busy}
                onClick={requestClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="b3-commission-modal__save"
                disabled={busy || !name.trim()}
              >
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
