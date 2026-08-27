import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  assignOrgUserRole,
  inviteOrgUser,
  listOrgMemberEmails,
  listOrgUsers,
  listOrgs,
  removeOrgUser,
  setOrgUserStatus,
  type InviteOrgUserResult,
  type OrgMember,
  type Session,
} from "./api";
import { InviteCredentialsPanel } from "../auth/InviteCredentialsPanel";
import {
  primaryMerchantOrgId,
  roleLabel,
  sessionCanManageTeam,
  sessionRoleOnOrg,
} from "./org";
import {
  fetchRegisteredEmailIndex,
  validatePlatformInviteEmail,
  inviteEmailErrorMessage,
} from "../shared/registeredEmails";
import type { OrgRef, RegisteredEmailRef } from "../shared/registeredEmails";

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

  const [members, setMembers] = useState<OrgMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersErr, setMembersErr] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("cashier");
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const [inviteErr, setInviteErr] = useState<string | null>(null);
  const [inviteCreds, setInviteCreds] = useState<
    (InviteOrgUserResult & { invitedEmail: string }) | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<OrgRef[]>([]);
  const [registeredEmails, setRegisteredEmails] = useState<
    Map<string, RegisteredEmailRef>
  >(() => new Map());

  const loadMembers = useCallback(async () => {
    if (!orgId) return;
    setMembersLoading(true);
    setMembersErr(null);
    try {
      setMembers(await listOrgUsers(orgId));
    } catch (err) {
      setMembersErr(err instanceof ApiError ? err.message : "Failed to load members");
    } finally {
      setMembersLoading(false);
    }
  }, [orgId]);

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

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    if (!orgId || !canManage) return;
    setBusy(true);
    setInviteMsg(null);
    setInviteErr(null);
    setInviteCreds(null);
    try {
      const invitedEmail = inviteEmail.trim();
      const freshIndex = await fetchRegisteredEmailIndex(orgs, listOrgMemberEmails);
      setRegisteredEmails(freshIndex);
      const validationErr = validatePlatformInviteEmail(invitedEmail, freshIndex, {
        targetOrgId: orgId,
        members,
      });
      if (validationErr) {
        setInviteErr(validationErr);
        return;
      }
      const m = await inviteOrgUser(orgId, {
        email: invitedEmail,
        role: inviteRole,
      });
      setInviteMsg(`Added ${invitedEmail} as ${roleLabel(m.role)}.`);
      setInviteCreds({ ...m, invitedEmail });
      setInviteEmail("");
      await loadMembers();
    } catch (err) {
      setInviteErr(inviteEmailErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onRoleChange(userId: string, role: string) {
    if (!orgId || !canManage) return;
    setBusy(true);
    setActionMsg(null);
    setActionErr(null);
    try {
      const m = await assignOrgUserRole(orgId, userId, role);
      setActionMsg(`Updated member to ${roleLabel(m.role)}.`);
      await loadMembers();
    } catch (err) {
      setActionErr(err instanceof ApiError ? err.message : "Role change failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSetStatus(userId: string, status: "active" | "paused") {
    if (!orgId || !canManage) return;
    setBusy(true);
    setActionMsg(null);
    setActionErr(null);
    try {
      await setOrgUserStatus(orgId, userId, status);
      setActionMsg(status === "paused" ? "Member paused." : "Member resumed.");
      await loadMembers();
    } catch (err) {
      setActionErr(err instanceof ApiError ? err.message : "Status update failed");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(userId: string, email: string) {
    if (!orgId || !canManage) return;
    if (!window.confirm(`Remove ${email} from this org?`)) return;
    setBusy(true);
    setActionMsg(null);
    setActionErr(null);
    try {
      await removeOrgUser(orgId, userId);
      setActionMsg(`Removed ${email}.`);
      await loadMembers();
    } catch (err) {
      setActionErr(err instanceof ApiError ? err.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-page">
      <div className="settings-header">
        <p className="muted" style={{ margin: 0 }}>
          Team members for this merchant org. Only the Owner may add, pause, resume, or
          remove members.
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
        {membersLoading ? (
          <p className="muted">Loading members…</p>
        ) : membersErr ? (
          <p className="error">{membersErr}</p>
        ) : members.length === 0 ? (
          <p className="muted">No members yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const isSelf = m.userId === session.userId;
                const status = m.status ?? "active";
                return (
                  <tr key={m.userId}>
                    <td>{m.email}</td>
                    <td>
                      {canManage && m.role !== "owner" && status === "active" ? (
                        <select
                          className="field-control"
                          value={m.role}
                          disabled={busy}
                          aria-label={`Change role for ${m.email}`}
                          onChange={(e) => void onRoleChange(m.userId, e.target.value)}
                        >
                          {INVITE_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {roleLabel(r)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        roleLabel(m.role)
                      )}
                    </td>
                    <td>{status === "paused" ? "Paused" : "Active"}</td>
                    <td>
                      {canManage && !isSelf ? (
                        <span style={{ display: "inline-flex", gap: 8, flexWrap: "wrap" }}>
                          {status === "active" ? (
                            <button
                              type="button"
                              className="btn-ghost btn-inline"
                              disabled={busy}
                              onClick={() => void onSetStatus(m.userId, "paused")}
                            >
                              Pause
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn-ghost btn-inline"
                              disabled={busy}
                              onClick={() => void onSetStatus(m.userId, "active")}
                            >
                              Resume
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn-ghost btn-inline"
                            disabled={busy}
                            onClick={() => void onRemove(m.userId, m.email)}
                          >
                            Delete
                          </button>
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {actionErr ? <p className="error">{actionErr}</p> : null}
        {actionMsg ? <p className="ok-msg">{actionMsg}</p> : null}
        <div className="settings-field" style={{ marginTop: 16 }}>
          <span className="settings-label">Your role</span>
          <span>{myRole ? roleLabel(myRole) : "—"}</span>
        </div>
      </div>

      {canManage ? (
        <form className="panel settings-panel" onSubmit={onInvite}>
          <h2>Add member</h2>
          <label className="settings-filter">
            <span>Email</span>
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              autoComplete="off"
              placeholder="Name@company.com"
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
          {inviteMsg ? <p className="ok-msg">{inviteMsg}</p> : null}
          {inviteCreds ? (
            <InviteCredentialsPanel
              email={inviteCreds.invitedEmail}
              temporaryPassword={inviteCreds.temporaryPassword}
              inviteUrl={inviteCreds.inviteUrl}
              invitePath={inviteCreds.invitePath}
              emailDeliveryStatus={inviteCreds.emailDelivery?.status}
            />
          ) : null}
          <button type="submit" className="btn-primary" disabled={busy}>
            Add member
          </button>
        </form>
      ) : null}
    </div>
  );
}
