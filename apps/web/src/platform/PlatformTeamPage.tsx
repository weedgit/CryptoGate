import { formatInZone, formatViewerDateTime } from "../shared/dateTime";
import { useSetupGate } from "../auth/useSetupGate";
import { RemoveMemberModal, type RemoveMemberTarget } from "../shared/RemoveMemberModal";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getOrgUsers, invalidateOrgUsers, mergeOrgMember, orgMemberFromInvite, peekOrgUsers, primeOrgUsers } from "../shared/orgUsersCache";
import {
  ApiError,
  assignOrgUserRole,
  inviteOrgUser,
  listOrgMemberEmails,
  removeOrgUser,
  setOrgUserStatus,
  type InviteOrgUserResult,
  type OrgMember,
  type Session,
} from "./api";
import { getPlatformOrgs, peekPlatformOrgs } from "./platformOrgList";
import { InviteMemberModal } from "../shared/InviteMemberModal";
import { AuthToast } from "../auth/AuthToast";
import { DefaultUserAvatar } from "../auth/DefaultUserAvatar";
import { SearchableSelect } from "../ui/SearchableSelect";
import { sessionIsPlatformOwner } from "./org";
import { PlatformPending } from "./ui/PlatformPending";
import { TeamMemberEditModal } from "./TeamMemberEditModal";
import { RoleBadge } from "../shared/RoleBadge";
import { formatPhoneDisplay } from "../shared/phoneFormat";
import {
  isLoadSeedTeamEmail,
  memberDisplayName,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  TrashIcon,
} from "../shared/teamRosterChrome";
import {
  fetchRegisteredEmailIndex,
  validatePlatformInviteEmail,
  inviteEmailErrorMessage,
} from "../shared/registeredEmails";
import type { OrgRef } from "../shared/registeredEmails";
import { useTeamPortal } from "./teamPortal";
import { usePageRefresh } from "../shared/pageRefresh";

type Props = { session: Session };

const INVITE_ROLES = ["administrator", "viewer"] as const;

function roleLabel(role: string): string {
  if (role === "owner") return "Owner";
  if (role === "administrator") return "Admin";
  if (role === "viewer") return "Viewer";
  return role;
}

const ROLE_OPTIONS = INVITE_ROLES.map((r) => ({
  id: r,
  label: roleLabel(r),
}));

function formatRelativeLogin(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return formatViewerDateTime(iso);
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatInZone(d, { year: "numeric", month: "numeric", day: "numeric" });
}


