import {
  FormEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { getMerchantOrgs, peekMerchantOrgs } from "./merchantOrgList";
import { getOrgUsers, invalidateOrgUsers, mergeOrgMember, orgMemberFromInvite, peekOrgUsers, primeOrgUsers } from "../shared/orgUsersCache";
import {
  ApiError,
  adminClearMemberPosPin,
  adminSetMemberPosPin,
  assignOrgUserRole,
  inviteOrgUser,
  listOrgMemberEmails,
  patchOrgProfile,
  getSession,
  removeOrgUser,
  setOrgUserStatus,
  type InviteOrgUserResult,
  type OrgAccount,
  type OrgMember,
  type Session,
} from "./api";
import { InviteCredentialsPanel } from "../auth/InviteCredentialsPanel";
import { AuthToast } from "../auth/AuthToast";
import { DefaultUserAvatar } from "../auth/DefaultUserAvatar";
import { OrgBrandMark } from "../shared/OrgBrandMark";
import { OrgProfileEditModal } from "../shared/OrgProfileEditModal";
import { SearchableSelect } from "../ui/SearchableSelect";
import { PlatformPending } from "../platform/ui/PlatformPending";
import { TeamMemberEditModal } from "../platform/TeamMemberEditModal";
import {
  orgTypeLabel,
  primaryMerchantOrgId,
  roleLabel,
  sessionCanEditOrgSettings,
  sessionCanManageMemberPosPin,
  sessionCanManageTeam,
  sessionRoleOnOrg,
} from "./org";
import { SetupChecklistCard } from "../auth/SetupChecklistCard";
import {
  liveActionLockedHint,
  sessionLiveActionsUnlocked,
} from "../auth/contactVerification";
import { formatPhoneDisplay } from "../shared/phoneFormat";
import {
  CloseIcon,
  InviteMarkIcon,
  MailIcon,
  memberDisplayName,
  PauseIcon,
  PencilIcon,
  PersonIcon,
  PlayIcon,
  TrashIcon,
} from "../shared/teamRosterChrome";
import {
  fetchRegisteredEmailIndex,
  validatePlatformInviteEmail,
  inviteEmailErrorMessage,
} from "../shared/registeredEmails";
import type { OrgRef } from "../shared/registeredEmails";

type Props = {
  session: Session;
  onSessionRefresh?: (session: Session) => void;
};

const INVITE_ROLES = ["administrator", "viewer", "cashier"] as const;
const NON_CASHIER_INVITE_ROLES = ["administrator", "viewer"] as const;

function inviteRoleOptions(orgType: string | undefined) {
  const roles =
    orgType === "merchant" || orgType === "merchant_site"
      ? INVITE_ROLES
      : NON_CASHIER_INVITE_ROLES;
  return roles.map((r) => ({
    id: r,
    label: roleLabel(r),
  }));
}

function roleBadgeText(role: string): string {
  return roleLabel(role);
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
type PosPinTarget = { userId: string; email: string };

/** D16 — Merchant team settings (platform team chrome). */
export function TeamSettingsPage({ session, onSessionRefresh }: Props) {
  const orgId = useMemo(() => primaryMerchantOrgId(session), [session]);
  const canManage = useMemo(
    () => (orgId ? sessionCanManageTeam(session, orgId) : false),
    [session, orgId],
  );
  const canEditProfile = useMemo(
    () => sessionCanEditOrgSettings(session),
    [session],
  );
  const canManagePosPin = useMemo(
    () => (orgId ? sessionCanManageMemberPosPin(session, orgId) : false),
    [session, orgId],
  );
  const myRole = useMemo(
    () => (orgId ? sessionRoleOnOrg(session, orgId) : null),
    [session, orgId],
  );

  const [members, setMembers] = useState<OrgMember[]>(() =>
    orgId ? (peekOrgUsers(orgId) ?? []) : [],
  );
  const [org, setOrg] = useState<OrgAccount | null>(() =>
    orgId ? (peekMerchantOrgs()?.find((o) => o.id === orgId) ?? null) : null,
  );
  const [loading, setLoading] = useState(
    () => !(orgId && peekOrgUsers(orgId)),
  );
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("cashier");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    tone: "ok" | "error";
  } | null>(null);
  const [inviteCreds, setInviteCreds] = useState<
    (InviteOrgUserResult & { invitedEmail: string }) | null
  >(null);
  const [orgs, setOrgs] = useState<OrgRef[]>([]);
  const [removeTarget, setRemoveTarget] = useState<RemoveTarget | null>(null);
  const [editTarget, setEditTarget] = useState<OrgMember | null>(null);
  const [posPinTarget, setPosPinTarget] = useState<PosPinTarget | null>(null);
  const [posPinValue, setPosPinValue] = useState("");
  const [posPinConfirm, setPosPinConfirm] = useState("");
  const [topbarActionsSlot, setTopbarActionsSlot] =
    useState<HTMLElement | null>(null);
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [profileEditBusy, setProfileEditBusy] = useState(false);
  const [profileEditError, setProfileEditError] = useState<string | null>(null);

  const dismissToast = useCallback(() => setToast(null), []);
  const showOk = useCallback((message: string) => {
    setToast({ message, tone: "ok" });
  }, []);
  const showErr = useCallback((message: string) => {
    setToast({ message, tone: "error" });
  }, []);

  useLayoutEffect(() => {
    setTopbarActionsSlot(document.getElementById("merchant-topbar-actions"));
  }, []);

  const load = useCallback(async (opts?: { force?: boolean }) => {
    if (!orgId) {
      setError("No merchant org on this session");
      setLoading(false);
      return;
    }
    if (opts?.force) invalidateOrgUsers(orgId);
    if (!peekOrgUsers(orgId)) setLoading(true);
    setError(null);
    try {
      const [roster, account] = await Promise.all([
        getOrgUsers(orgId, { force: opts?.force }),
        getMerchantOrgs().then(
          (rows) => rows.find((o) => o.id === orgId) ?? null,
        ),
      ]);
      setMembers(roster);
      setOrg(account);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load team");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void getMerchantOrgs()
      .then(setOrgs)
      .catch(() => setOrgs([]));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedMembers = useMemo(() => {
    const rank = (role: string) => {
      if (role === "owner") return 0;
      if (role === "administrator") return 1;
      if (role === "viewer") return 2;
      if (role === "cashier") return 3;
      return 4;
    };
    return [...members].sort((a, b) => {
      const byRole = rank(a.role) - rank(b.role);
      if (byRole !== 0) return byRole;
      return a.email.localeCompare(b.email);
    });
  }, [members]);

  const ownerCount = useMemo(
    () => members.filter((m) => m.role === "owner").length,
    [members],
  );

  function openInvite() {
    if (!sessionLiveActionsUnlocked(session)) {
      showErr(liveActionLockedHint(session));
      return;
    }
    setInviteCreds(null);
    setInviteEmail("");
    setInviteRole(
      org?.type === "merchant" || org?.type === "merchant_site"
        ? "cashier"
        : "administrator",
    );
    setInviteOpen(true);
  }

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    if (!orgId || !canManage) return;
    if (
      inviteRole === "cashier" &&
      org?.type !== "merchant" &&
      org?.type !== "merchant_site"
    ) {
      showErr("Cashier is only valid on merchant or merchant-site accounts");
      return;
    }
    setBusy(true);
    setInviteCreds(null);
    try {
      const invitedEmail = inviteEmail.trim();
      const freshIndex = await fetchRegisteredEmailIndex(
        orgs,
        listOrgMemberEmails,
      );
      const validationErr = validatePlatformInviteEmail(
        invitedEmail,
        freshIndex,
        {
          targetOrgId: orgId,
          targetOrgType: org?.type,
          members,
        },
      );
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

  function openPosPin(target: PosPinTarget) {
    setPosPinTarget(target);
    setPosPinValue("");
    setPosPinConfirm("");
  }

  async function onSaveMemberPosPin(e: FormEvent) {
    e.preventDefault();
    if (!orgId || !canManagePosPin || !posPinTarget) return;
    if (!/^\d{4,8}$/.test(posPinValue)) {
      showErr("POS PIN must be 4–8 digits");
      return;
    }
    if (posPinValue !== posPinConfirm) {
      showErr("PINs do not match");
      return;
    }
    setBusy(true);
    try {
      await adminSetMemberPosPin(orgId, posPinTarget.userId, posPinValue);
      showOk(`POS PIN set for ${posPinTarget.email}.`);
      setPosPinTarget(null);
      setPosPinValue("");
      setPosPinConfirm("");
    } catch (err) {
      showErr(err instanceof ApiError ? err.message : "Could not set POS PIN");
    } finally {
      setBusy(false);
    }
  }

  async function onClearMemberPosPin() {
    if (!orgId || !canManagePosPin || !posPinTarget) return;
    setBusy(true);
    try {
      await adminClearMemberPosPin(orgId, posPinTarget.userId);
      showOk(`POS PIN cleared for ${posPinTarget.email}.`);
      setPosPinTarget(null);
      setPosPinValue("");
      setPosPinConfirm("");
    } catch (err) {
      showErr(err instanceof ApiError ? err.message : "Could not clear POS PIN");
    } finally {
      setBusy(false);
    }
  }

  const showActions = canManage || canManagePosPin;
  const liveUnlocked = sessionLiveActionsUnlocked(session);
  const setupLockHint = liveActionLockedHint(session);

  return (
    <div className="plat-team">
      <AuthToast
        message={toast?.message ?? error}
        tone={toast?.tone ?? "error"}
        onDismiss={() => {
          dismissToast();
          setError(null);
        }}
      />

      <SetupChecklistCard session={session} portal="merchant" />

      {canManage && topbarActionsSlot
        ? createPortal(
            <button
              type="button"
              className="plat-team__invite-cta"
              onClick={openInvite}
              disabled={busy || !liveUnlocked}
              title={!liveUnlocked ? setupLockHint : undefined}
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
            Only the Owner can add or remove team members.
            {myRole === "administrator"
              ? " Administrators can set or reset Cashier POS PINs below."
              : myRole === "viewer"
                ? " Viewers can review the roster below."
                : " Other roles can review the roster below."}
          </p>
        </div>
      ) : null}

      {org ? (
        <header className="plat-team__org">
          <p className="plat-team__org-eyebrow">Organization</p>
          <div className="plat-team__org-title-row">
            <OrgBrandMark name={org.name} iconKey={org.iconKey} size={40} />
            <h1 className="plat-team__org-name">{org.name}</h1>
            <div className="plat-team__org-chips">
              <span className="plat-team__org-chip">
                {orgTypeLabel(org.type)}
              </span>
              {canEditProfile ? (
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={profileEditBusy}
                  onClick={() => {
                    setProfileEditError(null);
                    setProfileEditOpen(true);
                  }}
                >
                  Edit
                </button>
              ) : null}
            </div>
          </div>
        </header>
      ) : null}

      <OrgProfileEditModal
        open={profileEditOpen}
        name={org?.name ?? ""}
        iconKey={org?.iconKey}
        country={org?.country}
        legalName={org?.legalName}
        billingEmail={org?.billingEmail}
        requireCountry={true}
        typeLabel={org ? orgTypeLabel(org.type) : undefined}
        busy={profileEditBusy}
        error={profileEditError}
        onClose={() => {
          if (!profileEditBusy) setProfileEditOpen(false);
        }}
        onSave={async (next) => {
          if (!orgId) return;
          setProfileEditBusy(true);
          setProfileEditError(null);
          try {
            const updated = await patchOrgProfile(orgId, next);
            setOrg(updated);
            setToast({ message: "Organization profile saved", tone: "ok" });
            setProfileEditOpen(false);
            await getMerchantOrgs({ force: true });
            if (onSessionRefresh) {
              onSessionRefresh(await getSession());
            }
          } catch (err) {
            setProfileEditError(
              err instanceof ApiError ? err.message : "Failed to update profile",
            );
          } finally {
            setProfileEditBusy(false);
          }
        }}
      />

      <section className="plat-team__card">
        <header className="plat-team__card-head">
          <div>
            <h2>Members</h2>
            <p className="plat-team__card-copy">
              Merchant Owner, Administrator, Viewer, and Cashier memberships.
            </p>
          </div>
        </header>

        {loading ? (
          <PlatformPending
            compact
            title="Loading team"
            copy="Fetching merchant org members."
          />
        ) : sortedMembers.length === 0 ? (
          <p className="plat-team__empty">
            No members returned for this merchant org.
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
                  {showActions ? (
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
                        {m.phone?.trim() ? formatPhoneDisplay(m.phone) : "—"}
                      </td>
                      <td>
                        {canManage &&
                        m.role !== "owner" &&
                        status === "active" ? (
                          <div className="plat-team__role-picker">
                            <SearchableSelect
                              value={m.role}
                              options={inviteRoleOptions(org?.type)}
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
                          <span className="plat-team__role">
                            {roleBadgeText(m.role)}
                          </span>
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
                      {showActions ? (
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
                              {!isSelf && (canManagePosPin || canManage) ? (
                                <>
                                  {canManagePosPin ? (
                                    <button
                                      type="button"
                                      className="plat-team__action"
                                      disabled={busy}
                                      onClick={() =>
                                        openPosPin({
                                          userId: m.userId,
                                          email: m.email,
                                        })
                                      }
                                    >
                                      POS PIN
                                    </button>
                                  ) : null}
                                  {canManage ? (
                                    <>
                                      {paused ? (
                                        <button
                                          type="button"
                                          className="plat-team__action plat-team__action--icon"
                                          aria-label={`Resume ${m.email}`}
                                          title="Resume"
                                          disabled={busy}
                                          onClick={() =>
                                            void onSetStatus(m.userId, "active")
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
                                            void onSetStatus(m.userId, "paused")
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
                                          })
                                        }
                                      >
                                        <TrashIcon />
                                      </button>
                                    </>
                                  ) : null}
                                </>
                              ) : null}
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
          <p className="plat-team__count">
            Showing {sortedMembers.length}{" "}
            {sortedMembers.length === 1 ? "member" : "members"}
          </p>
          </>
        )}
      </section>

      {editTarget && orgId ? (
        <TeamMemberEditModal
          orgId={orgId}
          member={editTarget}
          roleOptions={inviteRoleOptions(org?.type)}
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
                className="b3-commission-modal b3-invite-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="merchant-team-invite-title"
                onClick={(e) => e.stopPropagation()}
              >
                <header className="b3-invite-modal__head">
                  <span className="b3-invite-modal__mark" aria-hidden>
                    <InviteMarkIcon />
                  </span>
                  <h3 id="merchant-team-invite-title">
                    {inviteCreds ? "Member invited" : "Invite member"}
                  </h3>
                  <button
                    type="button"
                    className="b3-invite-modal__close"
                    aria-label="Close"
                    disabled={busy}
                    onClick={() => setInviteOpen(false)}
                  >
                    <CloseIcon />
                  </button>
                </header>
                <form
                  className="b3-invite-modal__body"
                  onSubmit={onInvite}
                  noValidate
                >
                  <label className="b3-invite-modal__field">
                    <span className="b3-invite-modal__label">Email</span>
                    <span className="b3-invite-modal__control">
                      <span className="b3-invite-modal__glyph">
                        <MailIcon />
                      </span>
                      <input
                        className="b3-invite-modal__input"
                        type="email"
                        required
                        autoComplete="off"
                        autoFocus
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        disabled={busy || Boolean(inviteCreds)}
                        placeholder="name@company.com"
                      />
                    </span>
                  </label>
                  <label className="b3-invite-modal__field">
                    <span className="b3-invite-modal__label">Role</span>
                    <span className="b3-invite-modal__control b3-invite-modal__role">
                      <span className="b3-invite-modal__glyph">
                        <PersonIcon />
                      </span>
                      <SearchableSelect
                        id="merchant-team-invite-role"
                        value={inviteRole}
                        options={inviteRoleOptions(org?.type)}
                        onChange={setInviteRole}
                        disabled={busy || Boolean(inviteCreds)}
                        allowEmpty={false}
                        placeholder="Select role"
                        ariaLabel="Invite role"
                        menuClassName="b3-team-role-menu"
                        menuMinWidth={96}
                      />
                    </span>
                  </label>
                  {inviteCreds ? (
                    <InviteCredentialsPanel
                      email={inviteCreds.invitedEmail}
                      temporaryPassword={inviteCreds.temporaryPassword}
                      inviteUrl={inviteCreds.inviteUrl}
                      invitePath={inviteCreds.invitePath}
                      emailDeliveryStatus={inviteCreds.emailDelivery?.status}
                    />
                  ) : null}
                  <footer className="b3-invite-modal__foot">
                    {inviteCreds ? (
                      <button
                        type="button"
                        className="b3-invite-modal__submit"
                        disabled={busy}
                        onClick={() => setInviteOpen(false)}
                      >
                        Done
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="b3-invite-modal__cancel"
                          disabled={busy}
                          onClick={() => setInviteOpen(false)}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="b3-invite-modal__submit"
                          disabled={busy || !inviteEmail.trim()}
                        >
                          {busy ? "Inviting…" : "Invite"}
                        </button>
                      </>
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
                aria-labelledby="merchant-team-remove-title"
                onClick={(e) => e.stopPropagation()}
              >
                <header className="b3-commission-modal__head">
                  <h3 id="merchant-team-remove-title">Remove team member</h3>
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
                    from this merchant org?
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

      {posPinTarget
        ? createPortal(
            <div
              className="b3-commission-modal-backdrop"
              role="presentation"
              onClick={() => {
                if (!busy) setPosPinTarget(null);
              }}
            >
              <div
                className="b3-commission-modal plat-team__invite-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="merchant-team-pos-pin-title"
                onClick={(e) => e.stopPropagation()}
              >
                <header className="b3-commission-modal__head">
                  <div className="plat-team__invite-head-text">
                    <h3 id="merchant-team-pos-pin-title">Cashier POS PIN</h3>
                    <p className="plat-team__invite-lede">
                      Set or clear the unlock PIN for{" "}
                      <strong>{posPinTarget.email}</strong>. Does not require
                      their current PIN.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="b3-commission-modal__close"
                    aria-label="Close"
                    disabled={busy}
                    onClick={() => setPosPinTarget(null)}
                  >
                    ×
                  </button>
                </header>
                <form
                  className="b3-commission-modal__body plat-team__invite-form"
                  onSubmit={(e) => void onSaveMemberPosPin(e)}
                  noValidate
                >
                  <label
                    className="plat-team__field"
                    htmlFor="merchant-team-pos-pin"
                  >
                    <span>New POS PIN</span>
                    <input
                      id="merchant-team-pos-pin"
                      className="plat-team__input"
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      autoFocus
                      value={posPinValue}
                      onChange={(e) => setPosPinValue(e.target.value)}
                      disabled={busy}
                      maxLength={8}
                      placeholder="4–8 digits"
                    />
                  </label>
                  <label
                    className="plat-team__field"
                    htmlFor="merchant-team-pos-pin-confirm"
                  >
                    <span>Confirm PIN</span>
                    <input
                      id="merchant-team-pos-pin-confirm"
                      className="plat-team__input"
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      value={posPinConfirm}
                      onChange={(e) => setPosPinConfirm(e.target.value)}
                      disabled={busy}
                      maxLength={8}
                    />
                  </label>
                  <footer className="b3-commission-modal__foot plat-team__invite-foot">
                    <button
                      type="button"
                      className="plat-team__invite-cancel"
                      disabled={busy}
                      onClick={() => void onClearMemberPosPin()}
                    >
                      Clear PIN
                    </button>
                    <button
                      type="button"
                      className="plat-team__invite-cancel"
                      disabled={busy}
                      onClick={() => setPosPinTarget(null)}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="plat-team__invite-confirm"
                      disabled={busy || !posPinValue}
                    >
                      {busy ? "Saving…" : "Save PIN"}
                    </button>
                  </footer>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
