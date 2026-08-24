import type { OrgAccount } from "./api";

export function merchantSites(
  merchantId: string,
  orgs: OrgAccount[],
): OrgAccount[] {
  return orgs.filter(
    (o) => o.type === "merchant_site" && o.parentId === merchantId,
  );
}
