import type { Session } from "./api";

const AGENT_TYPES = new Set(["agent", "agent_sub"]);

export function sessionIsAgentStaff(session: Session): boolean {
  return session.memberships.some(
    (m) =>
      AGENT_TYPES.has(m.orgType ?? "") &&
      ["owner", "administrator", "viewer"].includes(m.role),
  );
}

export function sessionIsAgentViewerOnly(session: Session): boolean {
  const agent = session.memberships.filter((m) => AGENT_TYPES.has(m.orgType ?? ""));
  if (agent.length === 0) return false;
  return agent.every((m) => m.role === "viewer");
}

/** Root agent org for this session (prefer top-level agent membership). */
export function primaryAgentOrgId(session: Session): string | null {
  const top = session.memberships.find((m) => m.orgType === "agent");
  if (top) return top.orgId;
  const sub = session.memberships.find((m) => m.orgType === "agent_sub");
  return sub?.orgId ?? null;
}

/** Agent Owner may invite and manage team members (C11). Admin/Viewer read-only. */
export function sessionCanManageTeam(session: Session): boolean {
  return session.memberships.some(
    (m) => AGENT_TYPES.has(m.orgType ?? "") && m.role === "owner",
  );
}

/** Agent Owner/Admin may onboard merchants (C6). Viewers read-only. */
export function sessionCanOnboardMerchant(session: Session): boolean {
  return session.memberships.some(
    (m) =>
      AGENT_TYPES.has(m.orgType ?? "") &&
      (m.role === "owner" || m.role === "administrator"),
  );
}

const MANAGE_ROLES = new Set(["owner", "administrator"]);

type OrgRef = { id: string; parentId: string | null };

function collectAncestorOrgIds(
  org: { parentId: string | null },
  orgs: OrgRef[],
): string[] {
  const byId = new Map(orgs.map((o) => [o.id, o]));
  const ids: string[] = [];
  let parentId = org.parentId;
  while (parentId) {
    ids.push(parentId);
    parentId = byId.get(parentId)?.parentId ?? null;
  }
  return ids;
}

/**
 * Suspend, delete, and commercial edits — direct children only.
 * Top-level agent memberships cannot manage grandchildren (e.g. merchants under a sub-agent).
 */
export function sessionCanManageDirectChild(
  session: Session,
  org: { parentId: string | null; type: string },
  orgs: OrgRef[] = [],
): boolean {
  if (!org.parentId || org.type === "merchant_site") return false;
  const parentMembership = session.memberships.find(
    (m) =>
      m.orgId === org.parentId &&
      AGENT_TYPES.has(m.orgType ?? "") &&
      MANAGE_ROLES.has(m.role),
  );
  if (!parentMembership) return false;

  if (orgs.length > 0) {
    const ancestors = collectAncestorOrgIds(org, orgs);
    for (const m of session.memberships) {
      if (m.orgType !== "agent" || !MANAGE_ROLES.has(m.role)) continue;
      if (org.parentId === m.orgId) continue;
      if (ancestors.includes(m.orgId)) return false;
    }
  }

  return true;
}

/** Onboard children under this agent / sub-agent org (Owner/Admin on that org). */
export function sessionCanManageOrgAsParent(
  session: Session,
  orgId: string,
): boolean {
  return session.memberships.some(
    (m) =>
      m.orgId === orgId &&
      AGENT_TYPES.has(m.orgType ?? "") &&
      MANAGE_ROLES.has(m.role),
  );
}

export function orgTypeLabel(type: string): string {
  if (type === "agent") return "Agent";
  if (type === "agent_sub") return "Agent (sub)";
  if (type === "merchant") return "Merchant";
  if (type === "merchant_site") return "Merchant (site)";
  return type;
}

export function formatUsd(amount: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return amount;
  return `${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} USD`;
}

export function formatShortDate(iso: string): string {
  const d = Date.parse(iso);
  if (!Number.isFinite(d)) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}
