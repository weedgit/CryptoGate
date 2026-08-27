import { FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ApiError,
  assignOrgUserRole,
  inviteOrgUser,
  getPlatformOrgs,
  listOrgMemberEmails,
  listOrgUsers,
  removeOrgUser,
  setOrgUserStatus,
  type InviteOrgUserResult,
  type OrgMember,
  type Session,
} from "./api";
import { InviteCredentialsPanel } from "../auth/InviteCredentialsPanel";
import { AuthToast } from "../auth/AuthToast";
import { sessionIsPlatformOwner } from "./org";
import { PlatformPending } from "./ui/PlatformPending";
import {
  fetchRegisteredEmailIndex,
  validatePlatformInviteEmail,
  inviteEmailErrorMessage,
} from "../shared/registeredEmails";
import type { OrgRef } from "../shared/registeredEmails";

type Props = { session: Session };

const INVITE_ROLES = ["administrator", "viewer"] as const;

function roleLabel(role: string): string {
  if (role === "owner") return "Owner";
  if (role === "administrator") return "Admin";
  if (role === "viewer") return "Viewer";
  return role;
}

function roleBadgeText(role: string): string {
  if (role === "owner") return "OWNER";
  if (role === "administrator") return "ADMIN";
  if (role === "viewer") return "VIEWER";
  return role.toUpperCase();
}

