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

/** Merchant Owner only — settlement wallet / matching / xPub writes. */
export function sessionCanEditSettlement(session: Session): boolean {
  const orgId = primaryMerchantOrgId(session);
  return orgId ? sessionIsOrgOwner(session, orgId) : false;
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

/** Owner or Administrator — set/clear another member's Cashier POS PIN. */
export function sessionCanManageMemberPosPin(
  session: Session,
  orgId: string,
): boolean {
  const role = sessionRoleOnOrg(session, orgId);
  return role === "owner" || role === "administrator";
}

export function roleLabel(role: string): string {
  if (role === "owner") return "Owner";
  if (role === "administrator") return "Administrator";
  if (role === "viewer") return "Viewer";
  if (role === "cashier") return "Cashier";
  return role;
}

/** Sidebar location badge: Merchant / Site (no structure field). */
export type LocationKind = "merchant" | "site";

export function locationKindLabel(kind: LocationKind): string {
  if (kind === "site") return "Site";
  return "Merchant";
}

export function locationKindTitle(kind: LocationKind): string {
  if (kind === "site") return "Merchant site";
  return "Merchant";
}

/**
 * Merchant membership → merchant; site-only login → site.
 * All merchants may manage sites; structure is not used.
 */
export function sessionLocationKind(session: Session): LocationKind | null {
  if (session.memberships.some((m) => m.orgType === "merchant")) {
    return "merchant";
  }
  if (session.memberships.some((m) => m.orgType === "merchant_site")) {
    return "site";
  }
  return null;
}

export function orgTypeLabel(type: string): string {
  if (type === "merchant") return "Merchant";
  if (type === "merchant_site") return "Site";
  if (type === "agent") return "Agent";
  if (type === "platform") return "Platform";
  return type;
}

/** O / A may create and manage sites under a merchant (or under a site). */
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

/**
 * All `merchant_site` orgs under a merchant root (BFS; unlimited nesting).
 * Sites under sites are included — there is no separate sub-site type.
 */
export function sitesInMerchantSubtree(
  orgs: ReadonlyArray<{ id: string; type: string; parentId?: string | null }>,
  merchantId: string,
): Array<{ id: string; type: string; parentId?: string | null }> {
  const children = new Map<string, string[]>();
  for (const o of orgs) {
    if (o.type !== "merchant_site" || !o.parentId) continue;
    const list = children.get(o.parentId);
    if (list) list.push(o.id);
    else children.set(o.parentId, [o.id]);
  }
  const byId = new Map(orgs.map((o) => [o.id, o]));
  const out: Array<{ id: string; type: string; parentId?: string | null }> = [];
  const queue = [...(children.get(merchantId) ?? [])];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const row = byId.get(id);
    if (!row || row.type !== "merchant_site") continue;
    out.push(row);
    for (const childId of children.get(id) ?? []) queue.push(childId);
  }
  return out;
}
