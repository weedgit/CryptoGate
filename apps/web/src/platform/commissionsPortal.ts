import { createContext, useContext } from "react";
import type { OrgAccount } from "./api";

/**
 * Non-platform scope for the Platform commission pages (Agent portal):
 * payouts filtered to one payee; no generate / mark paid; payee may confirm receipt.
 */
export type CommissionsPortal = {
  kind: "agent";
  route: (path?: string) => string;
  payeeOrgId: string | null;
  readOnly: boolean;
  canConfirmReceipt: boolean;
  peekOrgs: () => OrgAccount[] | null;
  getOrgs: () => Promise<OrgAccount[]>;
};

export const CommissionsPortalContext = createContext<CommissionsPortal | null>(
  null,
);

export function useCommissionsPortal(): CommissionsPortal | null {
  return useContext(CommissionsPortalContext);
}
