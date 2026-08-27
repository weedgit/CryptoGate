import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ApiError,
  createOrg,
  inviteOrgUser,
  listOrgMemberEmails,
  listOrgs,
  type Session,
} from "./api";
import { parentMerchantOrgId, sessionCanManageSites } from "./org";
import {
  fetchRegisteredEmailIndex,
  registeredEmailConflict,
  REGISTERED_EMAIL_API_MESSAGE,
} from "../shared/registeredEmails";
import type { OrgRef, RegisteredEmailRef } from "../shared/registeredEmails";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Props = { session: Session };

export function CreateSitePage({ session }: Props) {
  const parentId = useMemo(() => parentMerchantOrgId(session), [session]);
  const canManage = useMemo(() => sessionCanManageSites(session), [session]);
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [orgs, setOrgs] = useState<OrgRef[]>([]);
  const [registeredEmails, setRegisteredEmails] = useState<
    Map<string, RegisteredEmailRef>
  >(() => new Map());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  function validateOwnerEmail(index = registeredEmails): string | null {
    const email = ownerEmail.trim();
    if (!email) return null;
    if (!EMAIL_PATTERN.test(email)) return "Enter a valid email address.";
    return registeredEmailConflict(email, index);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!parentId || !canManage) return;
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
          navigate(`/merchant/sites/${site.id}`);
          return;
        }
      }
      navigate(`/merchant/sites/${site.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create site");
    } finally {
      setBusy(false);
    }
  }

  if (!canManage) {
    return (
      <div className="panel">
        <h2>Not allowed</h2>
        <p className="muted">Only Owner or Administrator can create merchant sites.</p>
      </div>
    );
  }

  return (
    <div className="sites-page">
      <div className="orders-toolbar">
        <p className="muted" style={{ margin: 0 }}>
          New merchant (site) under your multi-location parent.
        </p>
        <Link className="btn-ghost btn-inline" to="/merchant/sites">
          Back to sites
        </Link>
      </div>

      <form className="panel settings-panel" onSubmit={onSubmit}>
        <h2>Site details</h2>
        <label className="settings-filter">
          <span>Site name</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Downtown branch"
          />
        </label>
        <label className="settings-filter">
          <span>Invite site Owner (optional)</span>
          <input
            type="email"
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
            placeholder="Name@company.com"
            autoComplete="off"
          />
        </label>
        <p className="muted settings-note">
          Wallet, xPub, matching mode, and retention inherit from the parent until
          the parent merchant Owner approves a site override.
        </p>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit" className="btn-primary" disabled={busy}>
          Create site
        </button>
      </form>
    </div>
  );
}
