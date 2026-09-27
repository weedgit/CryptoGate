import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import type { Session } from "../merchant/api";
import { platformRoleKey } from "../platform/org";
import { sessionLiveActionsUnlocked } from "../auth/contactVerification";
import { RoleBadge, roleTone } from "./RoleBadge";
import { rolePermissionSummary, type PortalKind } from "./rolePermissions";

type Props = {
  session: Session;
  portal: PortalKind;
  /** Collapsed rail — show only the role mark. */
  collapsed?: boolean;
};

export function sessionPortalRole(session: Session, portal: PortalKind): string {
  if (portal === "platform") return platformRoleKey(session);
  if (portal === "agent") {
    return session.memberships.find((m) => m.orgType === "agent")?.role ?? "viewer";
  }
  const m =
    session.memberships.find((x) => x.orgType === "merchant") ||
    session.memberships.find((x) => x.orgType === "merchant_site") ||
    session.memberships[0];
  return m?.role ?? "viewer";
}

const POPOVER_WIDTH = 280;

/** Bottom-of-sidebar card: who you are here and what you may do. */
export function SidebarRoleCard({ session, portal, collapsed = false }: Props) {
  const info = rolePermissionSummary(portal, sessionPortalRole(session, portal));
  const locked = portal !== "platform" && !sessionLiveActionsUnlocked(session);
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const popId = useId();

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const width = Math.max(r.width, POPOVER_WIDTH);
    const left = Math.min(r.left, window.innerWidth - width - 8);
    setStyle({
      position: "fixed",
      left: Math.max(8, left),
      bottom: window.innerHeight - r.top + 8,
      width,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const title = `${info.label} · ${info.summary}${locked ? " · Watch-only until setup is complete" : ""}`;

  return (
    <div className={`sidebar-role${collapsed ? " sidebar-role--collapsed" : ""}`}>
      <button
        ref={btnRef}
        type="button"
        className={`sidebar-role__btn${open ? " is-open" : ""}`}
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        aria-label={`Your role: ${title}. Show permissions`}
        title={collapsed ? title : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        {collapsed ? (
          <span className={`sidebar-role__mark tone-${roleTone(info.role)}`} aria-hidden>
            {info.label.charAt(0)}
          </span>
        ) : (
          <>
            <span className="sidebar-role__head">
              <RoleBadge role={info.role} label={info.label} />
              <span className="sidebar-role__more" aria-hidden>
                Permissions
              </span>
            </span>
            <span className="sidebar-role__summary">{info.summary}</span>
            {locked ? (
              <span className="sidebar-role__locked">Watch-only · finish setup</span>
            ) : null}
          </>
        )}
      </button>
      {open
        ? createPortal(
            <div
              ref={popRef}
              id={popId}
              className="sidebar-role__pop"
              role="dialog"
              aria-label={`${info.label} permissions`}
              style={style}
            >
              <p className="sidebar-role__pop-title">
                <RoleBadge role={info.role} label={info.label} />
                <span>{info.summary}</span>
              </p>
              {locked ? (
                <p className="sidebar-role__pop-locked">
                  Watch-only until setup is complete — open Alerts to finish setup.
                </p>
              ) : null}
              <p className="sidebar-role__pop-label">You can</p>
              <ul className="sidebar-role__pop-list">
                {info.can.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              {info.cannot ? (
                <>
                  <p className="sidebar-role__pop-label">{info.cannot.label}</p>
                  <ul className="sidebar-role__pop-list sidebar-role__pop-list--off">
                    {info.cannot.items.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
