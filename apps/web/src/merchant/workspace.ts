import { createContext, useContext } from "react";
import type { Session } from "./api";

type Membership = Session["memberships"][number];

/** One merchant/site membership the user can work in (org + role). */
export type MerchantWorkspace = {
  orgId: string;
  orgType: "merchant" | "merchant_site";
  role: string;
};

const STORAGE_PREFIX = "paymentgate.merchant.workspace.";

function isWorkspaceMembership(m: Membership): boolean {
  return m.orgType === "merchant" || m.orgType === "merchant_site";
}

/** Switchable workspaces; paused memberships only when nothing is active. */
export function sessionWorkspaces(session: Session): MerchantWorkspace[] {
  const rows = session.memberships.filter(isWorkspaceMembership);
  const active = rows.filter((m) => m.status !== "paused");
  return (active.length > 0 ? active : rows).map((m) => ({
    orgId: m.orgId,
    orgType: m.orgType as MerchantWorkspace["orgType"],
    role: m.role,
  }));
}

/** Back office before terminal, merchant before site — matches the single-role default. */
export function defaultWorkspaceOrgId(workspaces: ReadonlyArray<MerchantWorkspace>): string | null {
  const rank = (w: MerchantWorkspace) =>
    (w.role === "cashier" ? 2 : 0) + (w.orgType === "merchant_site" ? 1 : 0);
  let best: MerchantWorkspace | null = null;
  for (const w of workspaces) {
    if (!best || rank(w) < rank(best)) best = w;
  }
  return best?.orgId ?? null;
}

export function resolveWorkspaceOrgId(
  workspaces: ReadonlyArray<MerchantWorkspace>,
  preferredOrgId: string | null,
): string | null {
  if (preferredOrgId && workspaces.some((w) => w.orgId === preferredOrgId)) {
    return preferredOrgId;
  }
  return defaultWorkspaceOrgId(workspaces);
}

/**
 * Session narrowed to one workspace membership so role/org helpers follow the
 * selection. UI-only narrowing — the API still authorizes on all memberships.
 */
export function scopeSessionToWorkspace(session: Session, orgId: string | null): Session {
  if (!orgId || sessionWorkspaces(session).length < 2) return session;
  const memberships = session.memberships.filter((m) => m.orgId === orgId);
  if (memberships.length === 0) return session;
  return { ...session, memberships };
}

/**
 * Pages hand back the scoped session with edits (same memberships array);
 * restore the full list. Fresh server sessions carry their own memberships.
 */
export function unscopeSession(next: Session, scoped: Session, full: Session): Session {
  if (scoped === full || next.memberships !== scoped.memberships) return next;
  return { ...next, memberships: full.memberships };
}

export function readStoredWorkspace(userId: string): string | null {
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + userId);
  } catch {
    return null;
  }
}

export function storeWorkspace(userId: string, orgId: string): void {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + userId, orgId);
  } catch {
    /* private mode */
  }
}

export type WorkspaceSwitcher = {
  workspaces: MerchantWorkspace[];
  activeOrgId: string | null;
  switchTo: (orgId: string) => void;
};

export const WorkspaceSwitcherContext = createContext<WorkspaceSwitcher | null>(null);

export function useWorkspaceSwitcher(): WorkspaceSwitcher | null {
  return useContext(WorkspaceSwitcherContext);
}

/**
 * Org to filter dashboards/lists by. Only set with several workspaces — the API
 * otherwise unions every membership (e.g. site view showing HQ-wide numbers).
 */
export function useWorkspaceScopeOrgId(orgId: string | null): string | null {
  const switcher = useWorkspaceSwitcher();
  return switcher && switcher.workspaces.length > 1 ? orgId : null;
}

export function workspaceOrderScope(
  scopeOrgId: string | null,
): { orgId?: string; includeSubtree?: boolean } {
  return scopeOrgId ? { orgId: scopeOrgId, includeSubtree: true } : {};
}