/** B15 — Platform team (Figma `b15-platform-team`). */
export function PlatformTeamPage({ session }: Props) {
  const portal = useTeamPortal();
  const orgLabel = portal?.orgLabel ?? "platform";
  const peekOrgs = portal?.peekOrgs ?? peekPlatformOrgs;
  const canManage = useMemo(
    () => (portal ? portal.canManage : sessionIsPlatformOwner(session)),
    [portal, session],
  );
  const platformOrgId = useMemo(
    () =>
      portal
        ? portal.orgId
        : (session.memberships.find((m) => m.orgType === "platform")?.orgId ?? null),
    [portal, session],
  );

  const [members, setMembers] = useState<OrgMember[]>(() =>
    platformOrgId ? (peekOrgUsers(platformOrgId) ?? []) : [],
  );
  const [loading, setLoading] = useState(
    () => !(platformOrgId && peekOrgUsers(platformOrgId)),
  );
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
  const [orgs, setOrgs] = useState<OrgRef[]>(() => peekOrgs() ?? []);
  const [removeTarget, setRemoveTarget] = useState<RemoveMemberTarget | null>(null);
  const [editTarget, setEditTarget] = useState<OrgMember | null>(null);

  const dismissToast = useCallback(() => setToast(null), []);
  const showOk = useCallback((message: string) => {
    setToast({ message, tone: "ok" });
  }, []);
  const showErr = useCallback((message: string) => {
    setToast({ message, tone: "error" });
  }, []);
  const requireSetup = useSetupGate(session, showErr);

  const load = useCallback(async (opts?: { force?: boolean }) => {
    if (!platformOrgId) {
      setError(`No ${orgLabel} org on this session`);
      setLoading(false);
      return;
    }
    if (!peekOrgs()) setLoading(true);
    else if (!peekOrgUsers(platformOrgId)) setLoading(true);
    setError(null);
    try {
      let nextOrgId = platformOrgId;
      try {
        const nextOrgs = await (portal ? portal.getOrgs() : getPlatformOrgs());
        setOrgs(nextOrgs);
        const platform = portal ? null : nextOrgs.find((o) => o.type === "platform");
        if (platform) nextOrgId = platform.id;
      } catch {
        /* keep session org */
      }
      setResolvedOrgId(nextOrgId);
      if (opts?.force) invalidateOrgUsers(nextOrgId);
      setMembers(await getOrgUsers(nextOrgId, { force: opts?.force }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load team");
    } finally {
      setLoading(false);
    }
  }, [platformOrgId, portal, peekOrgs, orgLabel]);
  usePageRefresh(() => load({ force: true }));

  useEffect(() => {
    void load();
  }, [load]);

  const orgId = resolvedOrgId ?? platformOrgId;

  const ownerCount = useMemo(
    () => members.filter((m) => m.role === "owner").length,
    [members],
  );

  const sortedMembers = useMemo(() => {
    const rank = (role: string) =>
      role === "owner" ? 0 : role === "administrator" ? 1 : 2;
    return members
      .filter((m) => !isLoadSeedTeamEmail(m.email))
      .sort((a, b) => {
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
        targetOrgType: portal ? portal.orgType : "platform",
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
      setMembers((prev) => {
        const next = mergeOrgMember(prev, orgMemberFromInvite(m, invitedEmail));
        primeOrgUsers(orgId, next);
        return next;
      });
      showOk(`Added ${invitedEmail} as ${roleLabel(m.role)}.`);
      setInviteCreds({ ...m, invitedEmail });
      setInviteEmail("");
      void load({ force: true });
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
      const updated = await assignOrgUserRole(orgId, userId, role);
      setMembers((prev) =>
        prev.map((m) =>
          m.userId === userId
            ? {
                ...m,
                role: updated.role,
                status: updated.status ?? m.status,
              }
            : m,
        ),
      );
      showOk(`Updated role to ${roleLabel(updated.role)}.`);
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
      setMembers((prev) =>
        prev.map((m) => (m.userId === userId ? { ...m, status } : m)),
      );
      showOk(status === "paused" ? "Member paused." : "Member resumed.");
      void load({ force: true });
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
      const removedId = removeTarget.userId;
      setMembers((prev) => {
        const next = prev.filter((m) => m.userId !== removedId);
        primeOrgUsers(orgId, next);
        return next;
      });
      showOk(`Removed ${removeTarget.email}.`);
      setRemoveTarget(null);
      void load({ force: true });
    } catch (err) {
      showErr(err instanceof ApiError ? err.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="plat-team plat-bills">
      <AuthToast
        message={toast?.message ?? error}
        tone={toast?.tone ?? "error"}
        onDismiss={() => {
          dismissToast();
          setError(null);
        }}
      />

      <div className="plat-bills__period-bar">
        <div className="plat-bills__intro">
          <span className="plat-bills__intro-icon" aria-hidden>
            <svg
              viewBox="0 0 24 24"
              width="36"
              height="36"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </span>
          <div className="plat-bills__intro-copy">
            <h1 className="plat-bills__intro-title">Team</h1>
            <p className="plat-bills__intro-sub">
              {portal
                ? "Agent → Owner, Administrator, and Viewer memberships."
                : "Platform → Owner, Administrator, and Viewer memberships."}
            </p>
          </div>
        </div>
        <div className="plat-bills__period-tools">
          {canManage ? (
            <button
              type="button"
              className="btn-primary plat-bills__action-btn plat-team__invite-cta"
              onClick={() => {
                if (portal?.inviteLockedHint == null || requireSetup()) openInvite();
              }}
              disabled={busy}
              title={portal?.inviteLockedHint ?? undefined}
            >
              <span className="plat-team__invite-cta-plus" aria-hidden>
                +
              </span>
              Invite Member
            </button>
          ) : null}
          {portal?.actions}
        </div>
      </div>

      <div className="plat-bills__panel plat-team__panel plat-team__panel--solo">
        <div className="plat-bills__main">
          {loading ? (
            <PlatformPending
              compact
              title="Loading team"
              copy={`Fetching ${orgLabel} org members.`}
            />
          ) : sortedMembers.length === 0 ? (
            <p className="plat-team__empty">
              No members returned for {orgLabel} org.
            </p>
          ) : (
            <>
              <div className="plat-team__table-wrap">
                <table className="plat-team__table plat-team__table--dense">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>Role</th>
                      <th>MFA</th>
                      <th className="plat-team__th-login">Last login</th>
                      {canManage ? (
                        <th className="plat-team__th-actions">Actions</th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedMembers.map((m, index) => {
                      const isSelf = m.userId === session.userId;
                      const status = m.status ?? "active";
                      const paused = status === "paused";
                      const canEditRow = canManage && m.role !== "owner";
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
                                {m.avatarUrl ? (
                                  <img src={m.avatarUrl} alt="" />
                                ) : (
                                  <DefaultUserAvatar className="plat-team__avatar-default" />
                                )}
                              </span>
                              <span className="plat-team__name">
                                {memberDisplayName(m)}
                                {isSelf ? (
                                  <span className="plat-team__you">You</span>
                                ) : null}
                                {paused ? (
                                  <span className="plat-team__paused-tag">
                                    Paused
                                  </span>
                                ) : null}
                              </span>
                            </div>
                          </td>
                          <td className="plat-team__email">{m.email}</td>
                          <td className="plat-team__phone">
                            {m.phone?.trim()
                              ? formatPhoneDisplay(m.phone)
                              : "—"}
                          </td>
                          <td>
                            {canManage &&
                            m.role !== "owner" &&
                            status === "active" ? (
                              <div className="plat-team__role-picker">
                                <SearchableSelect
                                  value={m.role}
                                  options={ROLE_OPTIONS}
                                  onChange={(role) =>
                                    void onRoleChange(m.userId, role)
                                  }
                                  disabled={busy}
                                  allowEmpty={false}
                                  placeholder="Role"
                                  ariaLabel={`Role for ${m.email}`}
                                  menuClassName="b3-team-role-menu"
                                  menuMinWidth={96}
                                />
                              </div>
                            ) : (
                              <RoleBadge role={m.role} />
                            )}
                          </td>
                          <td className="plat-team__td-mfa">
                            <span
                              className={`plat-team__mfa${
                                m.mfaEnrolled ? " is-on" : " is-pending"
                              }`}
                              aria-label={
                                m.mfaEnrolled
                                  ? "Multi-factor authentication enabled"
                                  : "Multi-factor authentication pending"
                              }
                            >
                              <span className="plat-team__mfa-dot" aria-hidden />
                              {m.mfaEnrolled ? "Enabled" : "Pending"}
                            </span>
                          </td>
                          <td className="plat-team__login">
                            {formatRelativeLogin(m.lastLoginAt)}
                          </td>
                          {canManage ? (
                            <td className="plat-team__td-actions">
                              {!isSelf || canEditRow ? (
                                <div className="plat-team__actions">
                                  {canEditRow ? (
                                    <button
                                      type="button"
                                      className="plat-team__action plat-team__action--icon"
                                      aria-label={`Edit ${m.email}`}
                                      disabled={busy}
                                      onClick={() => setEditTarget(m)}
                                    >
                                      <PencilIcon />
                                    </button>
                                  ) : null}
                                  {!isSelf ? (
                                    <>
                                      {paused ? (
                                        <button
                                          type="button"
                                          className="plat-team__action plat-team__action--icon"
                                          aria-label={`Resume ${m.email}`}
                                          title="Resume"
                                          disabled={busy}
                                          onClick={() =>
                                            void onSetStatus(
                                              m.userId,
                                              "active",
                                            )
                                          }
                                        >
                                          <PlayIcon />
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          className="plat-team__action plat-team__action--icon"
                                          aria-label={`Pause ${m.email}`}
                                          title="Pause"
                                          disabled={busy}
                                          onClick={() =>
                                            void onSetStatus(
                                              m.userId,
                                              "paused",
                                            )
                                          }
                                        >
                                          <PauseIcon />
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        className="plat-team__action plat-team__action--icon is-danger"
                                        aria-label={`Remove ${m.email}`}
                                        title="Remove"
                                        disabled={busy}
                                        onClick={() =>
                                          setRemoveTarget({
                                            userId: m.userId,
                                            email: m.email,
                                            name: memberDisplayName(m),
                                            role: m.role,
                                            avatarUrl: m.avatarUrl,
                                          })
                                        }
                                      >
                                        <TrashIcon />
                                      </button>
                                    </>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="plat-team__actions-empty">
                                  —
                                </span>
                              )}
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="plat-team__count">
                Showing {sortedMembers.length}{" "}
                {sortedMembers.length === 1 ? "member" : "members"}
              </p>
            </>
          )}
        </div>
      </div>

      {editTarget && orgId ? (
        <TeamMemberEditModal
          orgId={orgId}
          member={editTarget}
          roleOptions={ROLE_OPTIONS}
          roleLocked={editTarget.role === "owner" && ownerCount <= 1}
          onClose={() => setEditTarget(null)}
          onSaved={(next) => {
            setMembers((prev) =>
              prev.map((m) =>
                m.userId === next.userId ? { ...m, ...next } : m,
              ),
            );
            setEditTarget(null);
          }}
        />
      ) : null}

      {inviteOpen ? (
        <InviteMemberModal
          title={"Invite member"}
          email={inviteEmail}
          onEmailChange={setInviteEmail}
          role={inviteRole}
          roleOptions={ROLE_OPTIONS}
          onRoleChange={setInviteRole}
          busy={busy}
          creds={inviteCreds}
          onSubmit={onInvite}
          onClose={() => setInviteOpen(false)}
        />
      ) : null}

      {removeTarget ? (
        <RemoveMemberModal
          target={removeTarget}
          orgLabel={orgLabel}
          busy={busy}
          onClose={() => setRemoveTarget(null)}
          onConfirm={() => void confirmRemove()}
        />
      ) : null}
    </div>
  );
}
