import { useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { InviteCredentialsPanel } from "../auth/InviteCredentialsPanel";
import { AuthToast } from "../auth/AuthToast";
import {
  ApiError,
  assignOrgUserRole,
  inviteOrgUser,
  listOrgMemberEmails,
  removeOrgUser,
  type InviteOrgUserResult,
  type OrgAccount,
  type OrgMember,
} from "./api";
import { SearchableSelect } from "../ui/SearchableSelect";
import { formatPhoneDisplay } from "../shared/phoneFormat";
import { PlatformPending } from "./ui/PlatformPending";
import { TeamMemberEditModal } from "./TeamMemberEditModal";
import { DefaultUserAvatar } from "../auth/DefaultUserAvatar";
import {
  fetchRegisteredEmailIndex,
  inviteEmailErrorMessage,
  validatePlatformInviteEmail,
} from "../shared/registeredEmails";

type Props = {
  org: OrgAccount;
  orgs: OrgAccount[];
  members: OrgMember[];
  loading: boolean;
  /** Platform Owner or Administrator. */
  canManage: boolean;
  onMembersChange: (next: OrgMember[]) => void;
  /**
   * `all` — every member (default; agents / sites).
   * `team` — non-cashier members (merchant Team tab).
   * `cashiers` — cashier members only (merchant Cashiers tab).
   */
  variant?: "all" | "team" | "cashiers";
};

function roleLabel(role: string): string {
  if (role === "owner") return "Owner";
  if (role === "administrator") return "Admin";
  if (role === "viewer") return "Viewer";
  if (role === "cashier") return "Cashier";
  return role;
}

function rolesForOrg(type: string): string[] {
  if (type === "merchant" || type === "merchant_site") {
    return ["administrator", "viewer", "cashier"];
  }
  return ["administrator", "viewer"];
}

function memberName(member: OrgMember, orgName: string): string {
  const first = (member.firstName ?? "").trim();
  const last = (member.lastName ?? "").trim();
  const org = orgName.trim();
  const seededLabel = `${org} ${roleLabel(member.role)}`.trim();
  const seeded =
    first.length > 0 &&
    (first === seededLabel ||
      first.startsWith(`${seededLabel} `) ||
      (org.length > 0 && (first === org || first.startsWith(`${org} `))));
  if (seeded && last) return last;
  if (seeded) {
    let rest = first;
    if (org && (rest === org || rest.startsWith(`${org} `))) {
      rest = rest.slice(org.length).trim();
    }
    return rest || last || "—";
  }
  const name = [first, last].filter(Boolean).join(" ").trim();
  return name || "—";
}

function emptyCopy(type: string, variant: "all" | "team" | "cashiers"): string {
  if (variant === "cashiers") {
    if (type === "merchant_site") return "No cashiers on this site yet.";
    return "No cashiers on this merchant yet.";
  }
  if (type === "merchant") return "No members on this merchant org yet.";
  if (type === "merchant_site") return "No members on this site yet.";
  return "No members on this agent org yet.";
}

function loadingCopy(type: string, variant: "all" | "team" | "cashiers"): string {
  if (variant === "cashiers") {
    if (type === "merchant_site") return "Fetching cashiers for this site.";
    return "Fetching cashiers for this merchant.";
  }
  if (type === "merchant") return "Fetching members for this merchant org.";
  if (type === "merchant_site") return "Fetching members for this site.";
  return "Fetching members for this agent org.";
}

function InviteMarkIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="10" cy="8" r="3.1" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M4.2 18.2c.7-2.7 2.8-4.1 5.8-4.1s5.1 1.4 5.8 4.1"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path d="M18.2 8.2v5.2M15.6 10.8h5.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M4.5 7.5 12 13l7.5-5.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="3.1" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M5.5 18.5c.8-2.8 3-4.2 6.5-4.2s5.7 1.4 6.5 4.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function TeamHeadIcon() {
  return (
    <svg width="28" height="28" viewBox="1.6 5.4 20.4 14.8" fill="currentColor" aria-hidden>
      <circle cx="6.6" cy="8.4" r="2.05" />
      <circle cx="17.4" cy="8.4" r="2.05" />
      <path d="M2.7 17.2c.4-2 2-3.2 4-3.2.7 0 1.3.1 1.8.4-.6.7-1 1.6-1.1 2.6H3.5c-.5 0-.9-.3-.8-.8Z" />
      <path d="M21.3 17.2c-.4-2-2-3.2-4-3.2-.7 0-1.3.1-1.8.4.6.7 1 1.6 1.1 2.6h3.9c.5 0 .9-.3.8-.8Z" />
      <circle cx="12" cy="9.1" r="2.65" />
      <path d="M6.5 18.3c.45-2.55 2.5-4 5.5-4s5.05 1.45 5.5 4c.12.6-.32 1.15-.94 1.15H7.44c-.62 0-1.06-.55-.94-1.15Z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 3.2v9.6M3.2 8h9.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M9.2 3.2 12.8 6.8 5.5 14.1 2 14.6 2.5 11.1 9.2 3.2Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M8.2 4.2 11.8 7.8" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3.2 4.2h9.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path
        d="M6.2 4.1V3.2h3.6v.9"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M4.2 4.2 4.8 13h6.4l.6-8.8"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M6.6 6.6v4.2M9.4 6.6v4.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

/** Team / Cashiers tab — Owner rows are read-only. Other roles can be invited and changed. */
export function OrgTeamRoster({
  org,
  orgs,
  members,
  loading,
  canManage,
  onMembersChange,
  variant = "all",
}: Props) {
  const roleOptions = useMemo(
    () => rolesForOrg(org.type).map((id) => ({ id, label: roleLabel(id) })),
    [org.type],
  );
  const visibleMembers = useMemo(() => {
    if (variant === "cashiers") {
      return members.filter((m) => m.role === "cashier");
    }
    if (variant === "team") {
      return members.filter((m) => m.role !== "cashier");
    }
    return members;
  }, [members, variant]);
  const ownerCount = members.filter((m) => m.role === "owner").length;
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState(
    variant === "cashiers" ? "cashier" : "administrator",
  );
  const [inviteCreds, setInviteCreds] = useState<
    (InviteOrgUserResult & { invitedEmail: string }) | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<OrgMember | null>(null);
  const [editTarget, setEditTarget] = useState<OrgMember | null>(null);

  const isCashiers = variant === "cashiers";
  const headTitle = isCashiers ? "Cashiers" : "Team members";
  const headSub = isCashiers
    ? `Manage cashier profiles and POS access for ${org.name}.`
    : `Manage team members, roles and access for ${org.name}.`;
  const inviteLabel = isCashiers ? "Invite cashier" : "Invite member";
  const countNoun = isCashiers ? "cashier" : "team member";

  function openInvite() {
    setInviteCreds(null);
    setInviteEmail("");
    setInviteRole(isCashiers ? "cashier" : "administrator");
    setToast(null);
    setInviteOpen(true);
  }

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    if (!canManage || busy) return;
    setBusy(true);
    setToast(null);
    try {
      const invitedEmail = inviteEmail.trim();
      const index = await fetchRegisteredEmailIndex(orgs, listOrgMemberEmails);
      const validationErr = validatePlatformInviteEmail(invitedEmail, index, {
        targetOrgId: org.id,
        members,
      });
      if (validationErr) {
        setToast(validationErr);
        return;
      }
      const created = await inviteOrgUser(org.id, {
        email: invitedEmail,
        role: inviteRole,
      });
      onMembersChange([
        ...members.filter((m) => m.userId !== created.userId),
        {
          userId: created.userId,
          orgId: org.id,
          email: invitedEmail,
          role: created.role,
          orgType: org.type,
          status: created.status ?? "active",
        },
      ]);
      setInviteCreds({ ...created, invitedEmail });
      setInviteEmail("");
    } catch (err) {
      setToast(inviteEmailErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onRoleChange(member: OrgMember, role: string) {
    if (!canManage || busy || role === member.role) return;
    if (member.role === "owner" && role !== "owner" && ownerCount <= 1) {
      setToast("Cannot demote the last Owner");
      return;
    }
    setBusy(true);
    setToast(null);
    try {
      const updated = await assignOrgUserRole(org.id, member.userId, role);
      onMembersChange(
        members.map((m) =>
          m.userId === member.userId
            ? { ...m, role: updated.role, status: updated.status ?? m.status }
            : m,
        ),
      );
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Role update failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirmRemove() {
    if (!canManage || busy || !removeTarget) return;
    if (removeTarget.role === "owner" && ownerCount <= 1) {
      setToast("Cannot remove the last Owner");
      setRemoveTarget(null);
      return;
    }
    setBusy(true);
    setToast(null);
    try {
      await removeOrgUser(org.id, removeTarget.userId);
      onMembersChange(members.filter((m) => m.userId !== removeTarget.userId));
      setRemoveTarget(null);
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <PlatformPending
        compact
        title={isCashiers ? "Loading cashiers" : "Loading team"}
        copy={loadingCopy(org.type, variant)}
      />
    );
  }

  return (
    <div className="b3-team">
      <AuthToast message={toast} tone="error" onDismiss={() => setToast(null)} />
      <div className="b3-team__head">
        <span className="b3-team__head-icon" aria-hidden>
          <TeamHeadIcon />
        </span>
        <div className="b3-team__head-copy">
          <h3 className="b3-team__title">{headTitle}</h3>
          <p className="b3-team__sub">{headSub}</p>
        </div>
        {canManage ? (
          <button
            type="button"
            className="b3-team__invite"
            disabled={busy}
            onClick={openInvite}
          >
            <PlusIcon />
            {inviteLabel}
          </button>
        ) : null}
      </div>
      {visibleMembers.length === 0 ? (
        <p className="b3-team__empty">{emptyCopy(org.type, variant)}</p>
      ) : (
        <div className="b3-agent-detail__table-scroll b3-team__table">
          <table className="data-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Role</th>
                {canManage ? <th>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {visibleMembers.map((m) => {
                const readOnly = m.role === "owner";
                return (
                  <tr key={m.userId}>
                    <td>
                      <span className="b3-team__member">
                        <span className="b3-team__avatar" aria-hidden>
                          {m.avatarUrl ? (
                            <img src={m.avatarUrl} alt="" />
                          ) : (
                            <DefaultUserAvatar className="b3-team__avatar-default" />
                          )}
                        </span>
                        <span className="b3-team__name">{memberName(m, org.name)}</span>
                      </span>
                    </td>
                    <td>{m.email}</td>
                    <td>{m.phone?.trim() ? formatPhoneDisplay(m.phone) : "—"}</td>
                    <td>
                      {canManage && !readOnly ? (
                        <SearchableSelect
                          value={m.role}
                          options={roleOptions}
                          disabled={busy}
                          allowEmpty={false}
                          ariaLabel={`Role for ${m.email}`}
                          menuClassName="b3-team-role-menu"
                          menuMinWidth={96}
                          onChange={(role) => void onRoleChange(m, role)}
                        />
                      ) : (
                        <span className="b3-team__role">{roleLabel(m.role)}</span>
                      )}
                    </td>
                    {canManage ? (
                      <td>
                        {readOnly ? (
                          <span className="b3-team__readonly">Read only</span>
                        ) : (
                          <span className="b3-team__actions">
                            <button
                              type="button"
                              className="b3-team__action"
                              aria-label="Edit"
                              disabled={busy}
                              onClick={() => setEditTarget(m)}
                            >
                              <PencilIcon />
                            </button>
                            <button
                              type="button"
                              className="b3-team__action b3-team__action--remove"
                              aria-label="Remove"
                              disabled={busy}
                              onClick={() => setRemoveTarget(m)}
                            >
                              <TrashIcon />
                            </button>
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
      )}
      <p className="b3-team__count">
        Showing {visibleMembers.length} {countNoun}
        {visibleMembers.length === 1 ? "" : "s"}
      </p>

      {editTarget ? (
        <TeamMemberEditModal
          orgId={org.id}
          member={editTarget}
          roleOptions={roleOptions}
          roleLocked={editTarget.role === "owner" && ownerCount <= 1}
          onClose={() => setEditTarget(null)}
          onSaved={(next) => {
            onMembersChange(
              members.map((m) => (m.userId === next.userId ? { ...m, ...next } : m)),
            );
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
                aria-labelledby="org-team-invite-title"
                onClick={(e) => e.stopPropagation()}
              >
                <header className="b3-invite-modal__head">
                  <span className="b3-invite-modal__mark" aria-hidden>
                    <InviteMarkIcon />
                  </span>
                  <h3 id="org-team-invite-title">
                    {isCashiers ? "Invite cashier" : "Invite member"}
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
                <form className="b3-invite-modal__body" onSubmit={(e) => void onInvite(e)}>
                  <label className="b3-invite-modal__field">
                    <span className="b3-invite-modal__label">Email</span>
                    <span className="b3-invite-modal__control">
                      <span className="b3-invite-modal__glyph">
                        <MailIcon />
                      </span>
                      <input
                        className="b3-invite-modal__input"
                        type="email"
                        value={inviteEmail}
                        disabled={busy}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="name@company.com"
                        autoFocus
                        required
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
                        value={inviteRole}
                        options={roleOptions}
                        disabled={busy}
                        allowEmpty={false}
                        ariaLabel="Invite role"
                        menuClassName="b3-team-role-menu"
                        menuMinWidth={96}
                        onChange={setInviteRole}
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
                      <InviteMarkIcon />
                      {busy
                        ? "Inviting…"
                        : isCashiers
                          ? "Invite cashier"
                          : "Invite"}
                    </button>
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
                className="b3-commission-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="org-team-remove-title"
                onClick={(e) => e.stopPropagation()}
              >
                <header className="b3-commission-modal__head">
                  <h3 id="org-team-remove-title">Remove member</h3>
                </header>
                <div className="b3-commission-modal__body">
                  <p className="b3-commission-modal__hint">
                    Remove {removeTarget.email} ({roleLabel(removeTarget.role)}) from{" "}
                    {org.name}.
                  </p>
                </div>
                <footer className="b3-commission-modal__foot">
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
                    className="b3-commission-modal__save"
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
