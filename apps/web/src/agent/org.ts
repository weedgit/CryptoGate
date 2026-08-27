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
  const agent = session.memberships.find(
    (m) => m.orgType === "agent" || m.orgType === "agent_sub",
  );
  return agent?.orgId ?? null;
}

/** Agent Owner/Admin may invite and manage team members (C11). Viewers read-only. */
export function sessionCanManageTeam(session: Session): boolean {
  return session.memberships.some(
    (m) =>
      AGENT_TYPES.has(m.orgType ?? "") &&
      (m.role === "owner" || m.role === "administrator"),
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
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
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
