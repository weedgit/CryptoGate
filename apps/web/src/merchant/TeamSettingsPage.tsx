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
  assignOrgUserRole,
  inviteOrgUser,
  listOrgMemberEmails,
  removeOrgUser,
  setOrgUserStatus,
  type InviteOrgUserResult,
  type OrgAccount,
  type OrgMember,
  type Session,
} from "./api";
import { InviteCredentialsPanel } from "../auth/InviteCredentialsPanel";
import { AuthToast } from "../auth/AuthToast";
import { SearchableSelect } from "../ui/SearchableSelect";
import { PlatformPending } from "../platform/ui/PlatformPending";
import {
  orgTypeLabel,
  primaryMerchantOrgId,
  roleLabel,
  sessionCanManageTeam,
  sessionRoleOnOrg,
  structureLabel,
} from "./org";
import {
  fetchRegisteredEmailIndex,
  validatePlatformInviteEmail,
  inviteEmailErrorMessage,
} from "../shared/registeredEmails";
import type { OrgRef } from "../shared/registeredEmails";

type Props = { session: Session };

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

function roleTone(role: string): string {
  if (role === "owner") return "owner";
  if (role === "administrator") return "admin";
  if (role === "cashier") return "cashier";
  return "viewer";
}

type RemoveTarget = { userId: string; email: string };

/** D16 — Merchant team settings (platform team chrome). */
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
  const [topbarActionsSlot, setTopbarActionsSlot] =
    useState<HTMLElement | null>(null);

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

  function openInvite() {
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
            Only the Owner can add or remove team members.
            {myRole === "administrator"
              ? " Administrators can review the roster below."
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
            <h1 className="plat-team__org-name">{org.name}</h1>
            <div className="plat-team__org-chips">
              <span className="plat-team__org-chip">
                {orgTypeLabel(org.type)}
              </span>
              <span className="plat-team__org-chip plat-team__org-chip--muted">
                {structureLabel(org.structure)}
              </span>
            </div>
          </div>
        </header>
      ) : null}

      <section className="plat-team__card">
        <header className="plat-team__card-head">
          <div>
            <h2>Members</h2>
            <p className="plat-team__card-copy">
              Merchant Owner, Administrator, Viewer, and Cashier memberships.
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
            copy="Fetching merchant org members."
          />
        ) : sortedMembers.length === 0 ? (
          <p className="plat-team__empty">
            No members returned for this merchant org.
          </p>
        ) : (
          <div className="plat-team__table-wrap">
            <table className="plat-team__table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>MFA status</th>
                  <th>Last login</th>
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
                              <span className="plat-team__paused-tag">
                                Paused
                              </span>
                            ) : null}
                          </span>
                        </div>
                      </td>
                      <td className="plat-team__email">{m.email}</td>
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
                            />
                          </div>
                        ) : (
                          <span
                            className={`plat-team__role tone-${roleTone(m.role)}`}
                          >
                            {roleBadgeText(m.role)}
                          </span>
                        )}
                      </td>
                      <td>
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
                          {!isSelf ? (
                            <div className="plat-team__actions">
                              {paused ? (
                                <button
                                  type="button"
                                  className="btn-secondary plat-team__action"
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
                                  className="btn-secondary plat-team__action"
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
                                className="btn-ghost plat-team__action is-danger"
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
                aria-labelledby="merchant-team-invite-title"
                onClick={(e) => e.stopPropagation()}
              >
                <header className="b3-commission-modal__head">
                  <div className="plat-team__invite-head-text">
                    <h3 id="merchant-team-invite-title">
                      {inviteCreds ? "Member invited" : "Invite member"}
                    </h3>
                    <p className="plat-team__invite-lede">
                      {inviteCreds
                        ? "Share sign-in details securely, then select Done."
                        : "Send a portal invite for Administrator, Viewer, or Cashier on this merchant org."}
                    </p>
                  </div>
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
                  <label
                    className="plat-team__field"
                    htmlFor="merchant-team-invite-email"
                  >
                    <span>Email</span>
                    <input
                      id="merchant-team-invite-email"
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
                  <div className="plat-team__field">
                    <span id="merchant-team-invite-role-label">Role</span>
                    <div className="plat-team__invite-role">
                      <SearchableSelect
                        id="merchant-team-invite-role"
                        value={inviteRole}
                        options={inviteRoleOptions(org?.type)}
                        onChange={setInviteRole}
                        disabled={busy || Boolean(inviteCreds)}
                        allowEmpty={false}
                        placeholder="Select role"
                        ariaLabel="Invite role"
                      />
                    </div>
                  </div>
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
                      <>
                        <button
                          type="button"
                          className="plat-team__invite-cancel"
                          disabled={busy}
                          onClick={() => setInviteOpen(false)}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="plat-team__invite-confirm"
                          disabled={busy || !inviteEmail.trim()}
                        >
                          {busy ? "Working…" : "Add member"}
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
    </div>
  );
}
