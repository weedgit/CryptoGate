import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
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
import { primaryAgentOrgId, sessionCanManageTeam, sessionCanOnboardMerchant } from "./org";
import {
  fetchRegisteredEmailIndex,
  validatePlatformInviteEmail,
  inviteEmailErrorMessage,
} from "../shared/registeredEmails";
import type { OrgRef, RegisteredEmailRef } from "../shared/registeredEmails";

type Props = { session: Session };

const INVITE_ROLES = ["administrator", "viewer"] as const;

function roleLabel(role: string): string {
  if (role === "owner") return "Owner";
  if (role === "administrator") return "Administrator";
  if (role === "viewer") return "Viewer";
  return role;
}

/** C11 — Agent team settings. */
export function TeamSettingsPage({ session }: Props) {
  const orgId = useMemo(() => primaryAgentOrgId(session), [session]);
  const canManage = useMemo(() => sessionCanManageTeam(session), [session]);
  const canOnboard = useMemo(() => sessionCanOnboardMerchant(session), [session]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [inviteCreds, setInviteCreds] = useState<
    (InviteOrgUserResult & { invitedEmail: string }) | null
  >(null);
  const [orgs, setOrgs] = useState<OrgRef[]>([]);
  const [registeredEmails, setRegisteredEmails] = useState<
    Map<string, RegisteredEmailRef>
  >(() => new Map());

  const load = useCallback(async () => {
    if (!orgId) {
      setError("No agent org on this session");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setMembers(await listOrgUsers(orgId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load team");
    } finally {
      setLoading(false);
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
    void load();
  }, [load]);

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    if (!orgId || !canManage) return;
    setBusy(true);
    setMsg(null);
    setError(null);
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
        setError(validationErr);
        return;
      }
      const m = await inviteOrgUser(orgId, {
        email: invitedEmail,
        role: inviteRole,
      });
      setMsg(`Added ${invitedEmail} as ${roleLabel(inviteRole)}.`);
      setInviteCreds({ ...m, invitedEmail });
      setInviteEmail("");
      await load();
    } catch (err) {
      setError(inviteEmailErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onSetStatus(userId: string, status: "active" | "paused") {
    if (!orgId || !canManage) return;
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      await setOrgUserStatus(orgId, userId, status);
      setMsg(status === "paused" ? "Member paused." : "Member resumed.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Status update failed");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(userId: string, email: string) {
    if (!orgId || !canManage) return;
    if (!window.confirm(`Remove ${email} from this agent org?`)) return;
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      await removeOrgUser(orgId, userId);
      setMsg(`Removed ${email}.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dash-page">
      <div className="orders-toolbar">
        <p className="dash-welcome">Agent Owner / Administrator / Viewer memberships</p>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {msg ? <p className="ok-msg">{msg}</p> : null}

      <div className="panel">
        <h2>Members</h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : members.length === 0 ? (
          <p className="muted">No members returned.</p>
        ) : (
          <div className="orders-table">
            <div
              className="orders-head"
              style={{ gridTemplateColumns: "1.4fr 1fr 0.8fr 1.4fr" }}
            >
              <span>EMAIL</span>
              <span>ROLE</span>
              <span>STATUS</span>
              <span>ACTIONS</span>
            </div>
            {members.map((m) => {
              const isSelf = m.userId === session.userId;
              const status = m.status ?? "active";
              return (
                <div
                  key={`${m.userId}-${m.orgId}`}
                  className="orders-row"
                  style={{
                    gridTemplateColumns: "1.4fr 1fr 0.8fr 1.4fr",
                    cursor: "default",
                  }}
                >
                  <span>{m.email}</span>
                  <span>{roleLabel(m.role)}</span>
                  <span>{status === "paused" ? "Paused" : "Active"}</span>
                  <span>
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
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {canManage ? (
        <form className="panel panel-form" onSubmit={onInvite}>
          <h2>Add teammate</h2>
          <div className="field-row">
            <div className="field">
              <label htmlFor="agent-invite-email">EMAIL</label>
              <input
                id="agent-invite-email"
                className="field-control"
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="field">
              <label htmlFor="agent-invite-role">ROLE</label>
              <select
                id="agent-invite-role"
                className="field-control"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                disabled={busy}
              >
                {INVITE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button className="btn-primary" type="submit" disabled={busy || !inviteEmail.trim()}>
            {busy ? "Working…" : "Add member"}
          </button>
          {inviteCreds ? (
            <InviteCredentialsPanel
              email={inviteCreds.invitedEmail}
              temporaryPassword={inviteCreds.temporaryPassword}
              inviteUrl={inviteCreds.inviteUrl}
              invitePath={inviteCreds.invitePath}
              emailDeliveryStatus={inviteCreds.emailDelivery?.status}
            />
          ) : null}
        </form>
      ) : (
        <div className="panel">
          <p className="muted" style={{ margin: 0 }}>
            {canOnboard
              ? "Only the Agent Owner can add, pause, resume, or remove teammates."
              : "Viewer accounts cannot manage teammates."}
          </p>
        </div>
      )}
    </div>
  );
}
