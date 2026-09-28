import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { Session } from "../merchant/api";
import { roleLabel } from "../merchant/org";
import { platformRoleKey, platformRoleLabel } from "../platform/org";
import { ProfileNavIcon, SignOutNavIcon } from "../platform/NavIcons";
import { RoleBadge } from "../shared/RoleBadge";
import { DefaultUserAvatar } from "./DefaultUserAvatar";
import { sessionDisplayLabel, sessionHasAvatar } from "./profileIdentity";
import { ProfileSettingsModal } from "./ProfileSettingsModal";
import {
  MFA_SETUP_PARAM,
  PROFILE_EDIT_PARAM,
  useOpenOnEditParam,
} from "../shared/modalLinks";

type Props = {
  session: Session;
  variant: "platform" | "agent" | "merchant";
  /** Platform collapsed rail — hide label text. */
  collapsed?: boolean;
  /** Render as topbar profile chip (avatar + name + org). */
  placement?: "sidebar" | "topbar";
  onSignOut: () => void;
  onSessionRefresh?: (session: Session) => void;
  /** Extra section rendered inside the Profile window. */
  profileExtra?: ReactNode;
};

function profileIdentity(
  session: Session,
  variant: "platform" | "agent" | "merchant",
): {
  name: string;
  role: string;
  roleKey: string;
  email: string;
  avatarUrl: string | null;
} {
  const email = session.email;
  const name = sessionDisplayLabel(session);
  const avatarUrl = sessionHasAvatar(session)
    ? (session.avatarUrl ?? "").trim()
    : null;

  let role = "Member";
  let roleKey = "viewer";
  if (variant === "platform") {
    roleKey = platformRoleKey(session);
    role = platformRoleLabel(session);
  } else if (variant === "agent") {
    const m = session.memberships.find(
      (x) => x.orgType === "agent",
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

  return { name, role, roleKey, email, avatarUrl };
}

export function SidebarProfileMenu({
  session,
  variant,
  collapsed = false,
  placement = "sidebar",
  onSignOut,
  onSessionRefresh,
  profileExtra,
}: Props) {
  const isTopbar = placement === "topbar";
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [startMfa, setStartMfa] = useState(false);
  const [settingsKey, setSettingsKey] = useState(0);
  useOpenOnEditParam(PROFILE_EDIT_PARAM, () => {
    setStartMfa(false);
    setSettingsOpen(true);
  });
  useOpenOnEditParam(MFA_SETUP_PARAM, () => {
    setStartMfa(true);
    setSettingsKey((k) => k + 1);
    setSettingsOpen(true);
  });
  const [menuStyle, setMenuStyle] = useState<CSSProperties | undefined>();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
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
      let left = !isTopbar && collapsed
        ? rect.left + rect.width / 2 - width / 2
        : rect.right - width;
      const maxLeft = Math.max(8, window.innerWidth - width - 8);
      left = Math.min(Math.max(8, left), maxLeft);

      if (isTopbar) {
        setMenuStyle({
          position: "fixed",
          left,
          top: rect.bottom + gap,
          width: "max-content",
          minWidth: width,
          maxWidth: "min(240px, calc(100vw - 16px))",
          zIndex: 1200,
        });
        return;
      }

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
  }, [menuOpen, collapsed, isTopbar]);

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

  function openSettings() {
    setMenuOpen(false);
    setStartMfa(false);
    setSettingsOpen(true);
  }

  function runSignOut() {
    setMenuOpen(false);
    onSignOut();
  }

  const ProfileMenuIcon = ProfileNavIcon;

  const ariaLabel = `${identity.name}, ${identity.role}, ${identity.email}`;

  return (
    <div
      className={`sidebar-profile${isTopbar ? " sidebar-profile--topbar" : ""}`}
      ref={rootRef}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`sign-out-btn sidebar-profile__trigger${menuOpen ? " is-open" : ""}${
          collapsed && !isTopbar ? " is-collapsed" : ""
        }${isTopbar ? " is-topbar" : ""}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : undefined}
        title={ariaLabel}
        aria-label={ariaLabel}
        onClick={() => setMenuOpen((v) => !v)}
      >
        <span
          className={`sidebar-profile__avatar${
            identity.avatarUrl ? "" : " sidebar-profile__avatar--default"
          }`}
          aria-hidden
        >
          {identity.avatarUrl ? (
            <img
              className="sidebar-profile__avatar-img"
              src={identity.avatarUrl}
              alt=""
              draggable={false}
            />
          ) : (
            <DefaultUserAvatar className="sidebar-profile__avatar-img sidebar-profile__avatar-img--default" />
          )}
        </span>
        {isTopbar ? (
          <span className="sidebar-profile__meta sidebar-profile__meta--topbar">
            <span className="sidebar-profile__name">{identity.name}</span>
            <span className="sidebar-profile__org">{identity.email}</span>
          </span>
        ) : !collapsed ? (
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
        {isTopbar ? (
          <span className="sidebar-profile__chevron" aria-hidden>
            <svg viewBox="0 0 10 6" width="10" height="6" fill="none">
              <path
                d="M1 1l4 4 4-4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
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
                Profile
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

      {settingsOpen ? (
        <ProfileSettingsModal
          key={settingsKey}
          session={session}
          title="Profile"
          onClose={() => setSettingsOpen(false)}
          onSessionRefresh={onSessionRefresh}
          extraSection={profileExtra}
          startMfa={startMfa}
        />
      ) : null}
    </div>
  );
}
