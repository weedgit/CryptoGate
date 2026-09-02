import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import type { Session } from "../merchant/api";
import { roleLabel } from "../merchant/org";
import { platformRoleKey, platformRoleLabel } from "../platform/org";
import { ProfileNavIcon, SignOutNavIcon } from "../platform/NavIcons";
import { RoleBadge } from "../shared/RoleBadge";
import { sessionDisplayLabel } from "./profileIdentity";
import { SecuritySettingsPage } from "./SecuritySettingsPage";

type Props = {
  session: Session;
  variant: "platform" | "agent" | "merchant";
  /** Platform collapsed rail — hide label text. */
  collapsed?: boolean;
  onSignOut: () => void;
  onSessionRefresh?: (session: Session) => void;
};

function profileIdentity(
  session: Session,
  variant: "platform" | "agent" | "merchant",
): {
  name: string;
  role: string;
  roleKey: string;
  email: string;
  initials: string;
} {
  const email = session.email;
  const name = sessionDisplayLabel(session);

  let role = "Member";
  let roleKey = "viewer";
  if (variant === "platform") {
    roleKey = platformRoleKey(session);
    role = platformRoleLabel(session);
  } else if (variant === "agent") {
    const m = session.memberships.find(
      (x) => x.orgType === "agent" || x.orgType === "agent_sub",
    );
    roleKey = m?.role ?? "viewer";
    role = m ? roleLabel(m.role) : "Agent";
  } else {
    const m =
      session.memberships.find((x) => x.orgType === "merchant") ||
      session.memberships.find((x) => x.orgType === "merchant_site") ||
      session.memberships[0];
    roleKey = m?.role ?? "viewer";
    role = m ? roleLabel(m.role) : "Merchant";
  }

  const parts = name.split(/\s+/).filter(Boolean);
  const initials =
    parts.length >= 2
      ? `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase()
      : name.slice(0, 2).toUpperCase();

  return { name, role, roleKey, email, initials };
}

export function SidebarProfileMenu({
  session,
  variant,
  collapsed = false,
  onSignOut,
  onSessionRefresh,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | undefined>();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  const dialogTitleId = useId();
  const identity = useMemo(
    () => profileIdentity(session, variant),
    [session, variant],
  );

  useLayoutEffect(() => {
    if (!menuOpen || !triggerRef.current) return;

    const place = () => {
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const gap = 8;
      const minWidth = 176;
      const measured = menu?.offsetWidth ?? 0;
      const width = Math.max(minWidth, measured || minWidth);
      let left = collapsed
        ? rect.left + rect.width / 2 - width / 2
        : rect.left;
      const maxLeft = Math.max(8, window.innerWidth - width - 8);
      left = Math.min(Math.max(8, left), maxLeft);

      const bottom = Math.max(8, window.innerHeight - rect.top + gap);

      setMenuStyle({
        position: "fixed",
        left,
        width: "max-content",
        minWidth: width,
        maxWidth: "min(240px, calc(100vw - 16px))",
        bottom,
        zIndex: 1200,
      });
    };

    place();
    // Re-measure after paint so real content width (icons + labels) is known.
    const raf = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", place);
    };
  }, [menuOpen, collapsed]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSettingsOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [settingsOpen]);

  function openSettings() {
    setMenuOpen(false);
    setSettingsOpen(true);
  }

  function runSignOut() {
    setMenuOpen(false);
    onSignOut();
  }

  function stopBackdrop(e: ReactMouseEvent) {
    e.stopPropagation();
  }

  const profileMenuLabel = "Profile";
  const ProfileMenuIcon = ProfileNavIcon;

  const ariaLabel = `${identity.name}, ${identity.role}, ${identity.email}`;

  return (
    <div className="sidebar-profile" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`sign-out-btn sidebar-profile__trigger${menuOpen ? " is-open" : ""}${collapsed ? " is-collapsed" : ""}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : undefined}
        title={ariaLabel}
        aria-label={ariaLabel}
        onClick={() => setMenuOpen((v) => !v)}
      >
        <span className="sidebar-profile__avatar" aria-hidden>
          {identity.initials}
        </span>
        {!collapsed ? (
          <span className="sidebar-profile__meta">
            <span className="sidebar-profile__name">{identity.name}</span>
            <RoleBadge
              role={identity.roleKey}
              label={identity.role}
              className="sidebar-profile__role-badge"
            />
            <span className="sidebar-profile__email">{identity.email}</span>
          </span>
        ) : null}
      </button>

      {menuOpen
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              className="sidebar-profile__menu"
              role="menu"
              aria-label="Profile"
              style={menuStyle}
            >
              <button
                type="button"
                role="menuitem"
                className="sidebar-profile__menu-item"
                onClick={openSettings}
              >
                <ProfileMenuIcon className="sidebar-profile__menu-icon" />
                {profileMenuLabel}
              </button>
              <button
                type="button"
                role="menuitem"
                className="sidebar-profile__menu-item sidebar-profile__menu-item--danger"
                onClick={runSignOut}
              >
                <SignOutNavIcon className="sidebar-profile__menu-icon" />
                Sign out
              </button>
            </div>,
            document.body,
          )
        : null}

      {settingsOpen
        ? createPortal(
            <div
              className="b3-commission-modal-backdrop profile-settings-modal-backdrop"
              role="presentation"
              onClick={() => setSettingsOpen(false)}
            >
              <div
                className="b3-commission-modal profile-settings-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby={dialogTitleId}
                onClick={stopBackdrop}
              >
                <header className="profile-settings-modal__head">
                  <div className="profile-settings-modal__head-copy">
                    <h3 id={dialogTitleId}>{profileMenuLabel}</h3>
                    <p>Account, MFA, and session preferences for this user.</p>
                  </div>
                  <button
                    type="button"
                    className="b3-commission-modal__close profile-settings-modal__close"
                    aria-label="Close"
                    onClick={() => setSettingsOpen(false)}
                  >
                    ×
                  </button>
                </header>
                <div className="b3-commission-modal__body profile-settings-modal__body">
                  <SecuritySettingsPage
                    session={session}
                    variant={variant}
                    embedded
                    onSessionRefresh={onSessionRefresh}
                  />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
