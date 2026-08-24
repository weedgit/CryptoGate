import { FormEvent, useMemo, useState } from "react";
import {
  ApiError,
  assignOrgUserRole,
  inviteOrgUser,
  type Session,
} from "./api";
import {
  primaryMerchantOrgId,
  roleLabel,
  sessionCanManageTeam,
  sessionRoleOnOrg,
} from "./org";

const INVITE_ROLES = ["administrator", "viewer", "cashier"] as const;

type Props = { session: Session };

export function TeamSettingsPage({ session }: Props) {
  const orgId = useMemo(() => primaryMerchantOrgId(session), [session]);
  const canManage = useMemo(
    () => (orgId ? sessionCanManageTeam(session, orgId) : false),
    [session, orgId],
  );
  const myRole = useMemo(
    () => (orgId ? sessionRoleOnOrg(session, orgId) : null),
    [session, orgId],
  );

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("cashier");
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const [inviteErr, setInviteErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [roleUserId, setRoleUserId] = useState("");
  const [roleNext, setRoleNext] = useState("viewer");
  const [roleMsg, setRoleMsg] = useState<string | null>(null);
  const [roleErr, setRoleErr] = useState<string | null>(null);

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    if (!orgId || !canManage) return;
    setBusy(true);
    setInviteMsg(null);
    setInviteErr(null);
    try {
      const m = await inviteOrgUser(orgId, { email: inviteEmail.trim(), role: inviteRole });
      setInviteMsg(`Invited ${inviteEmail.trim()} as ${roleLabel(m.role)} (${m.userId}).`);
      setInviteEmail("");
    } catch (err) {
      setInviteErr(err instanceof ApiError ? err.message : "Invite failed");
    } finally {
      setBusy(false);
    }
  }

  async function onRoleChange(e: FormEvent) {
    e.preventDefault();
    if (!orgId || !canManage) return;
    setBusy(true);
    setRoleMsg(null);
    setRoleErr(null);
    try {
      const m = await assignOrgUserRole(orgId, roleUserId.trim(), roleNext);
      setRoleMsg(`Updated ${m.userId} to ${roleLabel(m.role)}.`);
      setRoleUserId("");
    } catch (err) {
      setRoleErr(err instanceof ApiError ? err.message : "Role change failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-page">
      <div className="settings-header">
        <p className="muted" style={{ margin: 0 }}>
          Team members for this merchant org. Only the Owner may invite or change roles.
        </p>
      </div>

      {!canManage && myRole === "administrator" ? (
        <div className="alert-card tone-anomaly">
          <strong>OWNER ONLY</strong>
          <p>Only the Owner manages team members. Administrators can view this page.</p>
        </div>
      ) : null}

      <div className="panel settings-panel">
        <h2>Members</h2>
        <p className="muted settings-note">
          GET /orgs/&#123;id&#125;/users is not on the API yet — member list will appear
          here when Andrew lands M1-15 list. Use invite below to add members; use user
          ID from audit or invite response to change roles.
        </p>
        <div className="settings-field">
          <span className="settings-label">Your role</span>
          <span>{myRole ? roleLabel(myRole) : "—"}</span>
        </div>
      </div>

      {canManage ? (
        <>
          <form className="panel settings-panel" onSubmit={onInvite}>
            <h2>Invite member</h2>
            <label className="settings-filter">
              <span>Email</span>
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                autoComplete="off"
              />
            </label>
            <label className="settings-filter">
              <span>Role</span>
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                {INVITE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ))}
              </select>
            </label>
            {inviteErr ? <p className="error">{inviteErr}</p> : null}
            {inviteMsg ? <p className="muted">{inviteMsg}</p> : null}
            <button type="submit" className="btn-primary" disabled={busy}>
              Send invite
            </button>
          </form>

          <form className="panel settings-panel" onSubmit={onRoleChange}>
            <h2>Change role</h2>
            <label className="settings-filter">
              <span>User ID</span>
              <input
                required
                value={roleUserId}
                onChange={(e) => setRoleUserId(e.target.value)}
                placeholder="UUID from invite response"
                autoComplete="off"
              />
            </label>
            <label className="settings-filter">
              <span>New role</span>
              <select value={roleNext} onChange={(e) => setRoleNext(e.target.value)}>
                {INVITE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ))}
              </select>
            </label>
            {roleErr ? <p className="error">{roleErr}</p> : null}
            {roleMsg ? <p className="muted">{roleMsg}</p> : null}
            <button type="submit" className="btn-ghost" disabled={busy}>
              Update role
            </button>
          </form>
        </>
      ) : null}
    </div>
  );
}
