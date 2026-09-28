import type { OrgMember } from "../api";
import type { DashboardReports } from "../../shared/dashboardApi";

export type CashierReportRow = DashboardReports["byCreator"][number];

export type CashierRow = {
  key: string;
  userId: string | null;
  email: string | null;
  /** First + last name from the member profile, when known. */
  name: string | null;
  avatarUrl: string | null;
  count: number;
  volumeUsd: number;
  /** null = unknown (member list not loaded, creator is not a cashier member, or older API). */
  posPin: boolean | null;
  paused: boolean;
};

/**
 * Report creators (sales in period) merged with cashier members, so idle cashiers
 * and POS PIN status are visible. Busiest first; idle cashiers by email.
 */
export function mergeCashierRows(
  reportRows: ReadonlyArray<CashierReportRow>,
  members: ReadonlyArray<OrgMember> | null,
): CashierRow[] {
  const pinOf = (m: OrgMember | undefined): boolean | null =>
    typeof m?.posPinConfigured === "boolean" ? m.posPinConfigured : null;
  const cashiers = new Map<string, OrgMember>();
  const people = new Map<string, OrgMember>();
  for (const m of members ?? []) {
    if (m.role === "cashier" && !cashiers.has(m.userId)) cashiers.set(m.userId, m);
    const known = people.get(m.userId);
    if (!known || (!known.avatarUrl && m.avatarUrl)) people.set(m.userId, m);
  }
  const nameOf = (m: OrgMember | undefined): string | null => {
    const full = [m?.firstName, m?.lastName]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(" ");
    return full || null;
  };

  const rows: CashierRow[] = [];
  const seen = new Set<string>();
  for (const r of reportRows) {
    if (!r.userId && !r.email) continue;
    const member = r.userId ? cashiers.get(r.userId) : undefined;
    const person = r.userId ? people.get(r.userId) : undefined;
    if (r.userId) seen.add(r.userId);
    rows.push({
      key: r.userId ?? r.email ?? "",
      userId: r.userId,
      email: r.email ?? member?.email ?? null,
      name: nameOf(person),
      avatarUrl: person?.avatarUrl ?? null,
      count: r.count,
      volumeUsd: r.volumeUsd,
      posPin: pinOf(member),
      paused: member?.status === "paused",
    });
  }
  for (const m of cashiers.values()) {
    if (seen.has(m.userId)) continue;
    rows.push({
      key: m.userId,
      userId: m.userId,
      email: m.email,
      name: nameOf(people.get(m.userId) ?? m),
      avatarUrl: people.get(m.userId)?.avatarUrl ?? m.avatarUrl ?? null,
      count: 0,
      volumeUsd: 0,
      posPin: pinOf(m),
      paused: m.status === "paused",
    });
  }

  return rows.sort(
    (a, b) =>
      b.volumeUsd - a.volumeUsd ||
      b.count - a.count ||
      (a.email ?? "").localeCompare(b.email ?? ""),
  );
}
