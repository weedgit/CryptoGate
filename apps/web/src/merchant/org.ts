import type { Session } from "./api";

/** Prefer merchant / merchant_site membership for settings org scope. */
export function primaryMerchantOrgId(session: Session): string | null {
  const preferred = session.memberships.find(
    (m) =>
      m.orgType === "merchant" ||
      m.orgType === "merchant_site" ||
      m.orgType == null,
  );
  return preferred?.orgId ?? session.memberships[0]?.orgId ?? null;
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

export function networkLabel(network: string): string {
  if (network === "tron") return "TRC-20";
  if (network === "ethereum") return "ERC-20";
  return network.toUpperCase();
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

export function sessionIsCashierOnly(session: Session): boolean {
  if (session.memberships.length === 0) return false;
  return session.memberships.every((m) => m.role === "cashier");
}
