import type { OrgAccount } from "./api";

export function merchantSites(
  merchantId: string,
  orgs: OrgAccount[],
): OrgAccount[] {
  return orgs.filter(
    (o) => o.type === "merchant_site" && o.parentId === merchantId,
  );
}

export function parentAgentName(
  merchant: OrgAccount,
  orgs: OrgAccount[],
): string | null {
  if (!merchant.parentId) return null;
  const byId = new Map(orgs.map((o) => [o.id, o]));
  let current = byId.get(merchant.parentId);
  while (current) {
    if (current.type === "agent" || current.type === "agent_sub") {
      return current.name;
    }
    if (!current.parentId) break;
    current = byId.get(current.parentId);
  }
  return byId.get(merchant.parentId)?.name ?? merchant.parentId;
}

export const STRUCTURE_LABELS: Record<string, string> = {
  single_location: "Single location",
  multi_location: "Multi-location",
};
