import type { Session } from "./api";

export function sessionIsPlatformStaff(session: Session): boolean {
  return session.memberships.some(
    (m) =>
      m.orgType === "platform" &&
      ["owner", "administrator", "viewer"].includes(m.role),
  );
}

export function sessionIsPlatformViewerOnly(session: Session): boolean {
  const platform = session.memberships.filter((m) => m.orgType === "platform");
  if (platform.length === 0) return false;
  return platform.every((m) => m.role === "viewer");
}

/** Platform Owner / Administrator — onboard, bills, maintenance, org lifecycle. Not Viewer. */
export function sessionCanManagePlatform(session: Session): boolean {
  return session.memberships.some(
    (m) =>
      m.orgType === "platform" &&
      (m.role === "owner" || m.role === "administrator"),
  );
}

/** @deprecated Prefer sessionCanManagePlatform for non-billing writes. */
export function sessionCanIssueServiceBill(session: Session): boolean {
  return sessionCanManagePlatform(session);
}

export function sessionIsPlatformOwner(session: Session): boolean {
  return session.memberships.some(
    (m) => m.orgType === "platform" && m.role === "owner",
  );
}

/** Display label for the highest platform membership on this session. */
export function platformRoleLabel(session: Session): string {
  if (sessionIsPlatformOwner(session)) return "Owner";
  if (sessionIsPlatformViewerOnly(session)) return "Viewer";
  return "Administrator";
}

export type PlatformRoleKey = "owner" | "administrator" | "viewer";

export function platformRoleKey(session: Session): PlatformRoleKey {
  if (sessionIsPlatformOwner(session)) return "owner";
  if (sessionIsPlatformViewerOnly(session)) return "viewer";
  return "administrator";
}

/** Single-letter mark for role avatar (not a human portrait). */
export function platformRoleMark(role: PlatformRoleKey): string {
  if (role === "owner") return "O";
  if (role === "viewer") return "V";
  return "A";
}

export function orgTypeLabel(type: string): string {
  if (type === "agent") return "Agent";
  if (type === "agent_sub") return "Agent (sub)";
  if (type === "merchant") return "Merchant";
  if (type === "merchant_site") return "Merchant (site)";
  if (type === "platform") return "Platform";
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
