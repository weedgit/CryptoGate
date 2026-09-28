import type { OrgAccount } from "./orgApi";

type OrgTz = Pick<OrgAccount, "id" | "type" | "name" | "parentId" | "businessTimezone">;

/** Own business zone, else the parent merchant's (sites inherit). */
export function effectiveBusinessTimezone(
  org: OrgTz | null | undefined,
  orgs: readonly OrgTz[],
): string | null {
  if (!org) return null;
  if (org.businessTimezone) return org.businessTimezone;
  if (org.type !== "merchant_site" || !org.parentId) return null;
  return orgs.find((o) => o.id === org.parentId)?.businessTimezone ?? null;
}

/** Props for the Business time zone field on merchant / site edits; null hides it. */
export function businessTimezoneField(
  org: OrgTz | null | undefined,
  orgs: readonly OrgTz[],
): { value: string | null; inheritLabel: string } | null {
  if (!org || (org.type !== "merchant" && org.type !== "merchant_site")) return null;
  if (org.type === "merchant") {
    return { value: org.businessTimezone ?? null, inheritLabel: "Not set · each viewer's own zone" };
  }
  const parent = org.parentId ? orgs.find((o) => o.id === org.parentId) : undefined;
  const inherited = parent?.businessTimezone;
  return {
    value: org.businessTimezone ?? null,
    inheritLabel: inherited
      ? `Same as ${parent?.name ?? "merchant"} · ${inherited}`
      : "Same as merchant (not set)",
  };
}
