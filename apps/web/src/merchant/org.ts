import type { Session } from "./api";
import { displayNetworkForPair, networkShortLabel } from "../shared/assetNetworks";

/** Prefer merchant / merchant_site membership for settings org scope. */
export function primaryMerchantOrgId(session: Session): string | null {
  const preferred = session.memberships.find(
    (m) => m.orgType === "merchant" || m.orgType === "merchant_site",
  );
  return preferred?.orgId ?? null;
}

export function sessionIsMerchantStaff(session: Session): boolean {
  return session.memberships.some(
    (m) =>
      (m.orgType === "merchant" || m.orgType === "merchant_site") &&
      ["owner", "administrator", "viewer", "cashier"].includes(m.role),
  );
}

export function truncateAddress(address: string, head = 8, tail = 6): string {
  const a = address.trim();
  if (a.length <= head + tail + 3) return a;
  return `${a.slice(0, head)}…${a.slice(-tail)}`;
}

export function formatCountdown(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const end = Date.parse(iso);
  if (!Number.isFinite(end)) return null;
  const ms = end - Date.now();
  if (ms <= 0) return "ready";
  const totalMin = Math.ceil(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}m remaining`;
  return `${h}h ${m}m remaining`;
}

export function networkLabel(network: string, asset?: string): string {
  if (asset) return displayNetworkForPair(asset, network);
  return networkShortLabel(network);
}

/** O / A / V may export CSV; cashiers cannot. */
export function sessionCanExportOrders(session: Session): boolean {
  return session.memberships.some((m) =>
    ["owner", "administrator", "viewer"].includes(m.role),
  );
}

/** O / A may open service-bill checkout; viewers read-only. */
export function sessionCanCheckoutServiceBill(session: Session): boolean {
  return session.memberships.some((m) =>
    ["owner", "administrator"].includes(m.role),
  );
}

/** O / A may manage API keys and webhooks. */
export function sessionCanManageIntegrations(session: Session): boolean {
  return session.memberships.some((m) =>
    ["owner", "administrator"].includes(m.role),
  );
}

/** O / A / V may view integrations metadata (no secrets on GET). */
export function sessionCanViewIntegrations(session: Session): boolean {
  return session.memberships.some((m) =>
    ["owner", "administrator", "viewer"].includes(m.role),
  );
}

export function sessionIsCashierOnly(session: Session): boolean {
  if (session.memberships.length === 0) return false;
  return session.memberships.every((m) => m.role === "cashier");
}

export function sessionRoleOnOrg(session: Session, orgId: string): string | null {
  return session.memberships.find((m) => m.orgId === orgId)?.role ?? null;
}

export function sessionIsOrgOwner(session: Session, orgId: string): boolean {
  return sessionRoleOnOrg(session, orgId) === "owner";
}

/** O / A / V may view org settings. */
export function sessionCanViewOrgSettings(session: Session): boolean {
  return session.memberships.some((m) =>
    ["owner", "administrator", "viewer"].includes(m.role),
  );
}

/** O / A may edit org profile fields when API supports PATCH. */
export function sessionCanEditOrgSettings(session: Session): boolean {
  return session.memberships.some((m) =>
    ["owner", "administrator"].includes(m.role),
  );
}

/** Owner only — team invite and role changes. */
export function sessionCanManageTeam(session: Session, orgId: string): boolean {
  return sessionIsOrgOwner(session, orgId);
}

export function roleLabel(role: string): string {
  if (role === "owner") return "Owner";
  if (role === "administrator") return "Administrator";
  if (role === "viewer") return "Viewer";
  if (role === "cashier") return "Cashier";
  return role;
}

export function structureLabel(structure: string | undefined): string {
  if (structure === "single_location") return "Single location";
  if (structure === "multi_location") return "Multi-location";
  return structure ?? "—";
}

/** Sidebar location badge: Multi / Single / Site. */
export type LocationKind = "multi" | "single" | "site";

export function locationKindLabel(kind: LocationKind): string {
  if (kind === "multi") return "Multi";
  if (kind === "single") return "Single";
  return "Site";
}

export function locationKindTitle(kind: LocationKind): string {
  if (kind === "multi") return "Multi-location merchant";
  if (kind === "single") return "Single-location merchant";
  return "Merchant site";
}

/**
 * Parent merchant membership wins (Multi / Single). Site-only login → Site.
 * Returns null until org structure is loaded.
 */
export function sessionLocationKind(
  session: Session,
  orgs: Array<{ id: string; structure?: string | null }> | null,
): LocationKind | null {
  const merchant = session.memberships.find((m) => m.orgType === "merchant");
  if (merchant) {
    const org = orgs?.find((o) => o.id === merchant.orgId);
    if (org?.structure === "multi_location") return "multi";
    if (org?.structure === "single_location") return "single";
    return null;
  }
  if (session.memberships.some((m) => m.orgType === "merchant_site")) {
    return "site";
  }
  return null;
}

export function orgTypeLabel(type: string): string {
  if (type === "merchant") return "Merchant";
  if (type === "merchant_site") return "Merchant (site)";
  if (type === "agent") return "Agent";
  if (type === "agent_sub") return "Agent (sub)";
  if (type === "platform") return "Platform";
  return type;
}

/** O / A may create and manage merchant sites under a multi-location parent. */
export function sessionCanManageSites(session: Session): boolean {
  return session.memberships.some((m) =>
    ["owner", "administrator"].includes(m.role),
  );
}

/** Parent merchant org id (not a site login). */
export function parentMerchantOrgId(session: Session): string | null {
  const merchant = session.memberships.find((m) => m.orgType === "merchant");
  return merchant?.orgId ?? primaryMerchantOrgId(session);
}