function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0]?.trim() ?? "";
  if (!local) return email;
  return local
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatRelativeLogin(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return d.toLocaleString();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days} day${days === 1 ? "" : "s"} ago`;
  return d.toLocaleDateString();
}

type RemoveTarget = { userId: string; email: string };

/** B15 — Platform team (Figma `b15-platform-team`). */
export function PlatformTeamPage({ session }: Props) {
  const canManage = useMemo(() => sessionIsPlatformOwner(session), [session]);
  const platformOrgId = useMemo(
    () => session.memberships.find((m) => m.orgType === "platform")?.orgId ?? null,
    [session],
  );

  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("administrator");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "ok" | "error" } | null>(
    null,
  );
  const [inviteCreds, setInviteCreds] = useState<
    (InviteOrgUserResult & { invitedEmail: string }) | null
  >(null);
  const [resolvedOrgId, setResolvedOrgId] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<OrgRef[]>([]);
  const [removeTarget, setRemoveTarget] = useState<RemoveTarget | null>(null);
  const [topbarActionsSlot, setTopbarActionsSlot] = useState<HTMLElement | null>(null);

  const dismissToast = useCallback(() => setToast(null), []);
  const showOk = useCallback((message: string) => {
    setToast({ message, tone: "ok" });
  }, []);
  const showErr = useCallback((message: string) => {
    setToast({ message, tone: "error" });
  }, []);

  useLayoutEffect(() => {
    setTopbarActionsSlot(document.getElementById("platform-topbar-actions"));
  }, []);

  const load = useCallback(async () => {
    if (!platformOrgId) {
      setError("No platform org on this session");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let orgId = platformOrgId;
      try {
        const nextOrgs = await getPlatformOrgs();
        setOrgs(nextOrgs);
        const platform = nextOrgs.find((o) => o.type === "platform");
        if (platform) orgId = platform.id;
      } catch {
        /* keep session org */
      }
      setResolvedOrgId(orgId);
      setMembers(await listOrgUsers(orgId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load team");
    } finally {
      setLoading(false);
    }
  }, [platformOrgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const orgId = resolvedOrgId ?? platformOrgId;

  const sortedMembers = useMemo(() => {
    const rank = (role: string) =>
      role === "owner" ? 0 : role === "administrator" ? 1 : 2;
    return [...members].sort((a, b) => {
      const byRole = rank(a.role) - rank(b.role);
      if (byRole !== 0) return byRole;
      return a.email.localeCompare(b.email);
    });
  }, [members]);

  function openInvite() {
    setInviteCreds(null);
    setInviteEmail("");
    setInviteRole("administrator");
    setInviteOpen(true);
  }

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    if (!orgId || !canManage) return;
    setBusy(true);
    setInviteCreds(null);
    try {
      const invitedEmail = inviteEmail.trim();
      const freshIndex = await fetchRegisteredEmailIndex(orgs, listOrgMemberEmails);
      const validationErr = validatePlatformInviteEmail(invitedEmail, freshIndex, {
        targetOrgId: orgId,
        members,
      });
      if (validationErr) {
        showErr(validationErr);
        return;
      }
      const m = await inviteOrgUser(orgId, {
        email: invitedEmail,
        role: inviteRole,
      });
      showOk(`Added ${invitedEmail} as ${roleLabel(m.role)}.`);
      setInviteCreds({ ...m, invitedEmail });
      setInviteEmail("");
      await load();
    } catch (err) {
      showErr(inviteEmailErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onRoleChange(userId: string, role: string) {
    if (!orgId || !canManage) return;
    setBusy(true);
    try {
      await assignOrgUserRole(orgId, userId, role);
      showOk(`Updated role to ${roleLabel(role)}.`);
      await load();
    } catch (err) {
      showErr(err instanceof ApiError ? err.message : "Role update failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSetStatus(userId: string, status: "active" | "paused") {
    if (!orgId || !canManage) return;
    setBusy(true);
    try {
      await setOrgUserStatus(orgId, userId, status);
      showOk(status === "paused" ? "Member paused." : "Member resumed.");
      await load();
    } catch (err) {
      showErr(err instanceof ApiError ? err.message : "Status update failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirmRemove() {
    if (!orgId || !canManage || !removeTarget) return;
    setBusy(true);
    try {
      await removeOrgUser(orgId, removeTarget.userId);
      showOk(`Removed ${removeTarget.email}.`);
      setRemoveTarget(null);
      await load();
    } catch (err) {
      showErr(err instanceof ApiError ? err.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="plat-team">
      <AuthToast
        message={toast?.message ?? null}
        tone={toast?.tone ?? "ok"}
        onDismiss={dismissToast}
      />

      {canManage && topbarActionsSlot
        ? createPortal(
            <button
              type="button"
              className="btn-primary plat-team__invite-cta"
              onClick={openInvite}
              disabled={busy}
            >
              <span className="plat-team__invite-cta-plus" aria-hidden>
                +
              </span>
              Invite Member
            </button>,
            topbarActionsSlot,
          )
        : null}

      {!canManage ? (
        <div className="plat-team__banner" role="status">
          <span className="plat-team__banner-label">Owner only</span>
          <p>
            Only the Owner can add or remove team members. Administrators and
            Viewers can review the roster below.
          </p>
        </div>
      ) : null}

      {error ? <p className="error">{error}</p> : null}

      <section className="plat-team__card">
        <header className="plat-team__card-head">
          <div>
            <h2>Members</h2>
            <p className="plat-team__card-copy">
              Platform Owner, Administrator, and Viewer memberships.
            </p>
          </div>
          {!loading ? (
            <span className="plat-team__count">
              {sortedMembers.length}{" "}
              {sortedMembers.length === 1 ? "member" : "members"}
            </span>
          ) : null}
        </header>

        {loading ? (
          <PlatformPending
            compact
            title="Loading team"
            copy="Fetching platform org members."
          />
        ) : sortedMembers.length === 0 ? (
          <p className="plat-team__empty">No members returned for platform org.</p>
        ) : (
          <div className="plat-team__table-wrap">
            <table className="plat-team__table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>MFA Status</th>
                  <th>Last Login</th>
                  {canManage ? <th>Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {sortedMembers.map((m, index) => {
                  const isSelf = m.userId === session.userId;
                  const status = m.status ?? "active";
                  const paused = status === "paused";
                  const roleTone =
                    m.role === "owner"
                      ? "owner"
                      : m.role === "administrator"
                        ? "admin"
                        : "viewer";
                  return (
                    <tr
                      key={`${m.userId}-${m.orgId}`}
                      style={{
                        animationDelay: `${Math.min(index, 24) * 40}ms`,
                      }}
                    >
                      <td>
                        <div className="plat-team__member">
                          <span className="plat-team__avatar" aria-hidden>
                            {(m.email[0] ?? "?").toUpperCase()}
                          </span>
                          <span className="plat-team__name">
                            {displayNameFromEmail(m.email)}
                            {isSelf ? (
                              <span className="plat-team__you">You</span>
                            ) : null}
                            {paused ? (
                              <span className="plat-team__paused-tag">Paused</span>
                            ) : null}
                          </span>
                        </div>
                      </td>
                      <td className="plat-team__email">{m.email}</td>
                      <td>
                        {canManage && m.role !== "owner" && status === "active" ? (
                          <select
                            className="plat-team__role-select"
                            value={m.role}
                            disabled={busy}
                            aria-label={`Role for ${m.email}`}
                            onChange={(e) =>
                              void onRoleChange(m.userId, e.target.value)
                            }
                          >
                            {INVITE_ROLES.map((r) => (
                              <option key={r} value={r}>
                                {roleLabel(r)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className={`plat-team__role tone-${roleTone}`}>
                            {roleBadgeText(m.role)}
                          </span>
                        )}
                      </td>
                      <td>
                        <span
                          className={`plat-team__mfa${
                            m.mfaEnrolled ? " is-on" : " is-pending"
                          }`}
                        >
                          <span className="plat-team__mfa-dot" aria-hidden />
                          {m.mfaEnrolled ? "MFA ENABLED" : "MFA PENDING"}
                        </span>
                      </td>
                      <td className="plat-team__login">
                        {formatRelativeLogin(m.lastLoginAt)}
                      </td>
                      {canManage ? (
                        <td>
                          {!isSelf ? (
                            <div className="plat-team__actions">
                              {paused ? (
                                <button
                                  type="button"
                                  className="plat-team__action"
                                  disabled={busy}
                                  onClick={() =>
                                    void onSetStatus(m.userId, "active")
                                  }
                                >
                                  Resume
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="plat-team__action"
                                  disabled={busy}
                                  onClick={() =>
                                    void onSetStatus(m.userId, "paused")
                                  }
                                >
                                  Pause
                                </button>
                              )}
                              <button
                                type="button"
                                className="plat-team__action is-danger"
                                disabled={busy}
                                onClick={() =>
                                  setRemoveTarget({
                                    userId: m.userId,
                                    email: m.email,
                                  })
                                }
                              >
                                Remove
                              </button>
                            </div>
                          ) : (
                            <span className="plat-team__actions-empty">—</span>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canManage ? (
        <p className="plat-team__footnote muted">
          Ownership transfer requires MFA and is not enabled in Phase 1 API —
          the Owner remains the sole ownership holder until that flow ships.
        </p>
      ) : null}

      {inviteOpen
        ? createPortal(
            <div
              className="b3-commission-modal-backdrop"
              role="presentation"
              onClick={() => {
                if (!busy) setInviteOpen(false);
              }}
            >
              <div
                className="b3-commission-modal plat-team__invite-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="plat-team-invite-title"
                onClick={(e) => e.stopPropagation()}
              >
                <header className="b3-commission-modal__head">
                  <h3 id="plat-team-invite-title">Invite member</h3>
                  <button
                    type="button"
                    className="b3-commission-modal__close"
                    aria-label="Close"
                    disabled={busy}
                    onClick={() => setInviteOpen(false)}
                  >
                    ×
                  </button>
                </header>
                <form
                  className="b3-commission-modal__body plat-team__invite-form"
                  onSubmit={onInvite}
                  noValidate
                >
                  <p className="plat-team__invite-lead">
                    Administrator or Viewer only — cannot create a second Owner
                    here.
                  </p>
                  <label className="plat-team__field" htmlFor="plat-team-invite-email">
                    <span>Email</span>
                    <input
                      id="plat-team-invite-email"
                      className="plat-team__input"
                      type="email"
                      required
                      autoComplete="off"
                      autoFocus
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      disabled={busy || Boolean(inviteCreds)}
                      placeholder="name@company.com"
                    />
                  </label>
                  <label className="plat-team__field" htmlFor="plat-team-invite-role">
                    <span>Role</span>
                    <select
                      id="plat-team-invite-role"
                      className="plat-team__input plat-team__select"
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      disabled={busy || Boolean(inviteCreds)}
                    >
                      {INVITE_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {roleLabel(r)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {inviteCreds ? (
                    <div className="plat-team__creds">
                      <InviteCredentialsPanel
                        email={inviteCreds.invitedEmail}
                        temporaryPassword={inviteCreds.temporaryPassword}
                        inviteUrl={inviteCreds.inviteUrl}
                        invitePath={inviteCreds.invitePath}
                        emailDeliveryStatus={inviteCreds.emailDelivery?.status}
                      />
                    </div>
                  ) : null}
                  <footer className="b3-commission-modal__foot plat-team__invite-foot">
                    {inviteCreds ? (
                      <button
                        type="button"
                        className="plat-team__invite-confirm"
                        disabled={busy}
                        onClick={() => setInviteOpen(false)}
                      >
                        Done
                      </button>
                    ) : (
                      <button
                        type="submit"
                        className="plat-team__invite-confirm"
                        disabled={busy || !inviteEmail.trim()}
                      >
                        {busy ? "Working…" : "Add member"}
                      </button>
                    )}
                  </footer>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}

      {removeTarget
        ? createPortal(
            <div
              className="b3-commission-modal-backdrop"
              role="presentation"
              onClick={() => {
                if (!busy) setRemoveTarget(null);
              }}
            >
              <div
                className="b3-commission-modal b3-suspend-modal plat-team__remove-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="plat-team-remove-title"
                onClick={(e) => e.stopPropagation()}
              >
                <header className="b3-commission-modal__head">
                  <h3 id="plat-team-remove-title">Remove team member</h3>
                  <button
                    type="button"
                    className="b3-commission-modal__close"
                    aria-label="Close"
                    disabled={busy}
                    onClick={() => setRemoveTarget(null)}
                  >
                    ×
                  </button>
                </header>
                <div className="b3-commission-modal__body">
                  <p className="plat-team__remove-copy">
                    Remove{" "}
                    <strong className="b3-suspend-modal__name">
                      {removeTarget.email}
                    </strong>{" "}
                    from the platform org?
                  </p>
                  <p className="plat-team__remove-warn">
                    They lose portal access immediately. This cannot be undone
                    from this dialog.
                  </p>
                </div>
                <footer className="b3-commission-modal__foot plat-team__remove-foot">
                  <button
                    type="button"
                    className="b3-commission-modal__cancel"
                    disabled={busy}
                    onClick={() => setRemoveTarget(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="plat-team__remove-confirm"
                    disabled={busy}
                    onClick={() => void confirmRemove()}
                  >
                    {busy ? "Removing…" : "Remove"}
                  </button>
                </footer>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
